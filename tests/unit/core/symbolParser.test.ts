import { describe, it, expect } from "vitest";
import { Lexer, AST, TokenType } from "@atxt";
import { SymbolDetector } from "@atxt/compiler/symbolDetector";
import { SymbolParser } from "@atxt/compiler/symbolParser";
import { PropertyToggle } from "@/core/atxt/types/ast";
const { NodeType } = AST;

function expand(text: string): AST.BlockContentNode[] {
    const token = { literal: text, line: 1, column: 1, type: TokenType.Text };
    return SymbolParser.expandInlineAt(token, new SymbolDetector());
}

function texts(nodes: AST.BlockContentNode[]): string[] {
    return nodes.filter((n): n is AST.TextNode => n.type === NodeType.Text).map((n) => n.content);
}

function annotations(nodes: AST.BlockContentNode[]): AST.AnnotationNode[] {
    return nodes.filter((n): n is AST.AnnotationNode => n.type === NodeType.Annotation);
}

describe("TextExpander", () => {
    describe("plain text passthrough", () => {
        it("returns a single TextNode for content with no symbols", () => {
            const result = expand("Hello world");
            expect(result).toHaveLength(1);
            expect((result[0] as AST.TextNode).content).toBe("Hello world");
        });

        it("returns empty array for empty string", () => {
            expect(expand("")).toHaveLength(0);
        });

        it("preserves trailing newline in the last TextNode", () => {
            const result = expand("Hello\n");
            expect((result[0] as AST.TextNode).content).toBe("Hello\n");
        });
    });

    describe("inline symbol expansion", () => {
        it("expands **text** to toggle-open, TextNode, toggle-close", () => {
            const result = expand("**bold**");
            expect(result).toHaveLength(3);
            const [open, text, close] = result as [
                AST.AnnotationNode,
                AST.TextNode,
                AST.AnnotationNode,
            ];
            expect(open.properties[0].key).toBe("weight");
            expect(open.properties[0].value).toBe("bold");
            expect(open.properties[0].toggle).toBe(PropertyToggle.Plus);
            expect(text.content).toBe("bold");
            expect(close.properties[0].toggle).toBe(PropertyToggle.Minus);
            expect(close.properties[0].key).toBe("weight");
        });

        it("emits ** as literal when no closing delimiter exists", () => {
            const result = expand("**no close");
            expect(annotations(result)).toHaveLength(0);
            expect(texts(result).join("")).toBe("**no close");
        });

        it("emits **** as literal when content is empty", () => {
            const result = expand("****");
            expect(annotations(result)).toHaveLength(0);
            expect(texts(result).join("")).toBe("****");
        });

        it("expands symbol surrounded by plain text", () => {
            const result = expand("Hello **world** end");
            expect(annotations(result)).toHaveLength(2);
            expect(texts(result).join("")).toContain("Hello ");
            expect(texts(result).join("")).toContain("world");
            expect(texts(result).join("")).toContain(" end");
        });
    });

    describe("nesting", () => {
        it("expands nested symbols recursively", () => {
            const result = expand("**outer _inner_ end**");
            const ann = annotations(result);
            expect(ann).toHaveLength(4);
            expect(ann[0].properties[0].value).toBe("bold");
            expect(ann[1].properties[0].value).toBe("italic");
            expect(ann[2].properties[0].toggle).toBe(PropertyToggle.Minus);
            expect(ann[3].properties[0].toggle).toBe(PropertyToggle.Minus);
        });
    });

    describe("escape handling", () => {
        it("backslash characters pass through as literals since Lexer handles escape", () => {
            const result = expand("hello world");
            expect((result[0] as AST.TextNode).content).toBe("hello world");
        });

        it("sentinel-prefixed character is emitted as literal and does not open a symbol", () => {
            const result = expand(`${Lexer.ESCAPE_SENTINEL}**not bold**`);
            expect(annotations(result)).toHaveLength(0);
            expect(texts(result).join("")).toContain("**not bold**");
        });

        it("sentinel at end of string is consumed without emitting anything", () => {
            const result = expand(`hello${Lexer.ESCAPE_SENTINEL}`);
            expect(texts(result).join("")).toBe("hello");
        });

        it("sentinel after text appends escaped char to existing buffer", () => {
            const result = expand(`hello${Lexer.ESCAPE_SENTINEL}**world`);
            expect(texts(result).join("")).toBe("hello**world");
            expect(annotations(result)).toHaveLength(0);
        });
    });

    describe("source position tracking", () => {
        it("assigns correct column to a TextNode before the symbol", () => {
            const result = expand("Hello **bold**");
            expect((result[0] as AST.TextNode).column).toBe(1);
        });

        it("assigns correct column to the opening toggle", () => {
            const result = expand("Hello **bold**");
            expect(annotations(result)[0].column).toBe(7);
        });

        it("assigns correct column to the closing toggle", () => {
            const result = expand("Hello **bold**");
            expect(annotations(result)[1].column).toBe(13);
        });
    });
});
