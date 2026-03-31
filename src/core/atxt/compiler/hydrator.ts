import { PropertyResolver } from "./propertyResolver";
import {
    COMPILER_DEFAULTS,
    getKindDefinition,
    getPropertyDefinition,
} from "../domain/propertyDefinitions";
import { PropertyContext } from "./propertyContext";
import * as AST from "../types/ast";
import * as IR from "../types/ir";
import type { CompilerError } from "../types/errors";

export class Hydrator {
    private compilerErrors: CompilerError[] = [];
    private propertyResolver: PropertyResolver;
    private nodeMap: Map<string, IR.Node> = new Map();
    private idCounter = 0;

    constructor() {
        this.propertyResolver = new PropertyResolver(this.pushError.bind(this));
    }

    public hydrate(document: AST.DocumentNode): {
        document: IR.IRDocument;
        errors: CompilerError[];
    } {
        this.compilerErrors = [];
        this.propertyResolver.reset();
        this.nodeMap = new Map();
        this.idCounter = 0;

        const rootBlock: IR.Block = {
            id: this.nextId(),
            type: "BLOCK",
            props: new Map(),
            classes: [],
            ownProps: new Map(),
            line: document.line,
            column: document.column,
            children: this.transformNodeList(document.children, COMPILER_DEFAULTS),
        };

        this.nodeMap.set(rootBlock.id, rootBlock);

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
        return (this.idCounter++).toString(36);
    }

    private register(node: IR.Node): IR.Node {
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

            if (node.type === AST.NodeType.NEWLINE) {
                output.push(this.makeNewlineNode(node));
                continue;
            }

            if (node.type !== AST.NodeType.ANNOTATION) {
                output.push(this.transformBareNode(node, propertyContext));
                continue;
            }

            switch (node.directive) {
                case "SET":
                    const blockWrapper = this.processSetDirective(node, nodes, i, propertyContext);
                    output.push(blockWrapper);
                    return output;
                case "DEFINE":
                    this.propertyResolver.defineClass(node);
                    break;
                case "NORMAL":
                    const normalNode = this.processNormalDirective(node, propertyContext);
                    if (normalNode) output.push(normalNode);
                    break;
            }
        }

