import { PropertyResolver } from "./propertyResolver";
import {
    COMPILER_DEFAULTS,
    getKindDefinition,
    getPropertyDefinition,
} from "../domain/propertyDefinitions";
import { PropertyContext } from "./propertyContext";
import * as AST from "../types/ast";
import * as IR from "../types/ir";
import { CompilerErrorType, type CompilerError } from "../types/errors";
import { buildBlockNode, buildTextNode, buildNewlineNode, type BuildBlockArgs } from "./irBuilders";
import type { SourceLocation } from "../types/location";

export interface HydrateResult {
    document: IR.IRDocument;
    errors: CompilerError[];
}

interface TransformBlockArgs {
    node: AST.BlockNode;
    blockProps: IR.ResolvedProps;
    activeProps: IR.ResolvedProps;
    classes?: string[];
    ownProps?: IR.ResolvedProps;
}

export class Hydrator {
    private compilerErrors: CompilerError[] = [];
    private propertyResolver: PropertyResolver;
    private nodeMap: Map<string, IR.Node> = new Map();

    private constructor() {
        this.propertyResolver = new PropertyResolver(this.pushError.bind(this));
    }

    public static hydrate(document: AST.DocumentNode): HydrateResult {
        return new Hydrator().hydrate(document);
    }

    private hydrate(document: AST.DocumentNode): HydrateResult {
        const rootBlock = this.register(
            buildBlockNode({
                source: document,
                id: this.nextId(),
                props: new Map(),
                children: this.transformNodeList(document.children, COMPILER_DEFAULTS),
            }),
        );
        return {
            document: {
                root: rootBlock,
                nodeMap: this.nodeMap,
                classDefinitions: this.propertyResolver.getClassDefinitions(),
            },
            errors: this.compilerErrors,
        };
    }

    private nextId(): string {
        return crypto.randomUUID();
    }

    private register<T extends IR.Node>(node: T): T {
        this.nodeMap.set(node.id, node);
        return node;
    }

    private transformNodeList(
        nodes: AST.BlockContentNode[],
        inheritedProps: IR.ResolvedProps = new Map(),
    ): IR.Node[] {
        const output: IR.Node[] = [];
        const propertyContext = new PropertyContext(inheritedProps);

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            if (node.type === AST.NodeType.Newline) {
                output.push(this.register(buildNewlineNode(node, this.nextId())));
                continue;
            }

            if (node.type !== AST.NodeType.Annotation) {
                output.push(this.transformBareNode(node, propertyContext));
                continue;
            }

            switch (node.directive) {
                case "SET": {
                    output.push(
                        this.processSetDirective(node, nodes.slice(i + 1), propertyContext),
                    );
                    return output;
                }
                case "DEFINE":
                    this.propertyResolver.defineClass(node);
                    break;
                case "NORMAL": {
                    const normalNode = this.processNormalDirective(node, propertyContext);
                    if (normalNode) output.push(normalNode);
                    break;
                }
            }
        }

