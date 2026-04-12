export type ResolvedProps = Map<string, string>;

interface PositionalNode {
    id: string;
    line?: number;
    column?: number;
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

export interface IRDocument {
    root: Block;
    nodeMap: Map<string, Node>;
    classDefinitions: Map<string, ResolvedProps>;
}
