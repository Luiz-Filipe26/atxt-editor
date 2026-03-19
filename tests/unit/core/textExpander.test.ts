import { describe, it, expect } from "vitest";
import { SymbolDetector } from "@/core/symbolDetector";
import { TextExpander } from "@/core/textExpander";
import { NodeType } from "@/types/ast";
import * as AST from "@/types/ast";

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
            const result = makeExpander().expand("Hello world", 1, 1);
            expect(result).toHaveLength(1);
            expect((result[0] as AST.TextNode).content).toBe("Hello world");
        });

        it("returns empty array for empty string", () => {
            expect(makeExpander().expand("", 1, 1)).toHaveLength(0);
        });

        it("preserves trailing newline in the last TextNode", () => {
            const result = makeExpander().expand("Hello\n", 1, 1);
            expect((result[0] as AST.TextNode).content).toBe("Hello\n");
        });
    });

    describe("inline symbol expansion", () => {
        it("expands **text** to toggle-open, TextNode, toggle-close", () => {
            const result = makeExpander().expand("**bold**", 1, 1);
            expect(result).toHaveLength(3);
            const [open, text, close] = result as [
                AST.AnnotationNode,
                AST.TextNode,
                AST.AnnotationNode,
            ];
            expect(open.properties[0].key).toBe("class");
            expect(open.properties[0].value).toBe("bold");
            expect(open.properties[0].toggle).toBe("plus");
            expect(text.content).toBe("bold");
            expect(close.properties[0].toggle).toBe("minus");
            expect(close.properties[0].value).toBe("bold");
        });

        it("emits ** as literal when no closing delimiter exists", () => {
            const result = makeExpander().expand("**no close", 1, 1);
            expect(annotations(result)).toHaveLength(0);
            expect(texts(result).join("")).toBe("**no close");
        });

        it("emits **** as literal when content is empty", () => {
            const result = makeExpander().expand("****", 1, 1);
            expect(annotations(result)).toHaveLength(0);
            expect(texts(result).join("")).toBe("****");
        });

        it("expands symbol surrounded by plain text", () => {
            const result = makeExpander().expand("Hello **world** end", 1, 1);
            expect(annotations(result)).toHaveLength(2);
            expect(texts(result).join("")).toContain("Hello ");
            expect(texts(result).join("")).toContain("world");
            expect(texts(result).join("")).toContain(" end");
        });
    });

    describe("nesting", () => {
        it("expands nested symbols recursively", () => {
            const result = makeExpander().expand("**outer _inner_ end**", 1, 1);
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
            const result = makeExpander().expand("hello world", 1, 1);
            expect((result[0] as AST.TextNode).content).toBe("hello world");
        });
    });

    describe("line boundary", () => {
        it("does not close a symbol across a newline", () => {
            const result = makeExpander().expand("**open\n**close", 1, 1);
            expect(annotations(result)).toHaveLength(0);
        });
    });

    describe("source position tracking", () => {
        it("assigns correct column to a TextNode before the symbol", () => {
            const result = makeExpander().expand("Hello **bold**", 1, 1);
            expect((result[0] as AST.TextNode).column).toBe(1);
        });

        it("assigns correct column to the opening toggle", () => {
            const result = makeExpander().expand("Hello **bold**", 1, 1);
            expect(annotations(result)[0].column).toBe(7);
        });

        it("assigns correct column to the closing toggle", () => {
            const result = makeExpander().expand("Hello **bold**", 1, 1);
            expect(annotations(result)[1].column).toBe(13);
        });
    });
});
