import { PROPERTY_REGISTRY } from "./propertyDefinitions";
import {
    NodeType,
    type ASTNode,
    type DocumentNode,
    type AnnotationNode,
} from "./types/ast";
import type { CompilerError } from "./types/errors";

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

    public hydrate(document: DocumentNode): {
        document: IRBlock;
        errors: CompilerError[];
    } {
        this.compilerErrors = [];

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

            if (node.type === NodeType.ANNOTATION && node.isSet) {
                const validatedProps = this.validateProperties(node);
                const remainingSiblings = nodes.slice(i + 1);
                const childrenToWrap = node.target
                    ? [node.target, ...remainingSiblings]
                    : remainingSiblings;

                output.push({
                    type: "BLOCK",
                    props: validatedProps,
                    line: node.line,
                    column: node.column,
                    children: this.transformNodeList(childrenToWrap, backpack),
                } as IRBlock);
                break;
            }

            if (node.type === NodeType.ANNOTATION && !node.isSet) {
                const annotation = node as AnnotationNode;
                const targetProps: Record<string, any> = {};

                for (const prop of annotation.properties) {
                    if (prop.toggle === "minus") {
                        delete backpack[prop.key];
                        continue;
                    }

                    const propertyDef = this.registry[prop.key];
                    if (!propertyDef) {
                        this.pushError(
                            `Aviso: Propriedade '${prop.key}' ignorada.`,
                            prop.line,
                            prop.column,
                        );
                        continue;
                    }

                    const isValid = propertyDef.validate(prop.value);
                    if (!isValid) continue;

                    if (prop.toggle === "plus") {
                        backpack[prop.key] = prop.value;
                    } else {
                        targetProps[prop.key] = prop.value;
                    }
                }

                if (annotation.target) {
                    output.push(
                        this.transformSingleNode(annotation.target, {
                            ...backpack,
                            ...targetProps,
                        }),
                    );
                }
                continue;
            }

            output.push(this.transformSingleNode(node, backpack));
        }

        return output;
    }

    private transformSingleNode(
        node: ASTNode,
        activeProps: Record<string, any>,
    ): IRNode {
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

        if (node.type === NodeType.BLOCK) {
            return {
                type: "BLOCK",
                props: blockProps,
                line: node.line,
                column: node.column,
                children: this.transformNodeList(node.children, activeProps),
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

        throw new Error(`Tipo de nó desconhecido no Hydrator: ${node.type}`);
    }

    private validateProperties(node: AnnotationNode): Record<string, any> {
        const validProps: Record<string, any> = {};

        for (const propNode of node.properties) {
            const propertyDef = this.registry[propNode.key];

            if (!propertyDef) {
                this.pushError(
                    `Aviso: Propriedade desconhecida '${propNode.key}'.`,
                    propNode.line,
                    propNode.column,
                );
                continue;
            }

            if (propNode.toggle === "minus") continue;

            const isValid = propertyDef.validate(propNode.value);
            if (!isValid) {
                this.pushError(
                    `Aviso: Valor inválido '${propNode.value}'.`,
                    propNode.line,
                    propNode.column,
                );
                continue;
            }

            validProps[propNode.key] = propNode.value;
        }
        return validProps;
    }
}
