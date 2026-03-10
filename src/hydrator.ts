import { PROPERTY_REGISTRY } from "./annotationTransformations";
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

    private transformNodeList(nodes: ASTNode[]): IRNode[] {
        const output: IRNode[] = [];

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
                    children: this.transformNodeList(childrenToWrap),
                } as IRBlock);
                break;
            }

            if (node.type === NodeType.ANNOTATION && !node.isSet) {
                if (node.target) {
                    const validatedProps = this.validateProperties(node);
                    output.push(this.transformSingleNode(node.target, validatedProps));
                }
                continue;
            }

            output.push(this.transformSingleNode(node, {}));
        }

        return output;
    }

    private transformSingleNode(
        node: ASTNode,
        activeProps: Record<string, any>,
    ): IRNode {
        if (node.type === NodeType.BLOCK) {
            return {
                type: "BLOCK",
                props: { ...activeProps },
                line: node.line,
                column: node.column,
                children: this.transformNodeList(node.children),
            } as IRBlock;
        }

        if (node.type === NodeType.TEXT) {
            return {
                type: "TEXT",
                props: { ...activeProps },
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
                    `Aviso: Propriedade desconhecida '${propNode.key}'. Ela será ignorada.`,
                    propNode.line,
                    propNode.column,
                );
                continue;
            }

            const validatedValue = propertyDef.validate(propNode.value);

            if (validatedValue === null) {
                this.pushError(
                    `Aviso: Valor inválido '${propNode.value}' para a propriedade '${propNode.key}'.`,
                    propNode.line,
                    propNode.column,
                );
                continue;
            }

            validProps[propNode.key] = validatedValue;
        }

        return validProps;
    }
}
