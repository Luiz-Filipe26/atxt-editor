import type { SourceLocation } from "./location";

export type ResolvedProps = Map<string, string>;

interface PositionalNode {
    id: string;
}

interface StyledNode extends PositionalNode {
    props: ResolvedProps;
    classes: string[];
    ownProps: ResolvedProps;
}

export const NodeType = {
    Block: "BLOCK",
    Text: "TEXT",
    Newline: "NEWLINE",
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export interface Block extends StyledNode {
    type: typeof NodeType.Block;
    children: Node[];
}

export interface Text extends StyledNode {
    type: typeof NodeType.Text;
    content: string;
}

export interface Newline extends PositionalNode {
    type: typeof NodeType.Newline;
}

export type Node = Block | Text | Newline;

export interface IRNodeEntry extends SourceLocation {
    node: Node;
}

export interface IRDocument {
    root: Block;
    nodeMap: Map<string, IRNodeEntry>;
    classDefinitions: Map<string, ResolvedProps>;
}
