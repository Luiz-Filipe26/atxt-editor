export const NodeType = {
    DOCUMENT: "DOCUMENT",
    BLOCK: "BLOCK",
    TEXT: "TEXT",
    ANNOTATION: "ANNOTATION",
    PROPERTY: "PROPERTY",
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

interface BaseNode {
    type: NodeType;
    line: number;
    column: number;
}

export type BlockContentNode = BlockNode | TextNode | AnnotationNode;

export interface DocumentNode extends BaseNode {
    type: "DOCUMENT";
    children: BlockContentNode[];
}

export interface BlockNode extends BaseNode {
    type: "BLOCK";
    children: BlockContentNode[];
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

export type AnnotationDirective = "SET" | "DEFINE" | "NORMAL" | "HIDE" | "SYMBOL";

export type TargetNode = BlockNode | TextNode;

export interface AnnotationNode extends BaseNode {
    type: "ANNOTATION";
    directive: AnnotationDirective;
    properties: PropertyNode[];
    target: TargetNode | null;
}

export type ASTNode = DocumentNode | BlockContentNode | PropertyNode;
