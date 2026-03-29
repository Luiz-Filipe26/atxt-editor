import { describe, it, expect, beforeEach } from "vitest";
import { Lexer } from "@atxt";
import { SymbolDetector } from "@atxt/compiler/symbolDetector";

describe("SymbolDetector", () => {
    let detector: SymbolDetector;

    beforeEach(() => {
        detector = new SymbolDetector();
    });

    describe("detectAt — built-in inline symbols", () => {
        it("detects ** at position 0", () => {
            const match = detector.detectAt("**bold**", 0);
            expect(match).not.toBeNull();
            expect(match!.props).toEqual({ weight: "bold" });
            expect(match!.symbolLength).toBe(2);
            expect(match!.closing).toBe("**");
            expect(match!.closingPos).toBe(6);
        });

        it("detects _ at position 0", () => {
            const match = detector.detectAt("_italic_", 0);
            expect(match!.props).toEqual({ style: "italic" });
            expect(match!.closingPos).toBe(7);
        });

        it("detects ~~ at position 0", () => {
            const match = detector.detectAt("~~strike~~", 0);
            expect(match!.props).toEqual({ decoration: "line-through" });
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
            detector.registerSymbol("*", "inline", { weight: "normal" });
            const match = detector.detectAt("**bold**", 0);
            expect(match!.props).toEqual({ weight: "bold" });
            expect(match!.symbolLength).toBe(2);
        });
    });

    describe("detectAt — closing is reverse of opening", () => {
        it("asymmetric symbol closes with its reverse", () => {
            detector.registerSymbol("*-", "inline", { color: "red" });
            const match = detector.detectAt("*-text-*", 0);
            expect(match).not.toBeNull();
            expect(match!.closing).toBe("-*");
            expect(match!.closingPos).toBe(6);
        });
    });

    describe("registerInline — custom symbols", () => {
        it("registers a custom inline symbol that is then detectable", () => {
            detector.registerSymbol("++", "inline", { color: "yellow" });
            const match = detector.detectAt("++text++", 0);
            expect(match).not.toBeNull();
            expect(match!.props).toEqual({ color: "yellow" });
        });

        it("overrides a built-in symbol when re-registered", () => {
            detector.registerSymbol("**", "inline", { decoration: "underline" });
            const match = detector.detectAt("**text**", 0);
            expect(match!.props).toEqual({ decoration: "underline" });
        });
    });

    describe("detectBlockSymbol — built-in block symbols", () => {
        it.each([
            ["# text", { kind: "heading1", size: "32", weight: "bold" }, 2],
            ["## text", { kind: "heading2", size: "24", weight: "bold" }, 3],
            ["### text", { kind: "heading3", size: "18", weight: "bold" }, 4],
            ["#### text", { kind: "heading4", size: "16", weight: "bold" }, 5],
            ["##### text", { kind: "heading5", size: "14", weight: "bold" }, 6],
            ["> text", { kind: "quote", color: "gray", indent: "4" }, 2],
            ["- text", { kind: "item", indent: "2" }, 2],
            ["+ text", { kind: "item", indent: "2" }, 2],
        ] as [string, Record<string, string>, number][])(
            '"%s" → props=%o prefixLength=%i',
            (input, props, prefixLength) => {
                const match = detector.detectBlockSymbol(input);
                expect(match).not.toBeNull();
                expect(match!.props).toEqual(props);
                expect(match!.symbolLength).toBe(prefixLength);
            },
        );

        it("returns null for plain text", () => {
            expect(detector.detectBlockSymbol("Hello world")).toBeNull();
        });

        it("# without trailing space is not a block symbol", () => {
            expect(detector.detectBlockSymbol("#nospace")).toBeNull();
        });

        it("##### wins over # (maximal munch in block symbols)", () => {
            expect(detector.detectBlockSymbol("##### deep")!.props.kind).toBe("heading5");
        });
    });

    describe("registerBlock — custom block symbols", () => {
        it("registers a custom block symbol that is then detectable", () => {
            detector.registerSymbol("§ ", "block", { kind: "section" });
            const match = detector.detectBlockSymbol("§ My section");
            expect(match).not.toBeNull();
            expect(match!.props).toEqual({ kind: "section" });
        });
    });
});
