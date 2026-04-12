import type { PropEntry } from "./ast";

export const SymbolEntryType = {
    Inline: "inline",
    Block: "block",
} as const;

export type SymbolEntryType = (typeof SymbolEntryType)[keyof typeof SymbolEntryType];

export interface BaseEntry {
    type: SymbolEntryType;
    props: PropEntry[];
}

interface InlineEntry extends BaseEntry {
    type: typeof SymbolEntryType.Inline;
    closing: string;
}

interface BlockEntry extends BaseEntry {
    type: typeof SymbolEntryType.Block;
}

export type SymbolEntry = InlineEntry | BlockEntry;
