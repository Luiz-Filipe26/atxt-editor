export type ResolvedProps = Record<string, string>;

export interface IRNode {
    type: "BLOCK" | "TEXT";
    props: ResolvedProps;
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
