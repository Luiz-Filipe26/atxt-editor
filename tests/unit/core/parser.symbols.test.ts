import { describe, it, expect } from "vitest";
import { Lexer, Parser, AST } from "@atxt";
import { BUILT_IN_SYMBOLS } from "@atxt/domain/builtInSymbols";
const { NodeType } = AST;

function parse(source: string) {
    const { tokens } = Lexer.tokenize(source);
    return Parser.parse(tokens);
}

function annotations(nodes: AST.BlockContentNode[]): AST.AnnotationNode[] {
    return nodes.filter((n): n is AST.AnnotationNode => n.type === NodeType.ANNOTATION);
}

describe("Parser — symbol expansion", () => {
    describe("block symbols", () => {
        describe("block symbols", () => {
            it.each(BUILT_IN_SYMBOLS.filter((s) => s.type === "block"))(
                '"$sequence" produces the correct properties',
                ({ sequence, props }) => {
                    const { document, errors } = parse(sequence + "text");
                    expect(errors).toHaveLength(0);
                    const ann = annotations(document.children)[0];
                    expect(ann).toBeDefined();
                    for (const { name, value } of props) {
                        expect(ann.properties.find((p) => p.key === name)?.value).toBe(value);
                    }
                },
            );
        });

        it("block symbol target contains the rest of the line as children", () => {
            const { document } = parse("# My Heading");
            const ann = annotations(document.children)[0];
            const target = ann.target as AST.BlockNode;
            const content = target.children
                .filter((c): c is AST.TextNode => c.type === NodeType.TEXT)
                .map((c) => c.content)
                .join("");
            expect(content).toBe("My Heading");
        });

        it("plain text is not treated as a block symbol", () => {
            const { document } = parse("Hello world");
            expect(annotations(document.children)).toHaveLength(0);
        });

        it("#text without space is not a block symbol", () => {
            const { document } = parse("#nospace");
            expect(annotations(document.children)).toHaveLength(0);
        });

        it("inline symbols inside a block symbol target are also expanded", () => {
            const { document } = parse("# **bold** heading");
            const ann = annotations(document.children)[0];
            const target = ann.target as AST.BlockNode;
            expect(annotations(target.children)).toHaveLength(2);
        });
    });

    describe("inline symbols", () => {
        it("**text** produces toggle-plus, TextNode, toggle-minus in document children", () => {
            const { document, errors } = parse("**bold**");
            expect(errors).toHaveLength(0);
            const ann = annotations(document.children);
            expect(ann).toHaveLength(2);
            expect(ann[0].properties[0].toggle).toBe("plus");
            expect(ann[0].properties[0].key).toBe("weight");
            expect(ann[0].properties[0].value).toBe("bold");
            expect(ann[1].properties[0].toggle).toBe("minus");
            expect(ann[1].properties[0].key).toBe("weight");
        });

        it("_text_ produces italic style toggle", () => {
            const { document } = parse("_italic_");
            expect(annotations(document.children)[0].properties[0].key).toBe("style");
            expect(annotations(document.children)[0].properties[0].value).toBe("italic");
        });

        it("~~text~~ produces line-through decoration toggle", () => {
            const { document } = parse("~~strike~~");
            expect(annotations(document.children)[0].properties[0].key).toBe("decoration");
            expect(annotations(document.children)[0].properties[0].value).toBe("line-through");
        });

        it("unclosed ** degenerates to literal text", () => {
            const { document } = parse("**unclosed");
            expect(annotations(document.children)).toHaveLength(0);
            const allText = document.children
                .filter((c): c is AST.TextNode => c.type === NodeType.TEXT)
                .map((c) => c.content)
                .join("");
            expect(allText).toContain("**unclosed");
        });

        it("**** with empty content degenerates to literal text", () => {
            const { document } = parse("****");
            expect(annotations(document.children)).toHaveLength(0);
        });

        it("inline symbols expand inside annotation targets", () => {
            const { document } = parse("[[color: red]] **bold**");
            const ann = document.children.find(
                (c): c is AST.AnnotationNode => c.type === NodeType.ANNOTATION,
            )!;
            const target = ann.target as AST.BlockNode;
            expect(annotations(target.children)).toHaveLength(2);
        });
    });

    describe("custom symbol registration via SYMBOL", () => {
        it("a SYMBOL inline directive registers a new inline symbol", () => {
            const { document, errors } = parse(
                "[[SYMBOL symbol: ++; class: highlight; type: inline]]\n++text++",
            );
            expect(errors).toHaveLength(0);
            const ann = annotations(document.children).filter((a) => a.directive === "NORMAL");
            expect(ann[0].properties[0].value).toBe("highlight");
        });

        it("a SYMBOL block directive registers a new block symbol", () => {
            const { document, errors } = parse(
                "[[SYMBOL symbol: >>; class: my-section; type: block]]\n>> My section",
            );
            expect(errors).toHaveLength(0);
            const blockAnn = annotations(document.children).find((a) =>
                a.properties.some((p) => p.value === "my-section"),
            );
            expect(blockAnn).toBeDefined();
        });

        it("SYMBOL without props is silently ignored", () => {
            const { document, errors } = parse("[[SYMBOL symbol: ++; type: inline]]\n++text++");
            expect(errors).toHaveLength(0);
            const allText = document.children
                .filter((c): c is AST.TextNode => c.type === NodeType.TEXT)
                .map((c) => c.content)
                .join("");
            expect(allText).toContain("++text++");
        });

        it("a custom symbol defined mid-document does not apply before its definition", () => {
            const { document } = parse(
                "++text++\n[[SYMBOL symbol: ++; class: highlight; type: inline]]",
            );
            const firstLine = document.children.slice(
                0,
                document.children.findIndex((c) => c.type === NodeType.ANNOTATION),
            );
            expect(annotations(firstLine)).toHaveLength(0);
        });

        it("SYMBOL without type defaults to inline", () => {
            const { document, errors } = parse("[[SYMBOL symbol: ++; class: highlight]]\n++text++");
            expect(errors).toHaveLength(0);
            const ann = annotations(document.children).filter((a) => a.directive === "NORMAL");
            expect(ann[0].properties[0].value).toBe("highlight");
        });

        it("SYMBOL directive without a symbol property is silently ignored", () => {
            const { document, errors } = parse("[[SYMBOL class: highlight]]");
            expect(errors).toHaveLength(0);
            expect(document.children).toHaveLength(0);
        });

        it("SYMBOL directive preserves the blank line that follows it", () => {
            const { document } = parse("[[SYMBOL symbol: ^^; weight: bold]]\n\nText");
            const newlines = document.children.filter((c) => c.type === NodeType.NEWLINE);
            expect(newlines.length).toBeGreaterThanOrEqual(1);
        });
    });
});
