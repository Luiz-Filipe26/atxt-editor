import { describe, it, expect, beforeEach } from "vitest";
import { Generator, IR } from "@atxt";
import { KindValue, PropKey } from "@atxt/domain/annotationProperties";

let idCounter = 0;

beforeEach(() => {
    idCounter = 0;
});

function makeProps(props: Record<string, string>): Map<string, string> {
    return new Map(Object.entries(props));
}

function makeBlock(
    props: Record<string, string> = {},
    children: IR.Node[] = [],
    line?: number,
    column?: number,
): IR.Block {
    return {
        id: `b${idCounter++}`,
        type: IR.NodeType.Block,
        props: makeProps(props),
        classes: [],
        ownProps: new Map(),
        children,
        line,
        column,
    };
}

function makeText(
    content: string,
    props: Record<string, string> = {},
    line?: number,
    column?: number,
): IR.Text {
    return {
        id: `t${idCounter++}`,
        type: IR.NodeType.Text,
        props: makeProps(props),
        classes: [],
        ownProps: new Map(),
        content,
        line,
        column,
    };
}

function generate(root: IR.Block): string {
    return Generator.generate(root);
}

describe("Generator", () => {
    describe("document shell", () => {
        it("wraps output in atxt-document-root div with a style tag", () => {
            const html = generate(makeBlock());
            expect(html).toContain('class="atxt-document-root"');
            expect(html).toContain("<style>");
            expect(html).toContain("</style>");
        });

        it("includes the base CSS in the style tag", () => {
            const html = generate(makeBlock());
            expect(html).toContain("white-space: pre-wrap");
            expect(html).toContain("word-break: break-word");
        });

        it("an empty root block produces no children inside the root div", () => {
            const html = generate(makeBlock());
            expect(html).not.toContain("<div data-id");
            expect(html).not.toContain("<p");
        });
    });

    describe("BLOCK rendering", () => {
        it("a child block renders as a div with a data-id attribute", () => {
            const root = makeBlock({}, [makeBlock()]);
            expect(generate(root)).toContain('<div data-id="b1"></div>');
        });

        it("a block with no props has no class attribute", () => {
            const root = makeBlock({}, [makeBlock()]);
            const inner = generate(root).match(/<div data-id="[^"]*"><\/div>/)?.[0] ?? "";
            expect(inner).not.toContain("class=");
        });

        it("a block with props receives a generated class attribute", () => {
            const root = makeBlock({}, [makeBlock({ fill: "#ccc" }, [makeText("x")])]);
            expect(generate(root)).toMatch(/class="atxt-cls-[a-z0-9]+"/);
        });

        it("a hidden block is not rendered", () => {
            const root = makeBlock({}, [makeBlock({ hidden: "true" }, [makeText("Secret")])]);
            expect(generate(root)).not.toContain("Secret");
        });

        it("hidden: false renders the block normally", () => {
            const root = makeBlock({}, [makeBlock({ hidden: "false" }, [makeText("Visible")])]);
            expect(generate(root)).toContain("Visible");
        });

        it("hidden check is case-insensitive — TRUE is also hidden", () => {
            const root = makeBlock({}, [makeBlock({ [PropKey.Hidden]: "TRUE" }, [makeText("Secret")])]);
            expect(generate(root)).not.toContain("Secret");
        });

        it("nested blocks render correctly", () => {
            const root = makeBlock({}, [makeBlock({}, [makeBlock({}, [makeText("Deep")])])]);
            expect(generate(root)).toContain("Deep");
        });

        describe("empty block rendering", () => {
            it("an empty root block produces no children inside the root div", () => {
                const html = generate(makeBlock());
                expect(html).not.toContain("<div data-id");
                expect(html).not.toContain("<p");
            });

            it("a block with kind renders with the corresponding HTML tag", () => {
                const root = makeBlock({}, [makeBlock({ [PropKey.Kind]: KindValue.Paragraph }, [makeText("Hello")])]);
                expect(generate(root)).toContain("<p ");
                expect(generate(root)).toContain("Hello");
                expect(generate(root)).toContain("</p>");
            });
        });

        it("a NEWLINE node inside a leaf context is rendered as a newline character", () => {
            const newline: IR.Newline = { id: "n0", type: IR.NodeType.Newline };
            const leaf = makeBlock({ [PropKey.Kind]: KindValue.Paragraph }, [makeText("a"), newline, makeText("b")]);
            const root = makeBlock({}, [leaf]);
            const html = generate(root);
            expect(html).toMatch(/>a<\/span><br>/);
        });

        it("a NEWLINE node outside a leaf context is not rendered", () => {
            const newline: IR.Newline = { id: "n0", type: IR.NodeType.Newline };
            const inner = makeBlock({ [PropKey.Kind]: KindValue.Paragraph }, [makeText("text")]);
            const root = makeBlock({}, [inner, newline]);
            const html = generate(root);
            expect(html).not.toContain('data-id="n0"');
        });
    });

    describe("TEXT rendering", () => {
        it("a text node renders as a span with a data-id attribute", () => {
            const root = makeBlock({}, [makeText("Hello")]);
            expect(generate(root)).toContain('<span data-id="t0">Hello</span>');
        });

        it("a text node with props receives a generated class attribute", () => {
            const root = makeBlock({}, [makeText("Hello", { color: "red" })]);
            expect(generate(root)).toMatch(/class="atxt-cls-[a-z0-9]+"/);
        });

        it("a text node with no props has no class attribute", () => {
            const root = makeBlock({}, [makeText("Hello")]);
            expect(generate(root)).not.toContain('class="atxt-cls');
        });
    });

    describe("data-id attributes", () => {
        it("every node gets a data-id attribute", () => {
            const root = makeBlock({}, [makeText("Hello", {}, 3, 5)]);
            expect(generate(root)).toContain('data-id="t0"');
        });

        it("data-line and data-column are not emitted — source position lives in the nodeMap", () => {
            const root = makeBlock({}, [makeText("Hello", {}, 3, 5)]);
            const html = generate(root);
            expect(html).not.toContain("data-line");
            expect(html).not.toContain("data-column");
        });

        it("each node gets a distinct data-id", () => {
            const root = makeBlock({}, [makeText("A"), makeText("B")]);
            const html = generate(root);
            expect(html).toContain('data-id="t0"');
            expect(html).toContain('data-id="t1"');
        });
    });

    describe("CSS class generation", () => {
        it("two nodes with identical props share the same generated class", () => {
            const root = makeBlock({}, [
                makeText("A", { color: "red" }),
                makeText("B", { color: "red" }),
            ]);
            const html = generate(root);
            const matches = html.match(/atxt-cls-[a-z0-9]+/g) ?? [];
            expect(matches[0]).toBe(matches[1]);
        });

        it("two nodes with different props get different generated classes", () => {
            const root = makeBlock({}, [
                makeText("A", { color: "red" }),
                makeText("B", { color: "blue" }),
            ]);
            const html = generate(root);
            const matches = [...new Set(html.match(/atxt-cls-[a-z0-9]+/g) ?? [])];
            expect(matches).toHaveLength(2);
        });

        it("generated CSS rule contains the correct property and value", () => {
            const root = makeBlock({}, [makeText("Hello", { color: "red" })]);
            expect(generate(root)).toContain("color: red");
        });

        it("properties with no CSS mapping (hidden, indent) produce no CSS rule", () => {
            const root = makeBlock({ hidden: "false", indent: "4" });
            const html = generate(root);
            expect(html).not.toContain("hidden:");
            expect(html).not.toContain("indent:");
        });
    });

    describe("formatCssValue — px-fallback", () => {
        it("a bare integer gets a px suffix", () => {
            const root = makeBlock({}, [makeText("Hello", { size: "16" })]);
            expect(generate(root)).toContain("font-size: 16px");
        });

        it("a non-numeric value passes through unchanged", () => {
            const root = makeBlock({}, [makeText("Hello", { size: "large" })]);
            expect(generate(root)).toContain("font-size: large");
        });

        it("a decimal value gets a px suffix", () => {
            const root = makeBlock({}, [makeText("Hello", { size: "1.5" })]);
            expect(generate(root)).toContain("font-size: 1.5px");
        });
    });

    describe("formatCssValue — multi-px-fallback", () => {
        it("multiple bare integers each get a px suffix", () => {
            const root = makeBlock({ padding: "10 20" });
            expect(generate(root)).toContain("padding: 10px 20px");
        });

        it("zero is not suffixed with px", () => {
            const root = makeBlock({ padding: "0 10" });
            expect(generate(root)).toContain("padding: 0 10px");
        });

        it("non-numeric tokens pass through unchanged", () => {
            const root = makeBlock({ padding: "10 auto" });
            expect(generate(root)).toContain("padding: 10px auto");
        });
    });

    describe("formatCssValue — null unit", () => {
        it("a color value passes through unchanged", () => {
            const root = makeBlock({}, [makeText("Hello", { color: "#ff0000" })]);
            expect(generate(root)).toContain("color: #ff0000");
        });

        it("a font-family value with spaces passes through unchanged", () => {
            const root = makeBlock({}, [makeText("Hello", { font: "Georgia, serif" })]);
            expect(generate(root)).toContain("font-family: Georgia, serif");
        });
    });

    describe("indentation", () => {
        it("indent: 4 prepends four spaces to each line in the block HTML", () => {
            const root = makeBlock({}, [
                makeBlock({ [PropKey.Indent]: "4", [PropKey.Kind]: KindValue.Paragraph }, [makeText("Hello")]),
            ]);
            expect(generate(root)).toContain("    <span");
        });

        it("indent does not prepend spaces to non-line-start nodes", () => {
            const newline: IR.Newline = { id: "nl", type: IR.NodeType.Newline };
            const root = makeBlock({}, [
                makeBlock({ [PropKey.Indent]: "4", [PropKey.Kind]: KindValue.Paragraph }, [
                    makeText("A"),
                    makeText("B"),
                    newline,
                    makeText("C"),
                ]),
            ]);
            const html = generate(root);
            expect(html).toMatch(
                /    <span[^>]+>A<\/span><span[^>]+>B<\/span><br>    <span[^>]+>C/,
            );
        });
    });
});
