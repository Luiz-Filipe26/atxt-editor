import { PropertyResolver, type ResolvedResult } from "./propertyResolver";
import { getKindDefinition, getPropertyDefinition } from "../domain/propertyDefinitions";
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
            props: {},
            classes: [],
            inlineProps: {},
            line: document.line,
            column: document.column,
            children: this.transformNodeList(document.children),
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
        inheritedProps: IR.ResolvedProps = {},
    ): IR.Node[] {
        const output: IR.Node[] = [];
        const backpack: IR.ResolvedProps = { ...inheritedProps };

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.type !== AST.NodeType.ANNOTATION) {
                output.push(this.transformBareNode(node, backpack));
                continue;
            }

            switch (node.directive) {
                case "SET":
                    const blockWrapper = this.processSetDirective(node, nodes, i, backpack);
                    output.push(blockWrapper);
                    return output;
                case "DEFINE":
                    this.propertyResolver.defineClass(node);
                    break;
                case "NORMAL":
                    const normalNode = this.processNormalDirective(node, backpack);
                    if (normalNode) output.push(normalNode);
                    break;
            }
        }

        return output;
    }

    private processSetDirective(
        annotation: AST.AnnotationNode,
        allNodes: AST.BlockContentNode[],
        currentIndex: number,
        backpack: IR.ResolvedProps,
    ): IR.Block {
        /* v8 ignore start -- @preserve */
        if (annotation.target !== null) {
            this.pushErrorAt("Invariant violation: SET directive received a target.", annotation);
        }
        /* v8 ignore stop -- @preserve */
        const annotationResult = this.propertyResolver.resolveProperties(annotation.properties);
        const { blockProps } = this.propertyResolver.routePropertiesByScope(annotationResult.props);
        const remainingSiblings = allNodes.slice(currentIndex + 1);
        const block: IR.Block = {
            id: this.nextId(),
            type: "BLOCK",
            props: blockProps,
            classes: annotationResult.classes,
            inlineProps: annotationResult.directProps,
            line: annotation.line,
            column: annotation.column,
            children: this.transformNodeList(remainingSiblings, backpack),
        };
        return this.register(block) as IR.Block;
    }

    private processNormalDirective(
        annotation: AST.AnnotationNode,
        backpack: IR.ResolvedProps,
    ): IR.Node | null {
        const annotationResult = this.propertyResolver.resolveProperties(annotation.properties);

        for (const prop of annotation.properties) {
            if (prop.key === "class") continue;

            if (prop.toggle === "minus") {
                delete backpack[prop.key];
            } else if (prop.toggle === "plus" && annotationResult.props[prop.key]) {
                backpack[prop.key] = annotationResult.props[prop.key];
            }
        }

        if (annotation.target) {
            return this.transformAnnotationTarget(
                annotation.target,
                { ...backpack, ...annotationResult.props },
                annotationResult,
            );
        }
        return null;
    }

    private transformAnnotationTarget(
        node: AST.TargetNode,
        activeProps: IR.ResolvedProps,
        annotationResult: ResolvedResult,
    ): IR.Node {
        const { blockProps } = this.propertyResolver.routePropertiesByScope(activeProps);

        switch (node.type) {
            case AST.NodeType.BLOCK: {
                return this.transformBlockNode(
                    node,
                    blockProps,
                    activeProps,
                    annotationResult.classes,
                    annotationResult.directProps,
                );
            }
            /* v8 ignore next 2 -- @preserve */
            default:
                throw new Error(`Invariant violation: annotation target is not a BLOCK.`);
        }
    }

    private transformBareNode(node: AST.TargetNode, activeProps: IR.ResolvedProps): IR.Node {
        const { blockProps, inlineProps: scopedActiveInline } =
            this.propertyResolver.routePropertiesByScope(activeProps);

        switch (node.type) {
            case AST.NodeType.BLOCK: {
                return this.transformBlockNode(node, blockProps, activeProps);
            }
            case AST.NodeType.TEXT: {
                const text: IR.Text = {
                    id: this.nextId(),
                    type: "TEXT",
                    props: scopedActiveInline,
                    classes: [],
                    inlineProps: {},
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
        directProps: IR.ResolvedProps = {},
    ): IR.Block {
        const { inlineProps: propsForChildren } =
            this.propertyResolver.routePropertiesByScope(activeProps);
        const children = this.transformNodeList(node.children, propsForChildren);

        if (blockProps.indent) {
            this.applyLiteralIndentation(children, blockProps.indent);
        }

        this.resolveKind(blockProps, children, node);

        const block: IR.Block = {
            id: this.nextId(),
            type: "BLOCK",
            props: blockProps,
            classes,
            inlineProps: directProps,
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

        const isLeaf = children.every((c) => c.type === "TEXT");
        const explicitKind = blockProps["kind"];

        if (!explicitKind) {
            const isContainer = Object.keys(blockProps).some(
                (key) => getPropertyDefinition(key)?.container === true,
            );
            if (isLeaf && !isContainer) blockProps["kind"] = "paragraph";
        }

        const kindDef = getKindDefinition(explicitKind);
        if (kindDef && kindDef.leafCompatible && !isLeaf) {
            this.pushErrorAt(
                `kind '${explicitKind}' is only valid on leaf blocks but contains child blocks.`,
                node,
            );
        }
    }

    private applyLiteralIndentation(children: IR.Node[], indentValue: string): void {
        const spacesCount = parseInt(indentValue, 10);
        if (isNaN(spacesCount) || spacesCount <= 0) return;
        const literalSpaces = " ".repeat(spacesCount);

        const allTexts = this.collectTextNodes(children);
        for (let i = 0; i < allTexts.length; i++) {
            const current = allTexts[i];
            const isLineStart = i === 0 || allTexts[i - 1].line! < current.line!;
            if (isLineStart) {
                current.content = literalSpaces + current.content;
            }
        }
    }

    private collectTextNodes(children: IR.Node[]): IR.Text[] {
        const result: IR.Text[] = [];
        for (const child of children) {
            if (child.type === "BLOCK") {
                result.push(...this.collectTextNodes(child.children));
            } else {
                result.push(child);
            }
        }
        return result;
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
