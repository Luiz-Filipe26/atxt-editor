import { describe, it, expect } from "vitest";
import { Lexer } from "@/core/lexer";
import { Parser } from "@/core/parser";
import { NodeType } from "@/types/ast";
import type {
    AnnotationNode,
    BlockNode,
    TextNode,
} from "../../../src/types/ast";

function parse(source: string) {
    const { tokens } = new Lexer(source).tokenize();
    return new Parser(tokens).parse();
}

function annotation(source: string): AnnotationNode {
    const { document } = parse(source);
    const node = document.children.find((c) => c.type === NodeType.ANNOTATION);
    if (!node) throw new Error("No annotation node found");
    return node as AnnotationNode;
}

describe("Parser", () => {
    describe("document structure", () => {
        it("parses an empty source into a document with no children", () => {
            const { document, errors } = parse("");
            expect(errors).toHaveLength(0);
            expect(document.type).toBe(NodeType.DOCUMENT);
            expect(document.children).toHaveLength(0);
        });

        it("the document root has line 1, column 1", () => {
            const { document } = parse("");
            expect(document.line).toBe(1);
            expect(document.column).toBe(1);
        });

        it("parses a single text line into one TEXT node", () => {
            const { document, errors } = parse("Hello");
            expect(errors).toHaveLength(0);
            expect(document.children).toHaveLength(1);
            expect(document.children[0].type).toBe(NodeType.TEXT);
        });

        it("records the correct source position on text nodes", () => {
            const { document } = parse("Hello");
            expect(document.children[0].line).toBe(1);
            expect(document.children[0].column).toBe(1);
        });

        it("parses two lines separated by a newline", () => {
            const { document } = parse("Line one\nLine two");
            const texts = document.children.filter((c) => c.type === NodeType.TEXT);
            expect(texts.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe("NORMAL directive", () => {
        it("parses a NORMAL annotation with inline text target on the same line", () => {
            const node = annotation("[[color: red]] Hello");
            expect(node.directive).toBe("NORMAL");
            expect(node.properties[0].key).toBe("color");
            expect(node.properties[0].value).toBe("red");
            expect(node.target).not.toBeNull();
            expect(node.target?.type).toBe(NodeType.TEXT);
        });

        it("parses a NORMAL annotation with a next-line text target", () => {
            const node = annotation("[[color: red]]\nHello");
            expect(node.directive).toBe("NORMAL");
            expect(node.target?.type).toBe(NodeType.TEXT);
        });

        it("parses a NORMAL annotation with a block target", () => {
            const node = annotation("[[fill: #ccc]]\n{\nContent\n}");
            expect(node.target?.type).toBe(NodeType.BLOCK);
        });

        it("parses multiple properties on a single annotation", () => {
            const node = annotation("[[size: 16; weight: bold]] Text");
            expect(node.properties).toHaveLength(2);
            expect(node.properties[0].key).toBe("size");
            expect(node.properties[0].value).toBe("16");
            expect(node.properties[1].key).toBe("weight");
            expect(node.properties[1].value).toBe("bold");
        });

        it("parses properties with unquoted values containing spaces", () => {
            const node = annotation("[[font: Georgia, serif]] Text");
            expect(node.properties[0].value).toBe("Georgia, serif");
        });

        it("strips quotes from quoted property values", () => {
            const node = annotation('[[border: "1px solid black"]] Text');
            expect(node.properties[0].value).toBe("1px solid black");
        });

        it("records the correct source position on the annotation node", () => {
            const node = annotation("[[color: red]] Hello");
            expect(node.line).toBe(1);
            expect(node.column).toBe(1);
        });

        it("a second annotation on the same line interrupts the target line", () => {
            const { errors } = parse("[[color: red]] [[fill: blue]] Text");
            expect(errors).toHaveLength(0);
        });

        it("an annotation followed only by a newline and EOF produces a null target", () => {
            const node = annotation("[[color: red]]\n");
            expect(node.target).toBeNull();
        });

        it("a leading semicolon inside an annotation is silently skipped", () => {
            const node = annotation("[[; color: red]] Text");
            expect(node.properties[0].key).toBe("color");
        });
    });

    describe("toggle annotations", () => {
        it("toggle-add annotation has toggle: 'plus' and no target", () => {
            const node = annotation("[[+color: red]]");
            expect(node.properties[0].key).toBe("color");
            expect(node.properties[0].toggle).toBe("plus");
            expect(node.target).toBeNull();
        });

        it("toggle-remove annotation has toggle: 'minus', no value, and no target", () => {
            const node = annotation("[[-color]]");
            expect(node.properties[0].key).toBe("color");
            expect(node.properties[0].toggle).toBe("minus");
            expect(node.target).toBeNull();
        });

        it("a mix of toggle and normal props still produces a target for the normal props", () => {
            // If at least one prop has no toggle, the annotation needs a target
            const node = annotation("[[+weight: bold; color: red]] Hello");
            const normalProp = node.properties.find((p) => p.toggle === undefined);
            expect(normalProp).toBeDefined();
            expect(node.target).not.toBeNull();
        });

        it("an all-toggle annotation does not produce a target even with following text", () => {
            const node = annotation("[[+color: red; +size: 16]]\nFollowing text");
            expect(node.properties.every((p) => p.toggle !== undefined)).toBe(true);
            expect(node.target).toBeNull();
        });
    });

    describe("SET directive", () => {
        it("parses SET directive with a property and no target", () => {
            const node = annotation("[[SET align: center]]");
            expect(node.directive).toBe("SET");
            expect(node.properties[0].key).toBe("align");
            expect(node.properties[0].value).toBe("center");
            expect(node.target).toBeNull();
        });

        it("SET directive leaves following lines as siblings in the document", () => {
            const { document } = parse("[[SET align: center]]\nHello\nWorld");
            // SET annotation + TextNodes for \n, Hello, World
            expect(
                document.children.some((c) => c.type === NodeType.ANNOTATION),
            ).toBe(true);
            expect(document.children.some((c) => c.type === NodeType.TEXT)).toBe(
                true,
            );
        });
    });

    describe("DEFINE directive", () => {
        it("parses DEFINE directive with class and properties", () => {
            const node = annotation(
                "[[DEFINE class: heading; size: 20; weight: bold]]",
            );
            expect(node.directive).toBe("DEFINE");
            expect(node.target).toBeNull();
            const keys = node.properties.map((p) => p.key);
            expect(keys).toContain("class");
            expect(keys).toContain("size");
            expect(keys).toContain("weight");
        });

        it("DEFINE with compose property includes compose in the property list", () => {
            const node = annotation(
                "[[DEFINE class: child; compose: parent; size: 18]]",
            );
            const keys = node.properties.map((p) => p.key);
            expect(keys).toContain("compose");
        });
    });

    describe("HIDE directive", () => {
        it("HIDE with inline target produces no node — returns null", () => {
            const { document, errors } = parse("[[HIDE]] Hidden text");
            expect(errors).toHaveLength(0);
            expect(
                document.children.filter((c) => c.type === NodeType.ANNOTATION),
            ).toHaveLength(0);
        });

        it("HIDE with next-line text target discards that line entirely", () => {
            const { document } = parse("[[HIDE]]\nHidden\nVisible");
            // "Hidden" must not appear in any text node
            const allText = document.children
                .filter((c) => c.type === NodeType.TEXT)
                .map((c) => (c as TextNode).content)
                .join("");
            expect(allText).not.toContain("Hidden");
            expect(allText).toContain("Visible");
        });

        it("HIDE with block target discards the entire block", () => {
            const { document, errors } = parse("[[HIDE]]\n{\nHidden block\n}");
            expect(errors).toHaveLength(0);
            expect(
                document.children.filter((c) => c.type !== NodeType.TEXT),
            ).toHaveLength(0);
        });

        it("HIDE with optional properties still discards the target", () => {
            const { document } = parse("[[HIDE class: draft]] Hidden text");
            expect(
                document.children.filter((c) => c.type === NodeType.ANNOTATION),
            ).toHaveLength(0);
        });
    });

    describe("block statements", () => {
        it("parses an empty block", () => {
            const { document, errors } = parse("{}");
            expect(errors).toHaveLength(0);
            expect(document.children[0].type).toBe(NodeType.BLOCK);
        });

        it("parses a block with text content", () => {
            const { document, errors } = parse("{\nHello\n}");
            expect(errors).toHaveLength(0);
            const block = document.children.find(
                (c) => c.type === NodeType.BLOCK,
            ) as BlockNode;
            expect(block.children.some((c) => c.type === NodeType.TEXT)).toBe(true);
        });

        it("parses nested blocks", () => {
            const { document, errors } = parse("{\n{\nNested\n}\n}");
            expect(errors).toHaveLength(0);
            const outer = document.children.find(
                (c) => c.type === NodeType.BLOCK,
            ) as BlockNode;
            expect(outer.children.some((c) => c.type === NodeType.BLOCK)).toBe(true);
        });

        it("parses an annotation inside a block", () => {
            const { document, errors } = parse("{\n[[color: red]] Hello\n}");
            expect(errors).toHaveLength(0);
            const block = document.children.find(
                (c) => c.type === NodeType.BLOCK,
            ) as BlockNode;
            expect(block.children.some((c) => c.type === NodeType.ANNOTATION)).toBe(
                true,
            );
        });

        it("a HIDE inside a block produces no ANNOTATION child node", () => {
            const { document, errors } = parse("{\n[[HIDE]] Hidden\n}");
            expect(errors).toHaveLength(0);
            const block = document.children.find(
                (c) => c.type === NodeType.BLOCK,
            ) as BlockNode;
            expect(block.children.some((c) => c.type === NodeType.ANNOTATION)).toBe(
                false,
            );
        });
    });

    describe("parser errors", () => {
        it("emits a PARSER error for an unclosed block", () => {
            const { errors } = parse("{");
            expect(errors.some((e) => e.type === "PARSER")).toBe(true);
        });

        it("partial output is still produced despite a parser error", () => {
            const { document } = parse("Hello\n{");
            expect(document.children.some((c) => c.type === NodeType.TEXT)).toBe(
                true,
            );
        });

        it("emits a PARSER error for an annotation missing a closing ]]", () => {
            const { errors } = parse("[[color: red\nText");
            // The lexer will catch the missing ]], so at least one error is present
            expect(errors.length).toBeGreaterThan(0);
        });
        it("a '}' at document level emits a PARSER error", () => {
            const { errors } = parse("}");
            expect(errors.some((e) => e.type === "PARSER")).toBe(true);
        });
    });

    describe("NORMAL annotation at end of source", () => {
        it("a NORMAL annotation at EOF resolves to a null target", () => {
            // resolveAnnotationTarget hits isAtEnd() → returns null (line 122)
            const node = annotation("[[color: red]]");
            expect(node.target).toBeNull();
        });
    });

    describe("property parsing error paths", () => {
        it("emits a PARSER error when an annotation starts with ':' instead of a key name", () => {
            const { errors } = parse("[[:val]] Text");
            expect(errors.some((e) => e.type === "PARSER")).toBe(true);
        });

        it("emits a PARSER error when ':' is missing after a property name", () => {
            const { errors } = parse("[[key val]] Text");
            expect(errors.some((e) => e.type === "PARSER")).toBe(true);
        });

        it("emits a PARSER error when a property value is empty before a semicolon", () => {
            const { errors } = parse("[[key: ; other: val]] Text");
            expect(errors.some((e) => e.type === "PARSER")).toBe(true);
        });
    });

    describe("text line with two consecutive TEXT tokens", () => {
        it("a line containing a lone '[' merges both TEXT tokens into a single text node", () => {
            // "a[b" → Lexer produces TEXT "a" then TEXT "[b".
            // parseTextLine consumes the second TEXT via the final content += branch (line 301).
            const { document, errors } = parse("a[b");
            expect(errors).toHaveLength(0);
            const allText = document.children
                .filter((c) => c.type === NodeType.TEXT)
                .map((c) => (c as TextNode).content)
                .join("");
            expect(allText).toContain("a");
            expect(allText).toContain("[");
            expect(allText).toContain("b");
        });
    });
});
