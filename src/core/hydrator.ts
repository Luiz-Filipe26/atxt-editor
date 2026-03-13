import { PropertyResolver } from "./propertyResolver";
import {
    NodeType,
    type ASTNode,
    type DocumentNode,
    type AnnotationNode,
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
        nodes: ASTNode[],
        inheritedProps: ResolvedProps = {},
    ): IRNode[] {
        const output: IRNode[] = [];
        const backpack: ResolvedProps = { ...inheritedProps };

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            if (node.type === NodeType.ANNOTATION) {
                const annotation = node as AnnotationNode;

                if (annotation.directive === "DEFINE") {
                    this.propertyResolver.defineClass(annotation);
                    continue;
                }

                if (annotation.directive === "SET") {
                    const blockWrapper = this.processSetDirective(
                        annotation,
                        nodes,
                        i,
                        backpack,
                    );
                    output.push(blockWrapper);
                    break;
                }

                if (annotation.directive === "NORMAL") {
                    const normalNode = this.processNormalDirective(annotation, backpack);
                    if (normalNode) output.push(normalNode);
                    continue;
                }
            }

            output.push(this.transformSingleNode(node, backpack));
        }

        return output;
    }

    private processSetDirective(
        annotation: AnnotationNode,
        allNodes: ASTNode[],
        currentIndex: number,
        backpack: ResolvedProps,
    ): IRBlock {
        const resolved = this.propertyResolver.resolveProperties(
            annotation.properties,
        );
        const { blockProps } =
            this.propertyResolver.routePropertiesByScope(resolved);
        const remainingSiblings = allNodes.slice(currentIndex + 1);
        const childrenToWrap = annotation.target
            ? [annotation.target, ...remainingSiblings]
            : remainingSiblings;

        return {
            type: "BLOCK",
            props: blockProps,
            line: annotation.line,
            column: annotation.column,
            children: this.transformNodeList(childrenToWrap, backpack),
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
        node: ASTNode,
        activeProps: ResolvedProps,
    ): IRNode {
        const { blockProps, inlineProps } =
            this.propertyResolver.routePropertiesByScope(activeProps);

        if (node.type === NodeType.BLOCK) {
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

        if (node.type === NodeType.TEXT) {
            return {
                type: "TEXT",
                props: inlineProps,
                line: node.line,
                column: node.column,
                content: node.content,
            } as IRText;
        }

        throw new Error(`Unknown node type in Hydrator: ${node.type}`);
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
