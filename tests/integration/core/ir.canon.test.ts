import { describe, it, expect } from "vitest";
import { compileToIR } from "@atxt";
import { serialize } from "@atxt";
import * as IR from "@atxt/types/ir";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function normalizeMap(map: Map<string, string>): Map<string, string> {
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function stripIds(node: IR.Node): IR.Node {
    if (node.type === IR.NodeType.Block) {
        return {
            ...node,
            id: "",
            line: 0,
            column: 0,
            props: normalizeMap(node.props),
            ownProps: normalizeMap(node.ownProps),
            children: node.children.map(stripIds),
        };
    }
    if (node.type === IR.NodeType.Text) {
        return {
            ...node,
            id: "",
            line: 0,
            column: 0,
            props: normalizeMap(node.props),
            ownProps: normalizeMap(node.ownProps),
        };
    }
    return { ...node, id: "", line: 0, column: 0 };
}

function compToIr(source: string) {
    const { ir, errors } = compileToIR(source);
    return { ir: stripIds(ir.root), errors };
}

function compToIrCanon(source: string) {
    const { ir: ir1 } = compileToIR(source);
    const canonical = serialize(ir1);
    const { ir: ir2, errors } = compileToIR(canonical);
    return { ir: stripIds(ir2.root), errors };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IR canonicalization", () => {
    describe("plain text", () => {
        it("single line", () => {
            const source = "Hello world";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("multiple lines", () => {
            const source = "Line one\nLine two\nLine three";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("blank lines between paragraphs", () => {
            const source = "First\n\nSecond\n\n\nThird";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });
    });

    describe("inline symbols", () => {
        it("bold via **", () => {
            const source = "This is **bold** text";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("italic via _", () => {
            const source = "This is _italic_ text";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("strikethrough via ~~", () => {
            const source = "This is ~~struck~~ text";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("nested inline symbols", () => {
            const source = "**bold and _italic_ together**";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });
    });

    describe("block symbols", () => {
        it("heading 1 via #", () => {
            const source = "# Heading one";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("all heading levels", () => {
            const source = "# H1\n## H2\n### H3\n#### H4\n##### H5";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("quote block via >", () => {
            const source = "> A quoted line";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("list item via -", () => {
            const source = "- Item one\n- Item two";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });
    });

    describe("explicit annotations", () => {
        it("block with kind property", () => {
            const source = "[[kind: quote]] {\n    Some quote\n}";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("block with fill and padding", () => {
            const source = "[[fill: #f0f0f0; padding: 16]] {\n    Content\n}";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("nested blocks", () => {
            const source =
                "[[kind: section]] {\n" +
                "    [[kind: paragraph]] {\n" +
                "        Nested content\n" +
                "    }\n" +
                "}";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("anonymous scope block", () => {
            const source = "{\n    Content inside\n}";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("indent property", () => {
            const source = "[[indent: 4]] {\n    Indented\n}";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("hidden block", () => {
            const source = "[[hidden: true]] {\n    Invisible\n}\nVisible";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });
    });

    describe("class system", () => {
        it("defined and applied class", () => {
            const source =
                "[[DEFINE class: callout; fill: #fffbe6; padding: 16]]\n" +
                "[[class: callout]] {\n    Note content\n}";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("class with merge", () => {
            const source =
                "[[DEFINE class: base; color: gray]]\n" +
                "[[DEFINE class: child; merge: base; weight: bold]]\n" +
                "[[class: child]] {\n    Merged content\n}";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("inline class toggles", () => {
            const source =
                "[[DEFINE class: em; weight: bold; color: red]]\n" +
                "[[+class: em]]styled[[-class: em]] normal";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });
    });

    describe("SET directive", () => {
        it("SET propagation through siblings", () => {
            const source = "[[SET color: gray]]\nLine one\nLine two";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("SET scoped inside a block", () => {
            const source =
                "{\n" + "    [[SET weight: bold]]\n" + "    Bold line\n" + "}\n" + "Normal line";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });

        it("SET with multiple inline props", () => {
            const source = "[[SET color: red; weight: bold]]\nStyled line";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });
    });

    describe("no errors on either pass", () => {
        it("complex document produces no errors after round-trip", () => {
            const source =
                "[[DEFINE class: note; color: gray]]\n" +
                "# Heading\n" +
                "[[class: note]] {\n    Body text\n}\n" +
                "[[SET weight: bold]]\n" +
                "Bold line\n" +
                "> Quoted";
            const { errors: e1 } = compToIr(source);
            const { errors: e2 } = compToIrCanon(source);
            expect(e1).toHaveLength(0);
            expect(e2).toHaveLength(0);
        });
    });

    describe("complex documents", () => {
        it("SET at root level, SET inside anonymous block, and annotated blocks in sequence", () => {
            const source =
                "[[DEFINE class: body; color: #1a1a1a]]\n" +
                "[[DEFINE class: label; size: 11]]\n" +
                "[[DEFINE class: title; weight: bold]]\n" +
                "[[SET class: body]]\n" +
                "\n" +
                "[[class: title]]\n" +
                "Document Title\n" +
                "\n" +
                "Paragraph text.\n" +
                "\n" +
                "{\n" +
                "    [[SET class: label]]\n" +
                "\n" +
                "    Signature line one\n" +
                "\n" +
                "    [[class: title]]\n" +
                "    Signature line two\n" +
                "}\n" +
                "\n" +
                "[[class: title]]\n" +
                "Footer line";
            expect(compToIrCanon(source).ir).toEqual(compToIr(source).ir);
        });
    });
});
