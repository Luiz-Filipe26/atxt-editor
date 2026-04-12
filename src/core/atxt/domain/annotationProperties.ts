import type { ResolvedProps } from "../types/ir";
import { NodeType } from "../types/ir";

// ---------------------------------------------------------------------------
// Property keys
// ---------------------------------------------------------------------------

export const PropKey = {
    Class: "class",
    Merge: "merge",
    Kind: "kind",
    Hidden: "hidden",
    Indent: "indent",
    Symbol: "symbol",
    Type: "type",
} as const;

export type PropKey = (typeof PropKey)[keyof typeof PropKey];

// ---------------------------------------------------------------------------
// Known property values
// ---------------------------------------------------------------------------

export const KindValue = {
    Paragraph: "paragraph",
} as const;

export type KindValue = (typeof KindValue)[keyof typeof KindValue];

// ---------------------------------------------------------------------------
// Semantic helpers
// ---------------------------------------------------------------------------

/** The check is case-insensitive. */
export function isHidden(props: ResolvedProps): boolean {
    return props.get(PropKey.Hidden)?.toLowerCase() === "true";
}

/** Defaults to 0 when the property is absent. */
export function getIndent(props: ResolvedProps): number {
    return parseInt(props.get(PropKey.Indent) ?? "0", 10);
}

export function isLeafBlock(children: { type: string }[]): boolean {
    return children.every((c) => c.type === NodeType.Text || c.type === NodeType.Newline);
}

/** "class" and "merge" are consumed by the resolver and never reach the IR as regular properties. */
export function isMetaProperty(key: string): boolean {
    return key === PropKey.Class || key === PropKey.Merge;
}
