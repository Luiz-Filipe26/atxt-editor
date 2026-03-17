export type ResolvedProps = Record<string, string>;

interface BaseNode {
    props: ResolvedProps;
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