        return output;
    }

    private makeNewlineNode(node: AST.NewlineNode): IR.Newline {
        const newline: IR.Newline = {
            id: this.nextId(),
            type: "NEWLINE",
            line: node.line,
            column: node.column,
        };
        this.nodeMap.set(newline.id, newline);
        return newline;
    }

    private processSetDirective(
        annotation: AST.AnnotationNode,
        allNodes: AST.BlockContentNode[],
        currentIndex: number,
        propertyContext: PropertyContext,
    ): IR.Block {
        /* v8 ignore start -- @preserve */
        if (annotation.target !== null) {
            this.pushErrorAt("Invariant violation: SET directive received a target.", annotation);
        }
        /* v8 ignore stop -- @preserve */
        const annotationResult = this.propertyResolver.resolveProperties(annotation.properties);
        const { blockProps, inlineProps } = this.propertyResolver.routePropertiesByScope(
            annotationResult.props,
        );
        const remainingSiblings = allNodes.slice(currentIndex + 1);
        const block: IR.Block = {
            id: this.nextId(),
            type: "BLOCK",
            props: blockProps,
            classes: annotationResult.classes,
            ownProps: annotationResult.directProps,
            line: annotation.line,
            column: annotation.column,
            children: this.transformNodeList(
                remainingSiblings,
                propertyContext.snapshotWith(inlineProps),
            ),
        };
        return this.register(block) as IR.Block;
    }

    private processNormalDirective(
        annotation: AST.AnnotationNode,
        propertyContext: PropertyContext,
    ): IR.Node | null {
        const annotationResult = this.propertyResolver.resolveProperties(annotation.properties);

        for (const prop of annotation.properties) {
            if (prop.key === "class") {
                if (prop.toggle === "plus") {
                    const classProps = this.propertyResolver.resolveClassByName(prop.value);
                    if (classProps) propertyContext.pushClass(prop.value, classProps);
                } else if (prop.toggle === "minus") {
                    const className = propertyContext.peek("class");
                    if (!className) {
                        this.pushErrorAt(
                            "'-class' toggle has no matching '+class' in the current scope.",
                            prop,
                        );
                        continue;
                    }
                    const classProps = this.propertyResolver.resolveClassByName(className);
                    /* v8 ignore next -- @preserve */
                    if (!classProps)
                        throw new Error(
                            `Invariant violation: class '${className}' in PropertyContext but not in registry.`,
                        );
                    propertyContext.popClass(classProps);
                }
                continue;
            }

            if (prop.toggle === "minus") {
                propertyContext.pop(prop.key);
            } else if (prop.toggle === "plus" && annotationResult.props.has(prop.key)) {
                propertyContext.push(prop.key, annotationResult.props.get(prop.key)!);
            }
        }

        if (!annotation.target) return null;

        const activeProps = propertyContext.snapshotWith(annotationResult.props);
        const { blockProps } = this.propertyResolver.routePropertiesByScope(activeProps);

        return this.transformBlockNode(
            annotation.target,
            blockProps,
            activeProps,
            annotationResult.classes,
            annotationResult.directProps,
        );
    }

    private transformBareNode(
        node: AST.BlockNode | AST.TextNode,
        propertyContext: PropertyContext,
    ): IR.Node {
        const activeProps = propertyContext.snapshot();
        const { blockProps, inlineProps } =
            this.propertyResolver.routePropertiesByScope(activeProps);

        switch (node.type) {
            case AST.NodeType.BLOCK: {
                return this.transformBlockNode(node, blockProps, activeProps);
            }
            case AST.NodeType.TEXT: {
                const text: IR.Text = {
                    id: this.nextId(),
                    type: "TEXT",
                    props: inlineProps,
                    classes: [],
                    ownProps: new Map(),
                    line: node.line,
                    column: node.column,
                    content: node.content,
                };
                return this.register(text);
            }
        }
    }

    private transformBlockNode(
        node: AST.BlockNode,
        blockProps: IR.ResolvedProps,
        activeProps: IR.ResolvedProps,
        classes: string[] = [],
        directProps: IR.ResolvedProps = new Map(),
    ): IR.Block {
        const { inlineProps: propsForChildren } =
            this.propertyResolver.routePropertiesByScope(activeProps);
        const children = this.transformNodeList(node.children, propsForChildren);

        this.resolveKind(blockProps, children, node);

        const block: IR.Block = {
            id: this.nextId(),
            type: "BLOCK",
            props: blockProps,
            classes,
            ownProps: directProps,
            line: node.line,
            column: node.column,
            children,
        };
        return this.register(block) as IR.Block;
    }

    private resolveKind(
        blockProps: IR.ResolvedProps,
        children: IR.Node[],
        node: AST.BlockNode,
    ): void {
        if (children.length === 0) return;

        const isLeaf = children.every((c) => c.type === "TEXT" || c.type === "NEWLINE");
        const explicitKind = blockProps.get("kind");

        if (!explicitKind) {
            const isContainer = [...blockProps.keys()].some(
                (key) => getPropertyDefinition(key)?.container === true,
            );
            if (isLeaf && !isContainer) blockProps.set("kind", "paragraph");
        }

        const kindDef = explicitKind ? getKindDefinition(explicitKind) : null;
        if (kindDef && kindDef.leafCompatible && !isLeaf) {
            this.pushErrorAt(
                `kind '${explicitKind}' is only valid on leaf blocks but contains child blocks.`,
                node,
            );
        }
    }

    /* v8 ignore start -- @preserve */
    private pushErrorAt(message: string, node: AST.ASTNode) {
        this.pushError(message, node.line, node.column);
    }
    /* v8 ignore stop -- @preserve */

    private pushError(message: string, line: number, column: number) {
        this.compilerErrors.push({
            type: "HYDRATOR",
            message,
            line,
            column,
        });
    }
}
