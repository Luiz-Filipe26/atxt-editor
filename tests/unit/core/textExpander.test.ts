import { describe, it, expect } from "vitest";
import { Lexer, AST } from "@atxt";
import { SymbolDetector } from "@atxt/compiler/symbolDetector";
import { TextExpander } from "@atxt/compiler/textExpander";
const { NodeType } = AST;

function makeExpander(): TextExpander {
    return new TextExpander(new SymbolDetector());
}

function texts(nodes: AST.BlockContentNode[]): string[] {
    return nodes.filter((n): n is AST.TextNode => n.type === NodeType.TEXT).map((n) => n.content);
}

function annotations(nodes: AST.BlockContentNode[]): AST.AnnotationNode[] {
    return nodes.filter((n): n is AST.AnnotationNode => n.type === NodeType.ANNOTATION);
}

describe("TextExpander", () => {
    describe("plain text passthrough", () => {
        it("returns a single TextNode for content with no symbols", () => {
            const result = makeExpander().expandSymbolsOnText("Hello world", 1, 1);
            expect(result).toHaveLength(1);
            expect((result[0] as AST.TextNode).content).toBe("Hello world");
        });

        it("returns empty array for empty string", () => {
            expect(makeExpander().expandSymbolsOnText("", 1, 1)).toHaveLength(0);
        });

        it("preserves trailing newline in the last TextNode", () => {
            const result = makeExpander().expandSymbolsOnText("Hello\n", 1, 1);
            expect((result[0] as AST.TextNode).content).toBe("Hello\n");
        });
    });

    describe("inline symbol expansion", () => {
        it("expands **text** to toggle-open, TextNode, toggle-close", () => {
            const result = makeExpander().expandSymbolsOnText("**bold**", 1, 1);
            expect(result).toHaveLength(3);
            const [open, text, close] = result as [
                AST.AnnotationNode,
                AST.TextNode,
                AST.AnnotationNode,
            ];
            expect(open.properties[0].key).toBe("weight");
            expect(open.properties[0].value).toBe("bold");
            expect(open.properties[0].toggle).toBe("plus");
            expect(text.content).toBe("bold");
            expect(close.properties[0].toggle).toBe("minus");
            expect(close.properties[0].key).toBe("weight");
        });

        it("emits ** as literal when no closing delimiter exists", () => {
            const result = makeExpander().expandSymbolsOnText("**no close", 1, 1);
            expect(annotations(result)).toHaveLength(0);
            expect(texts(result).join("")).toBe("**no close");
        });

        it("emits **** as literal when content is empty", () => {
            const result = makeExpander().expandSymbolsOnText("****", 1, 1);
            expect(annotations(result)).toHaveLength(0);
            expect(texts(result).join("")).toBe("****");
        });

        it("expands symbol surrounded by plain text", () => {
            const result = makeExpander().expandSymbolsOnText("Hello **world** end", 1, 1);
            expect(annotations(result)).toHaveLength(2);
            expect(texts(result).join("")).toContain("Hello ");
            expect(texts(result).join("")).toContain("world");
            expect(texts(result).join("")).toContain(" end");
        });
    });

    describe("nesting", () => {
        it("expands nested symbols recursively", () => {
            const result = makeExpander().expandSymbolsOnText("**outer _inner_ end**", 1, 1);
            const ann = annotations(result);
            expect(ann).toHaveLength(4);
            expect(ann[0].properties[0].value).toBe("bold");
            expect(ann[1].properties[0].value).toBe("italic");
            expect(ann[2].properties[0].toggle).toBe("minus");
            expect(ann[3].properties[0].toggle).toBe("minus");
        });
    });

    describe("escape handling", () => {
        it("backslash characters pass through as literals since Lexer handles escape", () => {
            const result = makeExpander().expandSymbolsOnText("hello world", 1, 1);
            expect((result[0] as AST.TextNode).content).toBe("hello world");
        });

        it("sentinel-prefixed character is emitted as literal and does not open a symbol", () => {
            const result = makeExpander().expandSymbolsOnText(
                `${Lexer.ESCAPE_SENTINEL}**not bold**`,
                1,
                1,
            );
            expect(annotations(result)).toHaveLength(0);
            expect(texts(result).join("")).toContain("**not bold**");
        });

        it("sentinel at end of string is consumed without emitting anything", () => {
            const result = makeExpander().expandSymbolsOnText(
                `hello${Lexer.ESCAPE_SENTINEL}`,
                1,
                1,
            );
            expect(texts(result).join("")).toBe("hello");
        });

        it("sentinel after text appends escaped char to existing buffer", () => {
            const result = makeExpander().expandSymbolsOnText(
                `hello${Lexer.ESCAPE_SENTINEL}**world`,
                1,
                1,
            );
            expect(texts(result).join("")).toBe("hello**world");
            expect(annotations(result)).toHaveLength(0);
        });
    });

    describe("line boundary", () => {
        it("does not close a symbol across a newline", () => {
            const result = makeExpander().expandSymbolsOnText("**open\n**close", 1, 1);
            expect(annotations(result)).toHaveLength(0);
        });
    });

    describe("source position tracking", () => {
        it("assigns correct column to a TextNode before the symbol", () => {
            const result = makeExpander().expandSymbolsOnText("Hello **bold**", 1, 1);
            expect((result[0] as AST.TextNode).column).toBe(1);
        });

        it("assigns correct column to the opening toggle", () => {
            const result = makeExpander().expandSymbolsOnText("Hello **bold**", 1, 1);
            expect(annotations(result)[0].column).toBe(7);
        });

        it("assigns correct column to the closing toggle", () => {
            const result = makeExpander().expandSymbolsOnText("Hello **bold**", 1, 1);
            expect(annotations(result)[1].column).toBe(13);
        });
    });
});
