import { PropertyResolver } from "./propertyResolver";
import * as AST from "../types/ast";
import * as IR from "../types/ir";
import type { CompilerError } from "../types/errors";

export class Hydrator {
    private compilerErrors: CompilerError[] = [];
    private propertyResolver: PropertyResolver;

    constructor() {
        this.propertyResolver = new PropertyResolver(this.pushError.bind(this));
    }

    public hydrate(document: AST.DocumentNode): {
        document: IR.Block;
        errors: CompilerError[];
    } {
        this.compilerErrors = [];
        this.propertyResolver.reset();

        const rootBlock: IR.Block = {
            type: "BLOCK",
            props: {},
            line: document.line,
            column: document.column,
            children: this.transformNodeList(document.children),
        };

        return { document: rootBlock, errors: this.compilerErrors };
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
                output.push(this.transformSingleNode(node, backpack));
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
            this.pushError(
                "Invariant violation: SET directive received a target.",
                annotation.line,
                annotation.column,
            );
        }
        /* v8 ignore stop -- @preserve */
        const resolved = this.propertyResolver.resolveProperties(annotation.properties);
        const { blockProps } = this.propertyResolver.routePropertiesByScope(resolved);
        const remainingSiblings = allNodes.slice(currentIndex + 1);
        return {
            type: "BLOCK",
            props: blockProps,
            line: annotation.line,
            column: annotation.column,
            children: this.transformNodeList(remainingSiblings, backpack),
        };
    }

    private processNormalDirective(
        annotation: AST.AnnotationNode,
        backpack: IR.ResolvedProps,
    ): IR.Node | null {
        const targetProps = this.propertyResolver.resolveProperties(annotation.properties);

        for (const prop of annotation.properties) {
            if (prop.key === "class") continue;

            if (prop.toggle === "minus") {
                delete backpack[prop.key];
            } else if (prop.toggle === "plus" && targetProps[prop.key]) {
                backpack[prop.key] = targetProps[prop.key];
            }
        }

        if (annotation.target) {
            return this.transformSingleNode(annotation.target, {
                ...backpack,
                ...targetProps,
            });
        }
        return null;
    }

    private transformSingleNode(node: AST.TargetNode, activeProps: IR.ResolvedProps): IR.Node {
        const { blockProps, inlineProps } =
            this.propertyResolver.routePropertiesByScope(activeProps);

        switch (node.type) {
            case AST.NodeType.BLOCK: {
                return this.transformBlockNode(node, blockProps, activeProps);
            }
            case AST.NodeType.TEXT: {
                return {
                    type: "TEXT",
                    props: inlineProps,
                    line: node.line,
                    column: node.column,
                    content: node.content,
                } as IR.Text;
            }
        }
    }
    private transformBlockNode(
        node: AST.BlockNode,
        blockProps: IR.ResolvedProps,
        activeProps: IR.ResolvedProps,
    ): IR.Block {
        const propsForChildren = { ...activeProps };
        delete propsForChildren.indent;
        const children = this.transformNodeList(node.children, propsForChildren);

        if (blockProps.indent) {
            this.applyLiteralIndentation(children, blockProps.indent);
        }

        return {
            type: "BLOCK",
            props: blockProps,
            line: node.line,
            column: node.column,
            children,
        };
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

    private pushError(message: string, line: number, column: number) {
        this.compilerErrors.push({
            type: "HYDRATOR",
            message,
            line,
            column,
        });
    }
}
