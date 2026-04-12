export const NodeType = {
    Document: "DOCUMENT",
    Block: "BLOCK",
    Text: "TEXT",
    Newline: "NEWLINE",
    Annotation: "ANNOTATION",
    Property: "PROPERTY",
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

interface BaseNode {
    type: NodeType;
    line: number;
    column: number;
}

export type BlockContentNode = BlockNode | TextNode | NewlineNode | AnnotationNode;

export interface DocumentNode extends BaseNode {
    type: typeof NodeType.Document;
    children: BlockContentNode[];
}

export interface BlockNode extends BaseNode {
    type: typeof NodeType.Block;
    children: BlockContentNode[];
}

export interface TextNode extends BaseNode {
    type: typeof NodeType.Text;
    content: string;
}

export interface NewlineNode extends BaseNode {
    type: typeof NodeType.Newline;
}

export const PropertyToggle = {
    Plus: "plus",
    Minus: "minus",
} as const;

export type PropertyToggle = (typeof PropertyToggle)[keyof typeof PropertyToggle] | undefined;

export interface PropertyNode extends BaseNode {
    type: typeof NodeType.Property;
    key: string;
    value: string;
    toggle: PropertyToggle;
}

export const AnnotationDirective = {
    Normal: "NORMAL",
    Set: "SET",
    Define: "DEFINE",
    Hide: "HIDE",
    Symbol: "SYMBOL",
} as const;

export type AnnotationDirective = (typeof AnnotationDirective)[keyof typeof AnnotationDirective];

export const DIRECTIVE_KEYWORDS = Object.values(AnnotationDirective).filter(
    (d) => d !== AnnotationDirective.Normal,
);

export interface AnnotationNode extends BaseNode {
    type: typeof NodeType.Annotation;
    directive: AnnotationDirective;
    properties: PropertyNode[];
    target: BlockNode | null;
}

export type Node = DocumentNode | BlockContentNode | PropertyNode;
