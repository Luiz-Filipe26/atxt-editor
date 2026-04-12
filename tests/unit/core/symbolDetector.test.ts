import { describe, it, expect, beforeEach } from "vitest";
import { Lexer } from "@atxt";
import { SymbolDetector, SymbolEntryType } from "@atxt/compiler/symbolDetector";
import type { PropEntry } from "@atxt/compiler/astBuilders";
import { BUILT_IN_SYMBOLS } from "@atxt/domain/builtInSymbols";
import { PropKey } from "@atxt/domain/annotationProperties";

function props(record: Record<string, string>): PropEntry[] {
    return Object.entries(record).map(([name, value]) => ({ name, value }));
}

function toRecord(entries: PropEntry[] | undefined): Record<string, string> {
    return Object.fromEntries((entries ?? []).map(({ name, value }) => [name, value]));
}

function getProp(entries: PropEntry[] | undefined, name: string): string | undefined {
    return entries?.find((e) => e.name === name)?.value;
}

describe("SymbolDetector", () => {
    let detector: SymbolDetector;

    beforeEach(() => {
        detector = new SymbolDetector();
    });

    describe("detectAt — built-in inline symbols", () => {
        it("detects ** at position 0", () => {
            const match = detector.detectAt("**bold**", 0);
            expect(match).not.toBeNull();
            expect(toRecord(match!.props)).toEqual({ weight: "bold" });
            expect(match!.symbolLength).toBe(2);
            expect(match!.closing).toBe("**");
            expect(match!.closingPos).toBe(6);
        });

        it("detects _ at position 0", () => {
            const match = detector.detectAt("_italic_", 0);
            expect(toRecord(match!.props)).toEqual({ style: "italic" });
            expect(match!.closingPos).toBe(7);
        });

        it("detects ~~ at position 0", () => {
            const match = detector.detectAt("~~strike~~", 0);
            expect(toRecord(match!.props)).toEqual({ decoration: "line-through" });
            expect(match!.closingPos).toBe(8);
        });

        it("detects a symbol at a non-zero position", () => {
            const match = detector.detectAt("Hello **world**", 6);
            expect(match).not.toBeNull();
            expect(match!.closingPos).toBe(13);
        });

        it("returns null when no symbol starts at position", () => {
            expect(detector.detectAt("Hello world", 0)).toBeNull();
        });

        it("returns null when closing delimiter is missing", () => {
            expect(detector.detectAt("**no close", 0)).toBeNull();
        });

        it("returns null when content between delimiters is empty", () => {
            expect(detector.detectAt("****", 0)).toBeNull();
        });
    });

    describe("detectAt — escape handling in close search (sentinel protocol)", () => {
        it("ignores a sentinel-escaped closing delimiter", () => {
            const match = detector.detectAt(`**text${Lexer.ESCAPE_SENTINEL}** more**`, 0);
            expect(match).not.toBeNull();
            expect(match!.closingPos).toBe(14);
        });

        it("does not treat sentinel-escaped backslash as escaping the following **", () => {
            const match = detector.detectAt(`**text${Lexer.ESCAPE_SENTINEL}\\**`, 0);
            expect(match).not.toBeNull();
            expect(match!.closingPos).toBe(8);
        });
    });

    describe("detectAt — maximal munch", () => {
        it("prefers ** over a hypothetical single * when both are registered", () => {
            detector.registerSymbol("*", SymbolEntryType.Inline, props({ weight: "normal" }));
            const match = detector.detectAt("**bold**", 0);
            expect(toRecord(match!.props)).toEqual({ weight: "bold" });
            expect(match!.symbolLength).toBe(2);
        });
    });

    describe("detectAt — closing is reverse of opening", () => {
        it("asymmetric symbol closes with its reverse", () => {
            detector.registerSymbol("*-", SymbolEntryType.Inline, props({ color: "red" }));
            const match = detector.detectAt("*-text-*", 0);
            expect(match).not.toBeNull();
            expect(match!.closing).toBe("-*");
            expect(match!.closingPos).toBe(6);
        });
    });

    describe("registerInline — custom symbols", () => {
        it("registers a custom inline symbol that is then detectable", () => {
            detector.registerSymbol("++", SymbolEntryType.Inline, props({ color: "yellow" }));
            const match = detector.detectAt("++text++", 0);
            expect(match).not.toBeNull();
            expect(toRecord(match!.props)).toEqual({ color: "yellow" });
        });

        it("overrides a built-in symbol when re-registered", () => {
            detector.registerSymbol(
                "**",
                SymbolEntryType.Inline,
                props({ decoration: "underline" }),
            );
            const match = detector.detectAt("**text**", 0);
            expect(toRecord(match!.props)).toEqual({ decoration: "underline" });
        });
    });

    describe("detectBlockSymbol — built-in block symbols", () => {
        it.each(BUILT_IN_SYMBOLS.filter((s) => s.type === "block"))(
            '"$sequence" is detectable as a block symbol',
            ({ sequence, props }) => {
                const match = detector.detectBlockSymbol(sequence + "text");
                expect(match).not.toBeNull();
                expect(toRecord(match!.props)).toEqual(toRecord(props));
                expect(match!.symbolLength).toBe(sequence.length);
            },
        );

        it("returns null for plain text", () => {
            expect(detector.detectBlockSymbol("Hello world")).toBeNull();
        });

        it("# without trailing space is not a block symbol", () => {
            expect(detector.detectBlockSymbol("#nospace")).toBeNull();
        });

        it("##### wins over # (maximal munch in block symbols)", () => {
            expect(getProp(detector.detectBlockSymbol("##### deep")?.props, PropKey.Kind)).toBe(
                "heading5",
            );
        });
    });

    describe("registerBlock — custom block symbols", () => {
        it("registers a custom block symbol that is then detectable", () => {
            detector.registerSymbol("§ ", SymbolEntryType.Block, props({ kind: "section" }));
            const match = detector.detectBlockSymbol("§ My section");
            expect(match).not.toBeNull();
            expect(toRecord(match!.props)).toEqual({ kind: "section" });
        });
    });
});
