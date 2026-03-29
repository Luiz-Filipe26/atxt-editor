import { BUILT_IN_SYMBOLS } from "../domain/builtInSymbols";
import { Lexer } from "./lexer";
import { Trie } from "./trie";

interface BaseEntry {
    type: string;
    props: Record<string, string>;
}
interface InlineEntry extends BaseEntry {
    type: "inline";
    closing: string;
}

interface BlockEntry extends BaseEntry {
    type: "block";
}

export type SymbolEntry = InlineEntry | BlockEntry;

interface BaseSymbolMatch {
    props: Record<string, string>;
    symbolLength: number;
}

export type BlockSymbolMatch = BaseSymbolMatch;
export interface InlineSymbolMatch extends BaseSymbolMatch {
    closing: string;
    closingPos: number;
}

export class SymbolDetector {
    private trie = new Trie<SymbolEntry>();

    constructor() {
        for (const { sequence, type, props } of BUILT_IN_SYMBOLS) {
            this.registerSymbol(sequence, type, props);
        }
    }

    registerSymbol(
        sequence: string,
        type: SymbolEntry["type"],
        props: Record<string, string>,
    ): void {
        const closing = [...sequence].reverse().join("");
        if (type === "inline") this.trie.insert(sequence, { type, props, closing });
        else this.trie.insert(sequence, { type, props });
    }

    detectAt(text: string, pos: number): InlineSymbolMatch | null {
        const entry = this.trie.match(text, pos);
        if (entry?.value.type !== "inline") return null;

        const contentStart = pos + entry.literal.length;
        const closePos = this.findClosingPos(text, contentStart, entry.value.closing);
        if (closePos <= contentStart) return null;

        return {
            props: entry.value.props,
            symbolLength: entry.literal.length,
            closing: entry.value.closing,
            closingPos: closePos,
        };
    }

    detectBlockSymbol(text: string): BlockSymbolMatch | null {
        const entry = this.trie.match(text, 0);
        if (entry?.value.type !== "block") return null;
        return { props: entry.value.props, symbolLength: entry.literal.length };
    }

    private findClosingPos(text: string, from: number, closing: string): number {
        for (let pos = from; pos < text.length; pos++) {
            if (text[pos] === Lexer.ESCAPE_SENTINEL) pos++;
            else if (text.startsWith(closing, pos)) return pos;
        }
        return -1;
    }
}
