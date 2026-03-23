import { Lexer } from "./lexer";

interface InlineEntry {
    type: "inline";
    props: Record<string, string>;
    closing: string;
}

interface BlockEntry {
    type: "block";
    props: Record<string, string>;
}

type SymbolEntry = InlineEntry | BlockEntry;

interface TrieNode {
    children: Map<string, TrieNode>;
    entry?: SymbolEntry;
}

export interface InlineSymbolMatch {
    props: Record<string, string>;
    openLength: number;
    closing: string;
    closePos: number;
}

export interface BlockSymbolMatch {
    props: Record<string, string>;
    prefixLength: number;
}

type RegistryEntry = { sequence: string } & SymbolEntry;

export class SymbolDetector {
    private root: TrieNode = { children: new Map() };

    private static readonly BUILT_IN_SYMBOLS: RegistryEntry[] = [
        { sequence: "**", type: "inline", props: { weight: "bold" }, closing: "**" },
        { sequence: "_", type: "inline", props: { style: "italic" }, closing: "_" },
        { sequence: "~~", type: "inline", props: { decoration: "line-through" }, closing: "~~" },
        {
            sequence: "##### ",
            type: "block",
            props: { kind: "heading5", size: "14", weight: "bold" },
        },
        {
            sequence: "#### ",
            type: "block",
            props: { kind: "heading4", size: "16", weight: "bold" },
        },
        {
            sequence: "### ",
            type: "block",
            props: { kind: "heading3", size: "18", weight: "bold" },
        },
        { sequence: "## ", type: "block", props: { kind: "heading2", size: "24", weight: "bold" } },
        { sequence: "# ", type: "block", props: { kind: "heading1", size: "32", weight: "bold" } },
        { sequence: "> ", type: "block", props: { kind: "quote", color: "gray", indent: "4" } },
        { sequence: "- ", type: "block", props: { kind: "item", indent: "2" } },
        { sequence: "+ ", type: "block", props: { kind: "item", indent: "2" } },
    ];

    constructor() {
        for (const { sequence, ...entry } of SymbolDetector.BUILT_IN_SYMBOLS) {
            this.insertTrie(sequence, entry);
        }
    }

    registerInline(sequence: string, props: Record<string, string>): void {
        const closing = [...sequence].reverse().join("");
        this.insertTrie(sequence, { type: "inline", props, closing });
    }

    registerBlock(sequence: string, props: Record<string, string>): void {
        this.insertTrie(sequence, { type: "block", props });
    }

    detectAt(text: string, pos: number): InlineSymbolMatch | null {
        const { entry, length } = this.matchTrie(text, pos);
        if (!entry || entry.type !== "inline") return null;

        const contentStart = pos + length;
        const closePos = this.findClosePos(text, contentStart, entry.closing);
        if (closePos < 0 || closePos === contentStart) return null;

        return { props: entry.props, openLength: length, closing: entry.closing, closePos };
    }

    detectBlockSymbol(text: string): BlockSymbolMatch | null {
        const { entry, length } = this.matchTrie(text, 0);
        if (!entry || entry.type !== "block") return null;
        return { props: entry.props, prefixLength: length };
    }

    private insertTrie(sequence: string, entry: SymbolEntry): void {
        let node = this.root;
        for (const char of sequence) {
            if (!node.children.has(char)) node.children.set(char, { children: new Map() });
            node = node.children.get(char)!;
        }
        node.entry = entry;
    }

    private matchTrie(text: string, pos: number): { entry: SymbolEntry | null; length: number } {
        let node = this.root;
        let lastEntry: SymbolEntry | null = null;
        let lastLength = 0;
        let current = pos;

        while (current < text.length && node.children.has(text[current])) {
            node = node.children.get(text[current])!;
            current++;
            if (node.entry) {
                lastEntry = node.entry;
                lastLength = current - pos;
            }
        }

        return { entry: lastEntry, length: lastLength };
    }

    private findClosePos(text: string, from: number, closing: string): number {
        let pos = from;
        while (pos < text.length) {
            if (text[pos] === "\n") return -1;
            if (text[pos] === Lexer.ESCAPE_SENTINEL) {
                pos += 2;
                continue;
            }
            if (text.startsWith(closing, pos)) return pos;
            pos++;
        }
        return -1;
    }
}
