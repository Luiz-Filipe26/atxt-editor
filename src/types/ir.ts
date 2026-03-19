export type ResolvedProps = Record<string, string>;

interface BaseNode {
    id: string;
    props: ResolvedProps;
    classes: string[];
    inlineProps: ResolvedProps;
    line?: number;
    column?: number;
}

export interface Block extends BaseNode {
    type: "BLOCK";
    children: Node[];
}

export interface Text extends BaseNode {
    type: "TEXT";
    content: string;
}

export type Node = Block | Text;

export interface IRDocument {
    root: Block;
    nodeMap: Map<string, Node>;
    classDefinitions: Record<string, ResolvedProps>;
}
