import * as AST from "../types/ast";
import type { SourceLocation } from "../types/tokens";

export interface BuildPropertyArgs {
    source: SourceLocation;
    key: string;
    value: string;
    toggle: AST.PropertyToggle;
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

export function buildPropertyNodesFromRecord(
    source: SourceLocation,
    props: Record<string, string>,
    toggle: AST.PropertyToggle = undefined,
): AST.PropertyNode[] {
    return Object.entries(props).map(([key, value]) =>
        buildPropertyNode({
            source,
            key,
            value: toggle === "minus" ? "" : value,
            toggle,
        }),
    );
}

export function buildToggleOpenNode(source: SourceLocation, props: Record<string, string>) {
    return buildToggleNode(source, props, "plus");
}

export function buildToggleCloseNode(source: SourceLocation, props: Record<string, string>) {
    return buildToggleNode(source, props, "minus");
}

export function buildToggleNode(
    source: SourceLocation,
    props: Record<string, string>,
    toggle: AST.PropertyToggle,
): AST.AnnotationNode {
    const propertyNodes = buildPropertyNodesFromRecord(source, props, toggle);
    return buildAnnotationNode(source, "NORMAL", propertyNodes, null);
}
