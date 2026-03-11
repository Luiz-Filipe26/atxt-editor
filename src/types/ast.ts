export const NodeType = {
    DOCUMENT: "DOCUMENT",
    BLOCK: "BLOCK",
    TEXT: "TEXT",
    ANNOTATION: "ANNOTATION",
    PROPERTY: "PROPERTY",
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export interface BaseNode {
    type: NodeType;
    line: number;
    column: number;
}

export interface DocumentNode extends BaseNode {
    type: "DOCUMENT";
    children: ASTNode[];
}

export interface BlockNode extends BaseNode {
    type: "BLOCK";
    children: ASTNode[];
}

export interface TextNode extends BaseNode {
    type: "TEXT";
    content: string;
}

export interface PropertyNode extends BaseNode {
    type: "PROPERTY";
    key: string;
    value: string;
    toggle?: "plus" | "minus";
}

export interface AnnotationNode extends BaseNode {
    type: "ANNOTATION";
    isSet: boolean;
    properties: PropertyNode[];
    target: ASTNode | null;
}

export type ASTNode = DocumentNode | BlockNode | TextNode | AnnotationNode;
