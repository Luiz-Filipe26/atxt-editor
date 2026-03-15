import { PropertyResolver } from "./propertyResolver";
import {
    NodeType,
    type DocumentNode,
    type AnnotationNode,
    type TargetNode,
    type BlockContentNode,
} from "../types/ast";
import type { IRNode, IRBlock, IRText, ResolvedProps } from "../types/ir";
import type { CompilerError } from "../types/errors";

export class Hydrator {
    private compilerErrors: CompilerError[] = [];
    private propertyResolver: PropertyResolver;

    constructor() {
        this.propertyResolver = new PropertyResolver(this.pushError.bind(this));
    }

    public hydrate(document: DocumentNode): {
        document: IRBlock;
        errors: CompilerError[];
    } {
        this.compilerErrors = [];
        this.propertyResolver.reset();

        const rootBlock: IRBlock = {
            type: "BLOCK",
            props: {},
            line: document.line,
            column: document.column,
            children: this.transformNodeList(document.children),
        };

        return { document: rootBlock, errors: this.compilerErrors };
    }

    private pushError(message: string, line: number, column: number) {
        this.compilerErrors.push({
            type: "HYDRATOR",
            message,
            line,
            column,
        });
    }

    private transformNodeList(
        nodes: BlockContentNode[],
        inheritedProps: ResolvedProps = {},
    ): IRNode[] {
        const output: IRNode[] = [];
        const backpack: ResolvedProps = { ...inheritedProps };

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.type !== NodeType.ANNOTATION) {
                output.push(this.transformSingleNode(node, backpack));
                continue;
            }

            switch (node.directive) {
                case "SET":
                    const blockWrapper = this.processSetDirective(
                        node,
                        nodes,
                        i,
                        backpack,
                    );
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
        annotation: AnnotationNode,
        allNodes: BlockContentNode[],
        currentIndex: number,
        backpack: ResolvedProps,
    ): IRBlock {
        /* v8 ignore start -- @preserve */
        if (annotation.target !== null) {
            this.pushError(
                "Invariant violation: SET directive received a target.",
                annotation.line,
                annotation.column,
            );
        }
        /* v8 ignore stop -- @preserve */
        const resolved = this.propertyResolver.resolveProperties(
            annotation.properties,
        );
        const { blockProps } =
            this.propertyResolver.routePropertiesByScope(resolved);
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
        annotation: AnnotationNode,
        backpack: ResolvedProps,
    ): IRNode | null {
        const targetProps = this.propertyResolver.resolveProperties(
            annotation.properties,
        );

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

    private transformSingleNode(
        node: TargetNode,
        activeProps: ResolvedProps,
    ): IRNode {
        const { blockProps, inlineProps } =
            this.propertyResolver.routePropertiesByScope(activeProps);

        switch (node.type) {
            case NodeType.BLOCK: {
                const children = this.transformNodeList(node.children, activeProps);

                if (blockProps.indent) {
                    this.applyLiteralIndentation(children, blockProps.indent);
                }
                return {
                    type: "BLOCK",
                    props: blockProps,
                    line: node.line,
                    column: node.column,
                    children: children,
                } as IRBlock;
            }

            case NodeType.TEXT: {
                return {
                    type: "TEXT",
                    props: inlineProps,
                    line: node.line,
                    column: node.column,
                    content: node.content,
                } as IRText;
            }
        }
    }

    private applyLiteralIndentation(
        children: IRNode[],
        indentValue: string,
    ): void {
        const spacesCount = parseInt(indentValue, 10);
        if (isNaN(spacesCount) || spacesCount <= 0) return;

        const literalSpaces = " ".repeat(spacesCount);
        let isLineStart = true;

        for (const child of children) {
            if (child.type !== "TEXT") continue;
            const textNode = child as IRText;

            if (textNode.content === "\n") {
                isLineStart = true;
                continue;
            }

            if (isLineStart) {
                textNode.content = literalSpaces + textNode.content;
            }

            isLineStart = textNode.content.endsWith("\n");
        }
    }
}
