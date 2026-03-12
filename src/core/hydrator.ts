import { PROPERTY_REGISTRY } from "../domain/propertyDefinitions";
import { StyleResolver } from "./styleResolver";
import {
    NodeType,
    type ASTNode,
    type DocumentNode,
    type AnnotationNode,
} from "../types/ast";
import type { CompilerError } from "../types/errors";

export interface IRNode {
    type: "BLOCK" | "TEXT";
    props: Record<string, any>;
    line?: number;
    column?: number;
}

export interface IRBlock extends IRNode {
    type: "BLOCK";
    children: IRNode[];
}

export interface IRText extends IRNode {
    type: "TEXT";
    content: string;
}

export class Hydrator {
    private registry = PROPERTY_REGISTRY;
    private compilerErrors: CompilerError[] = [];
    private styleResolver: StyleResolver;

    constructor() {
        this.styleResolver = new StyleResolver(this.pushError.bind(this));
    }

    public hydrate(document: DocumentNode): {
        document: IRBlock;
        errors: CompilerError[];
    } {
        this.compilerErrors = [];
        this.styleResolver.reset();

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
        inheritedProps: Record<string, any> = {},
    ): IRNode[] {
        const output: IRNode[] = [];
        const backpack = { ...inheritedProps };

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            if (node.type === NodeType.ANNOTATION) {
                const annotation = node as AnnotationNode;

                if (annotation.directive === "DEFINE") {
                    this.styleResolver.defineClass(annotation);
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
        backpack: Record<string, any>,
    ): IRBlock {
        const validatedProps = this.styleResolver.resolveProperties(
            annotation.properties,
        );
        const remainingSiblings = allNodes.slice(currentIndex + 1);
        const childrenToWrap = annotation.target
            ? [annotation.target, ...remainingSiblings]
            : remainingSiblings;

        return {
            type: "BLOCK",
            props: validatedProps,
            line: annotation.line,
            column: annotation.column,
            children: this.transformNodeList(childrenToWrap, backpack),
        };
    }

    private processNormalDirective(
        annotation: AnnotationNode,
        backpack: Record<string, any>,
    ): IRNode | null {
        const targetProps: Record<string, any> =
            this.styleResolver.resolveProperties(annotation.properties);

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
        activeProps: Record<string, any>,
    ): IRNode {
        const { blockProps, inlineProps } =
            this.routePropertiesByScope(activeProps);

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

    private routePropertiesByScope(activeProps: Record<string, any>): {
        blockProps: Record<string, any>;
        inlineProps: Record<string, any>;
    } {
        const blockProps: Record<string, any> = {};
        const inlineProps: Record<string, any> = {};

        for (const [key, value] of Object.entries(activeProps)) {
            const propDef = this.registry[key];
            if (!propDef) continue;

            if (propDef.scope === "block") {
                blockProps[key] = value;
            } else if (propDef.scope === "inline") {
                inlineProps[key] = value;
            }
        }

        return { blockProps, inlineProps };
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
