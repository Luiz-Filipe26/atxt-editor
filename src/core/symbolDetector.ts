import { Lexer } from "./lexer";

interface InlineEntry {
    type: "inline";
    className: string;
    closing: string;
}

interface BlockEntry {
    type: "block";
    className: string;
}

type SymbolEntry = InlineEntry | BlockEntry;

interface TrieNode {
    children: Map<string, TrieNode>;
    entry?: SymbolEntry;
}

export interface InlineSymbolMatch {
    className: string;
    openLength: number;
    closing: string;
    closePos: number;
}

export interface BlockSymbolMatch {
    cls: string;
    prefixLength: number;
}

type RegistryEntry = { sequence: string } & SymbolEntry;

export class SymbolDetector {
    private root: TrieNode = { children: new Map() };

    private static readonly BUILT_IN_SYMBOLS: RegistryEntry[] = [
        { sequence: "**", type: "inline", className: "bold", closing: "**" },
        { sequence: "_", type: "inline", className: "italic", closing: "_" },
        { sequence: "~~", type: "inline", className: "strikethrough", closing: "~~" },
        { sequence: "##### ", type: "block", className: "h5" },
        { sequence: "#### ", type: "block", className: "h4" },
        { sequence: "### ", type: "block", className: "h3" },
        { sequence: "## ", type: "block", className: "h2" },
        { sequence: "# ", type: "block", className: "h1" },
        { sequence: "> ", type: "block", className: "blockquote" },
        { sequence: "- ", type: "block", className: "list-item" },
        { sequence: "+ ", type: "block", className: "list-ordered" },
    ];

    constructor() {
        for (const { sequence, ...entry } of SymbolDetector.BUILT_IN_SYMBOLS) {
            this.insertTrie(sequence, entry);
        }
    }

    registerInline(sequence: string, className: string): void {
        const closing = [...sequence].reverse().join("");
        this.insertTrie(sequence, { type: "inline", className, closing });
    }

    registerBlock(sequence: string, className: string): void {
        this.insertTrie(sequence, { type: "block", className });
    }

    detectAt(text: string, pos: number): InlineSymbolMatch | null {
        const { entry, length } = this.matchTrie(text, pos);
        if (!entry || entry.type !== "inline") return null;

        const contentStart = pos + length;
        const closePos = this.findClosePos(text, contentStart, entry.closing);
        if (closePos < 0 || closePos === contentStart) return null;

        return { className: entry.className, openLength: length, closing: entry.closing, closePos };
    }

    detectBlockSymbol(text: string): BlockSymbolMatch | null {
        const { entry, length } = this.matchTrie(text, 0);
        if (!entry || entry.type !== "block") return null;
        return { cls: entry.className, prefixLength: length };
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
