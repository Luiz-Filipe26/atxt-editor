import { BUILT_IN_SYMBOLS } from "../domain/builtInSymbols";
import { CLOSING_CHARS } from "../domain/closingChars";
import type { PropEntry } from "../types/ast";
import { SymbolEntryType, type SymbolEntry } from "../types/symbols";
import { Lexer } from "./lexer";
import { Trie } from "./trie";

interface BaseSymbolMatch {
    props: PropEntry[];
    symbolLength: number;
}

export type BlockSymbolMatch = BaseSymbolMatch;
export interface InlineSymbolMatch extends BaseSymbolMatch {
    closing: string;
    closingPos: number;
}

export const SymbolRegistrationResult = {
    Ok: "ok",
    Duplicate: "duplicate",
    ClosingConflict: "closing-conflict",
    InvalidSequence: "invalid-sequence",
} as const;

export type SymbolRegistrationResult =
    (typeof SymbolRegistrationResult)[keyof typeof SymbolRegistrationResult];

export class SymbolDetector {
    private trie = new Trie<SymbolEntry>();
    private builtInSymbols = new Set<string>();
    private registeredSymbols = new Set<string>();

    private static VALID_SYMBOL_CATEGORIES = "Pc/Po/Pd/Sm/So/Sk/Ps/Pe/Pi/Pf".split("/");
    private static VALID_SYMBOL_PATTERN = new RegExp(
        `^[ ${SymbolDetector.VALID_SYMBOL_CATEGORIES.map((c) => `\\p{${c}}`).join("")}]+$`,
        "u",
    );

    private static INVALID_SYMBOL_PATTERN = /[{}\[\]]/;

    constructor() {
        for (const { sequence, type, props } of BUILT_IN_SYMBOLS) {
            this.registerSymbol(sequence, type, props);
            this.builtInSymbols.add(sequence);
        }
    }

    public registerSymbol(
        sequence: string,
        type: SymbolEntryType,
        props: PropEntry[],
    ): SymbolRegistrationResult {
        const closing = this.reverse(sequence);
        if (!this.builtInSymbols.has(sequence)) {
            if (this.registeredSymbols.has(sequence)) return SymbolRegistrationResult.Duplicate;
            if (this.registeredSymbols.has(closing))
                return SymbolRegistrationResult.ClosingConflict;
        }
        if (SymbolDetector.INVALID_SYMBOL_PATTERN.test(sequence))
            return SymbolRegistrationResult.InvalidSequence;
        if (!SymbolDetector.VALID_SYMBOL_PATTERN.test(sequence))
            return SymbolRegistrationResult.InvalidSequence;
        if (type === SymbolEntryType.Inline) {
            this.trie.insert(sequence, { type, props, closing });
        } else {
            this.trie.insert(sequence, { type, props });
        }
        this.registeredSymbols.add(sequence);
        return SymbolRegistrationResult.Ok;
    }

    public detectAt(text: string, pos: number): InlineSymbolMatch | null {
        const entry = this.trie.match(text, pos);
        if (entry?.value.type !== SymbolEntryType.Inline) return null;

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

    public detectBlockSymbol(text: string): BlockSymbolMatch | null {
        const entry = this.trie.match(text, 0);
        if (entry?.value.type !== SymbolEntryType.Block) return null;
        return { props: entry.value.props, symbolLength: entry.literal.length };
    }

    private reverse(sequence: string): string {
        return [...sequence]
            .reverse()
            .map((ch) => CLOSING_CHARS.get(ch) ?? ch)
            .join("");
    }

    private findClosingPos(text: string, from: number, closing: string): number {
        for (let pos = from; pos < text.length; pos++) {
            if (text[pos] === Lexer.ESCAPE_SENTINEL) pos++;
            else if (text.startsWith(closing, pos)) return pos;
        }
        return -1;
    }
}
