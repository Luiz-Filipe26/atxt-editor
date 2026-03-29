export interface BuiltInSymbol {
    sequence: string;
    type: "inline" | "block";
    props: Record<string, string>;
}

export const BUILT_IN_SYMBOLS: BuiltInSymbol[] = [
    { sequence: "**", type: "inline", props: { weight: "bold" } },
    { sequence: "_", type: "inline", props: { style: "italic" } },
    { sequence: "~~", type: "inline", props: { decoration: "line-through" } },
    { sequence: "##### ", type: "block", props: { kind: "heading5", size: "14", weight: "bold" } },
    { sequence: "#### ", type: "block", props: { kind: "heading4", size: "16", weight: "bold" } },
    { sequence: "### ", type: "block", props: { kind: "heading3", size: "18", weight: "bold" } },
    { sequence: "## ", type: "block", props: { kind: "heading2", size: "24", weight: "bold" } },
    { sequence: "# ", type: "block", props: { kind: "heading1", size: "32", weight: "bold" } },
    { sequence: "> ", type: "block", props: { kind: "quote", color: "gray", indent: "4" } },
    { sequence: "- ", type: "block", props: { kind: "item", indent: "2" } },
    { sequence: "+ ", type: "block", props: { kind: "item", indent: "2" } },
];
