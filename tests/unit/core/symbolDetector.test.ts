import { describe, it, expect, beforeEach } from "vitest";
import { Lexer } from "@/core/lexer";
import { SymbolDetector } from "@/core/symbolDetector";

const S = Lexer.ESCAPE_SENTINEL;

describe("SymbolDetector", () => {
    let detector: SymbolDetector;

    beforeEach(() => {
        detector = new SymbolDetector();
    });

    describe("detectAt — built-in inline symbols", () => {
        it("detects ** at position 0", () => {
            const match = detector.detectAt("**bold**", 0);
            expect(match).not.toBeNull();
            expect(match!.className).toBe("bold");
            expect(match!.openLength).toBe(2);
            expect(match!.closing).toBe("**");
            expect(match!.closePos).toBe(6);
        });

        it("detects _ at position 0", () => {
            const match = detector.detectAt("_italic_", 0);
            expect(match!.className).toBe("italic");
            expect(match!.closePos).toBe(7);
        });

        it("detects ~~ at position 0", () => {
            const match = detector.detectAt("~~strike~~", 0);
            expect(match!.className).toBe("strikethrough");
            expect(match!.closePos).toBe(8);
        });

        it("detects a symbol at a non-zero position", () => {
            const match = detector.detectAt("Hello **world**", 6);
            expect(match).not.toBeNull();
            expect(match!.closePos).toBe(13);
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

        it("does not close across a newline", () => {
            expect(detector.detectAt("**open\n**", 0)).toBeNull();
        });
    });

    describe("detectAt — escape handling in close search (sentinel protocol)", () => {
        it("ignores a sentinel-escaped closing delimiter", () => {
            // S + "**" means the ** was escaped — not a real closer.
            // The real closer is the ** at the end.
            const match = detector.detectAt(`**text${S}** more**`, 0);
            expect(match).not.toBeNull();
            expect(match!.closePos).toBe(14);
        });

        it("does not treat sentinel-escaped backslash as escaping the following **", () => {
            // S + "\" means the \ was escaped (literal backslash) — the ** after it is a real closer.
            const match = detector.detectAt(`**text${S}\\**`, 0);
            expect(match).not.toBeNull();
            expect(match!.closePos).toBe(8);
        });
    });

    describe("detectAt — maximal munch", () => {
        it("prefers ** over a hypothetical single * when both are registered", () => {
            detector.registerInline("*", "single-star");
            const match = detector.detectAt("**bold**", 0);
            expect(match!.className).toBe("bold");
            expect(match!.openLength).toBe(2);
        });
    });

    describe("detectAt — closing is reverse of opening", () => {
        it("asymmetric symbol closes with its reverse", () => {
            detector.registerInline("*-", "custom");
            const match = detector.detectAt("*-text-*", 0);
            expect(match).not.toBeNull();
            expect(match!.closing).toBe("-*");
            expect(match!.closePos).toBe(6);
        });
    });

    describe("registerInline — custom symbols", () => {
        it("registers a custom inline symbol that is then detectable", () => {
            detector.registerInline("++", "highlight");
            const match = detector.detectAt("++text++", 0);
            expect(match).not.toBeNull();
            expect(match!.className).toBe("highlight");
        });

        it("overrides a built-in symbol when re-registered", () => {
            detector.registerInline("**", "underlined");
            const match = detector.detectAt("**text**", 0);
            expect(match!.className).toBe("underlined");
        });
    });

    describe("detectBlockSymbol — built-in block symbols", () => {
        it.each([
            ["# text", "h1", 2],
            ["## text", "h2", 3],
            ["### text", "h3", 4],
            ["#### text", "h4", 5],
            ["##### text", "h5", 6],
            ["> text", "blockquote", 2],
            ["- text", "list-item", 2],
            ["+ text", "list-ordered", 2],
        ])('"%s" → cls=%s prefixLength=%i', (input, cls, prefixLength) => {
            const match = detector.detectBlockSymbol(input);
            expect(match).not.toBeNull();
            expect(match!.cls).toBe(cls);
            expect(match!.prefixLength).toBe(prefixLength);
        });

        it("returns null for plain text", () => {
            expect(detector.detectBlockSymbol("Hello world")).toBeNull();
        });

        it("# without trailing space is not a block symbol", () => {
            expect(detector.detectBlockSymbol("#nospace")).toBeNull();
        });

        it("##### wins over # (maximal munch in block symbols)", () => {
            expect(detector.detectBlockSymbol("##### deep")!.cls).toBe("h5");
        });
    });

    describe("registerBlock — custom block symbols", () => {
        it("registers a custom block symbol that is then detectable", () => {
            detector.registerBlock("§ ", "section");
            const match = detector.detectBlockSymbol("§ My section");
            expect(match).not.toBeNull();
            expect(match!.cls).toBe("section");
        });
    });
});
