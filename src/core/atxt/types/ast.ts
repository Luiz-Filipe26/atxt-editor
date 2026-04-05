export const NodeType = {
    DOCUMENT: "DOCUMENT",
    BLOCK: "BLOCK",
    TEXT: "TEXT",
    NEWLINE: "NEWLINE",
    ANNOTATION: "ANNOTATION",
    PROPERTY: "PROPERTY",
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

interface BaseNode {
    type: NodeType;
    line: number;
    column: number;
}

export type BlockContentNode = BlockNode | TextNode | NewlineNode | AnnotationNode;

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

export interface NewlineNode extends BaseNode {
    type: "NEWLINE";
}

export type PropertyToggle = "plus" | "minus" | undefined;

export interface PropertyNode extends BaseNode {
    type: "PROPERTY";
    key: string;
    value: string;
    toggle: PropertyToggle;
}

export const DIRECTIVE_KEYWORDS = ["SET", "DEFINE", "HIDE", "SYMBOL"] as const;
export type AnnotationDirective = (typeof DIRECTIVE_KEYWORDS)[number] | "NORMAL";

export interface AnnotationNode extends BaseNode {
    type: "ANNOTATION";
    directive: AnnotationDirective;
    properties: PropertyNode[];
    target: BlockNode | null;
}

export type Node = DocumentNode | BlockContentNode | PropertyNode;
