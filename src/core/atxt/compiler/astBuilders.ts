import * as AST from "../types/ast";
import type { SourceLocation } from "../types/location";

export interface BuildPropertyArgs extends AST.PropEntry {
    source: SourceLocation;
    toggle: AST.PropertyToggle;
}

export function buildBlockNode(
    source: SourceLocation,
    children: AST.BlockContentNode[],
): AST.BlockNode {
    return {
        type: AST.NodeType.Block,
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
        type: AST.NodeType.Annotation,
        line: source.line,
        column: source.column,
        directive,
        properties,
        target,
    };
}

export function buildNewlineNode(source: SourceLocation): AST.NewlineNode {
    return { type: AST.NodeType.Newline, line: source.line, column: source.column };
}

export function buildPropertyNode(args: BuildPropertyArgs): AST.PropertyNode {
    return {
        type: AST.NodeType.Property,
        line: args.source.line,
        column: args.source.column,
        key: args.key,
        value: args.value,
        toggle: args.toggle,
    };
}

export function buildPropertyNodesFromPairs(
    source: SourceLocation,
    props: AST.PropEntry[],
    toggle: AST.PropertyToggle = undefined,
): AST.PropertyNode[] {
    return props.map(({ key: name, value }) =>
        buildPropertyNode({
            source,
            key: name,
            value: toggle === AST.PropertyToggle.Minus ? "" : value,
            toggle,
        }),
    );
}

export function buildToggleOpenNode(source: SourceLocation, props: AST.PropEntry[]) {
    return buildToggleNode(source, props, AST.PropertyToggle.Plus);
}

export function buildToggleCloseNode(source: SourceLocation, props: AST.PropEntry[]) {
    return buildToggleNode(source, props, AST.PropertyToggle.Minus);
}

export function buildToggleNode(
    source: SourceLocation,
    props: AST.PropEntry[],
    toggle: AST.PropertyToggle,
): AST.AnnotationNode {
    const propertyNodes = buildPropertyNodesFromPairs(source, props, toggle);
    return buildAnnotationNode(source, AST.AnnotationDirective.Normal, propertyNodes, null);
}
