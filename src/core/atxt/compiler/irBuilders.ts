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
        type: "BLOCK",
        props: args.props,
        classes: args.classes ?? [],
        ownProps: args.ownProps ?? new Map(),
        line: args.source.line,
        column: args.source.column,
        children: args.children,
    };
}

export function buildTextNode(
    source: SourceLocation,
    id: string,
    props: IR.ResolvedProps,
    content: string,
): IR.Text {
    return {
        id,
        type: "TEXT",
        props,
        classes: [],
        ownProps: new Map(),
        line: source.line,
        column: source.column,
        content,
    };
}

export function buildNewlineNode(source: SourceLocation, id: string): IR.Newline {
    return { id, type: "NEWLINE", line: source.line, column: source.column };
}
