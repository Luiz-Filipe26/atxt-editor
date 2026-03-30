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

export interface Block extends StyledNode {
    type: "BLOCK";
    children: Node[];
}

export interface Text extends StyledNode {
    type: "TEXT";
    content: string;
}

export interface Newline extends PositionalNode {
    type: "NEWLINE";
}

export type Node = Block | Text | Newline;

export interface IRDocument {
    root: Block;
    nodeMap: Map<string, Node>;
    classDefinitions: Map<string, ResolvedProps>;
}
