import { describe, it, expect } from "vitest";
import { compileToIR, compileToHTML } from "@atxt";
import { serialize } from "@atxt";

function normalizeHtml(html: string): string {
    return html.replace(/data-id="[^"]*"/g, "");
}

function roundTripHtml(source: string) {
    const { ir: ir1, errors: errors1 } = compileToIR(source);
    const canonical = serialize(ir1);
    const { errors: errors2 } = compileToIR(canonical);
    return {
        html1: normalizeHtml(compileToHTML(source).html),
        html2: normalizeHtml(compileToHTML(canonical).html),
        errors1,
        errors2,
    };
}

describe("Serializer — round-trip", () => {
    describe("plain text", () => {
        it("preserves a single line of plain text", () => {
            const { html1, html2 } = roundTripHtml("Hello world");
            expect(html2).toBe(html1);
        });

        it("preserves multiple lines separated by newlines", () => {
            const { html1, html2 } = roundTripHtml("Line one\nLine two\nLine three");
            expect(html2).toBe(html1);
        });

        it("preserves consecutive blank lines between paragraphs", () => {
            const { html1, html2 } = roundTripHtml("First\n\nSecond\n\n\nThird");
            expect(html2).toBe(html1);
        });
    });

    describe("inline properties and toggles", () => {
        it("preserves bold text via ** symbol", () => {
            const { html1, html2 } = roundTripHtml("This is **bold** text");
            expect(html2).toBe(html1);
        });

        it("preserves italic text via _ symbol", () => {
            const { html1, html2 } = roundTripHtml("This is _italic_ text");
            expect(html2).toBe(html1);
        });

        it("preserves strikethrough via ~~ symbol", () => {
            const { html1, html2 } = roundTripHtml("This is ~~struck~~ text");
            expect(html2).toBe(html1);
        });

        it("preserves nested inline symbols", () => {
            const { html1, html2 } = roundTripHtml("**bold and _italic_ together**");
            expect(html2).toBe(html1);
        });

        it("preserves explicit toggle annotations", () => {
            const { html1, html2 } = roundTripHtml("[[+color: red]]red text[[-color]] normal text");
            expect(html2).toBe(html1);
        });

        it("preserves multiple simultaneous inline props", () => {
            const { html1, html2 } = roundTripHtml(
                "[[+weight: bold; +color: red]]styled[[-weight; -color]]",
            );
            expect(html2).toBe(html1);
        });
    });

    describe("block annotations", () => {
        it("explicit block followed by text on next line", () => {
            const { html1, html2 } = roundTripHtml("{\n    Content\n}\nNormal text");
            expect(html2).toBe(html1);
        });

        it("block followed by text on next line", () => {
            const { html1, html2 } = roundTripHtml("# Heading\nNormal text");
            expect(html2).toBe(html1);
        });

        it("preserves a block with a kind property", () => {
            const { html1, html2 } = roundTripHtml("[[kind: quote]] {\n    Some quote\n}");
            expect(html2).toBe(html1);
        });

        it("preserves block fill and padding", () => {
            const { html1, html2 } = roundTripHtml(
                "[[fill: #f0f0f0; padding: 16]] {\n    Content\n}",
            );
            expect(html2).toBe(html1);
        });

        it("preserves nested blocks", () => {
            const source =
                "[[kind: section]] {\n" +
                "    [[kind: paragraph]] {\n" +
                "        Nested content\n" +
                "    }\n" +
                "}";
            const { html1, html2 } = roundTripHtml(source);
            expect(html2).toBe(html1);
        });

        it("preserves anonymous scope blocks", () => {
            const { html1, html2 } = roundTripHtml("{\n    Content inside\n}");
            expect(html2).toBe(html1);
        });

        it("preserves indent property", () => {
            const { html1, html2 } = roundTripHtml("[[indent: 4]] {\n    Indented\n}");
            expect(html2).toBe(html1);
        });
    });

    describe("block symbols", () => {
        it("preserves heading symbols", () => {
            const { html1, html2 } = roundTripHtml("# Heading one");
            expect(html2).toBe(html1);
        });

        it("preserves all heading levels", () => {
            const source = "# H1\n## H2\n### H3\n#### H4\n##### H5";
            const { html1, html2 } = roundTripHtml(source);
            expect(html2).toBe(html1);
        });

        it("preserves quote block symbol", () => {
            const { html1, html2 } = roundTripHtml("> A quoted line");
            expect(html2).toBe(html1);
        });

        it("preserves list item symbol", () => {
            const { html1, html2 } = roundTripHtml("- Item one\n- Item two");
            expect(html2).toBe(html1);
        });
    });

    describe("class system", () => {
        it("preserves a defined and applied class", () => {
            const source =
                "[[DEFINE class: callout; fill: #fffbe6; padding: 16]]\n" +
                "[[class: callout]] {\n    Note content\n}";
            const { html1, html2 } = roundTripHtml(source);
            expect(html2).toBe(html1);
        });

        it("preserves class with merge", () => {
            const source =
                "[[DEFINE class: base; color: gray]]\n" +
                "[[DEFINE class: child; merge: base; weight: bold]]\n" +
                "[[class: child]] {\n    Merged content\n}";
            const { html1, html2 } = roundTripHtml(source);
            expect(html2).toBe(html1);
        });

        it("preserves inline class toggles", () => {
            const source =
                "[[DEFINE class: em; weight: bold; color: red]]\n" +
                "[[+class: em]]styled[[-class: em]] normal";
            const { html1, html2 } = roundTripHtml(source);
            expect(html2).toBe(html1);
        });
    });

    describe("SET directive", () => {
        it("preserves SET propagation through siblings", () => {
            const source = "[[SET color: gray]]\nLine one\nLine two";
            const { html1, html2 } = roundTripHtml(source);
            expect(html2).toBe(html1);
        });

        it("preserves SET scoped inside a block", () => {
            const source =
                "{\n" + "    [[SET weight: bold]]\n" + "    Bold line\n" + "}\n" + "Normal line";
            const { html1, html2 } = roundTripHtml(source);
            expect(html2).toBe(html1);
        });
    });

    describe("hidden nodes", () => {
        it("preserves hidden block suppression", () => {
            const source = "[[hidden: true]] {\n    Invisible\n}\nVisible";
            const { html1, html2 } = roundTripHtml(source);
            expect(html2).toBe(html1);
        });
    });

    describe("error propagation", () => {
        it("produces no errors on either pass for valid documents", () => {
            const source =
                "[[DEFINE class: note; color: gray]]\n" +
                "# Heading\n" +
                "[[class: note]] {\n    Body text\n}";
            const { errors1, errors2 } = roundTripHtml(source);
            expect(errors1).toHaveLength(0);
            expect(errors2).toHaveLength(0);
        });
    });
});
