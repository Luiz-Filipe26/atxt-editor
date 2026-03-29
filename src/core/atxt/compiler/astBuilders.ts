import * as AST from "../types/ast";
import type { SourceLocation } from "../types/tokens";

export interface BuildPropertyArgs {
    source: SourceLocation;
    key: string;
    value: string;
    toggle: AST.PropertyToggle;
}

export interface PropEntry {
    name: string;
    value: string;
}

export function buildBlockNode(
    source: SourceLocation,
    children: AST.BlockContentNode[],
): AST.BlockNode {
    return {
        type: AST.NodeType.BLOCK,
        line: source.line,
        column: source.column,
        children,
    };
}

export function buildAnnotationNode(
    source: SourceLocation,
    directive: AST.AnnotationDirective,
    properties: AST.PropertyNode[],
    target: AST.BlockNode | null,
): AST.AnnotationNode {
    return {
        type: AST.NodeType.ANNOTATION,
        line: source.line,
        column: source.column,
        directive,
        properties,
        target,
    };
}

export function buildNewlineNode(source: SourceLocation): AST.NewlineNode {
    return { type: AST.NodeType.NEWLINE, line: source.line, column: source.column };
}

export function buildPropertyNode(args: BuildPropertyArgs): AST.PropertyNode {
    return {
        type: AST.NodeType.PROPERTY,
        line: args.source.line,
        column: args.source.column,
        key: args.key,
        value: args.value,
        toggle: args.toggle,
    };
}

export function buildPropertyNodesFromPairs(
    source: SourceLocation,
    props: PropEntry[],
    toggle: AST.PropertyToggle = undefined,
): AST.PropertyNode[] {
    return props.map(({ name, value }) =>
        buildPropertyNode({
            source,
            key: name,
            value: toggle === "minus" ? "" : value,
            toggle,
        }),
    );
}

export function buildToggleOpenNode(source: SourceLocation, props: PropEntry[]) {
    return buildToggleNode(source, props, "plus");
}

export function buildToggleCloseNode(source: SourceLocation, props: PropEntry[]) {
    return buildToggleNode(source, props, "minus");
}

export function buildToggleNode(
    source: SourceLocation,
    props: PropEntry[],
    toggle: AST.PropertyToggle,
): AST.AnnotationNode {
    const propertyNodes = buildPropertyNodesFromPairs(source, props, toggle);
    return buildAnnotationNode(source, "NORMAL", propertyNodes, null);
}
