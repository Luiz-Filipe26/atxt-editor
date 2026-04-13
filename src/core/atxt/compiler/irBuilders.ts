import * as IR from "../types/ir";
import type { SourceLocation } from "../types/location";

export interface BuildBlockArgs {
    source: SourceLocation;
    id: string;
    props: IR.ResolvedProps;
    classes?: string[];
    ownProps?: IR.ResolvedProps;
    children: IR.Node[];
}

export function buildBlockNode(args: BuildBlockArgs): IR.Block {
    return {
        id: args.id,
        type: IR.NodeType.Block,
        props: args.props,
        classes: args.classes ?? [],
        ownProps: args.ownProps ?? new Map(),
        children: args.children,
    };
}

export function buildTextNode(id: string, props: IR.ResolvedProps, content: string): IR.Text {
    return {
        id,
        type: IR.NodeType.Text,
        props,
        classes: [],
        ownProps: new Map(),
        content,
    };
}

export function buildNewlineNode(id: string): IR.Newline {
    return { id, type: IR.NodeType.Newline };
}
