export interface BuiltInSymbol {
    sequence: string;
    type: "inline" | "block";
    props: { name: string; value: string }[];
}

export const BUILT_IN_SYMBOLS: BuiltInSymbol[] = [
    { sequence: "**", type: "inline", props: props({ weight: "bold" }) },
    { sequence: "_",  type: "inline", props: props({ style: "italic" }) },
    { sequence: "~~", type: "inline", props: props({ decoration: "line-through" }) },
    { sequence: "# ",     type: "block", props: props({ kind: "heading1", size: "32", weight: "bold" }) },
    { sequence: "## ",    type: "block", props: props({ kind: "heading2", size: "24", weight: "bold" }) },
    { sequence: "### ",   type: "block", props: props({ kind: "heading3", size: "18", weight: "bold" }) },
    { sequence: "#### ",  type: "block", props: props({ kind: "heading4", size: "16", weight: "bold" }) },
    { sequence: "##### ", type: "block", props: props({ kind: "heading5", size: "14", weight: "bold" }) },
    { sequence: "> ",     type: "block", props: props({ kind: "quote", color: "gray", indent: "4" }) },
    { sequence: "- ",     type: "block", props: props({ kind: "item", indent: "2" }) },
    { sequence: "+ ",     type: "block", props: props({ kind: "item", indent: "2" }) },
];

function props(record: Record<string, string>) {
    return Object.entries(record).map(([name, value]) => ({ name, value }));
}