        return output;
    }

    private processSetDirective(
        annotation: AST.AnnotationNode,
        remainingSiblings: AST.BlockContentNode[],
        propertyContext: PropertyContext,
    ): IR.Block {
        const { props, classes, ownProps } = this.propertyResolver.resolveProperties(
            annotation.properties,
        );
        const { blockProps, inlineProps } = this.propertyResolver.partitionByScope(props);
        const children = this.transformNodeList(
            remainingSiblings,
            propertyContext.snapshotWith(inlineProps),
        );

        return this.finalizeBlock({
            source: annotation,
            props: blockProps,
            classes,
            ownProps,
            children,
        });
    }

    private finalizeBlock(args: Omit<BuildBlockArgs, "id">): IR.Block {
        const kind = this.resolveKind(args.props, args.children, args.source);
        if (kind) args.props.set("kind", kind);
        return this.register(buildBlockNode({ ...args, id: this.nextId() }));
    }

    private processNormalDirective(
        annotation: AST.AnnotationNode,
        propertyContext: PropertyContext,
    ): IR.Node | null {
        const { props, classes, ownProps } = this.propertyResolver.resolveProperties(
            annotation.properties,
        );
        this.applyTogglesToContext(annotation.properties, props, propertyContext);

        if (!annotation.target) return null;

        const activeProps = propertyContext.snapshotWith(props);
        const { blockProps } = this.propertyResolver.partitionByScope(activeProps);

        return this.transformBlockNode({
            node: annotation.target,
            blockProps,
            activeProps,
            classes,
            ownProps,
        });
    }

    private applyTogglesToContext(
        properties: AST.PropertyNode[],
        resolvedProps: IR.ResolvedProps,
        propertyContext: PropertyContext,
    ): void {
        for (const prop of properties) {
            if (prop.key === "class") {
                this.applyClassToggle(prop, propertyContext);
                continue;
            }
            if (prop.toggle === AST.PropertyToggle.Minus) {
                propertyContext.pop(prop.key);
            } else if (prop.toggle === AST.PropertyToggle.Plus && resolvedProps.has(prop.key)) {
                propertyContext.push(prop.key, resolvedProps.get(prop.key)!);
            }
        }
    }

    private applyClassToggle(prop: AST.PropertyNode, propertyContext: PropertyContext): void {
        if (prop.toggle === AST.PropertyToggle.Plus) {
            const classProps = this.propertyResolver.resolveClass(prop.value);
            if (classProps) propertyContext.pushClass(prop.value, classProps);
        } else if (prop.toggle === AST.PropertyToggle.Minus) {
            const className = propertyContext.peek("class");
            if (!className) {
                this.pushError(
                    "'-class' toggle has no matching '+class' in the current scope.",
                    prop,
                );
                return;
            }
            const classProps = this.propertyResolver.resolveClass(className);
            /* v8 ignore next -- @preserve */
            if (!classProps)
                throw new Error(
                    `Invariant violation: class '${className}' in PropertyContext but not in registry.`,
                );
            propertyContext.popClass(classProps);
        }
    }

    private transformBareNode(
        node: AST.BlockNode | AST.TextNode,
        propertyContext: PropertyContext,
    ): IR.Node {
        const activeProps = propertyContext.snapshot();
        const { blockProps, inlineProps } = this.propertyResolver.partitionByScope(activeProps);

        switch (node.type) {
            case AST.NodeType.Block:
                return this.transformBlockNode({ node, blockProps, activeProps });
            case AST.NodeType.Text:
                return this.register(buildTextNode(node, this.nextId(), inlineProps, node.content));
        }
    }

    private transformBlockNode(args: TransformBlockArgs): IR.Block {
        const { node, blockProps, activeProps, classes, ownProps } = args;
        const { inlineProps: propsForChildren } =
            this.propertyResolver.partitionByScope(activeProps);
        const children = this.transformNodeList(node.children, propsForChildren);

        return this.finalizeBlock({ source: node, props: blockProps, classes, ownProps, children });
    }

    private resolveKind(
        blockProps: IR.ResolvedProps,
        children: IR.Node[],
        source: SourceLocation,
    ): string | null {
        if (children.length === 0) return null;

        const isLeaf = children.every(
            (c) => c.type === IR.NodeType.Text || c.type === IR.NodeType.Newline,
        );
        const explicitKind = blockProps.get("kind");

        if (!explicitKind) {
            const isContainer = [...blockProps.keys()].some(
                (key) => getPropertyDefinition(key)?.container === true,
            );
            if (isLeaf && !isContainer) return "paragraph";
        }

        const kindDef = explicitKind ? getKindDefinition(explicitKind) : null;
        if (kindDef && kindDef.leafCompatible && !isLeaf) {
            this.pushError(
                `kind '${explicitKind}' is only valid on leaf blocks but contains child blocks.`,
                source,
            );
        }

        return null;
    }

    private pushError(message: string, source: { line: number; column: number }) {
        this.compilerErrors.push({
            type: CompilerErrorType.Hydrator,
            message,
            line: source.line,
            column: source.column,
        });
    }
}
