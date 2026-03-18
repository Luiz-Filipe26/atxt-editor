import { describe, it, expect } from "vitest";
import { Generator } from "@/core/generator";
import * as IR from "@/types/ir";

function makeBlock(
    props: Record<string, string> = {},
    children: (IR.Block | IR.Text)[] = [],
    line?: number,
    column?: number,
): IR.Block {
    return { type: "BLOCK", props, classes: [], inlineProps: {}, children, line, column };
}

function makeText(
    content: string,
    props: Record<string, string> = {},
    line?: number,
    column?: number,
): IR.Text {
    return { type: "TEXT", props, classes: [], inlineProps: {}, content, line, column };
}

function generate(root: IR.Block): string {
    return new Generator().generate(root);
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
            expect(html).toContain("<div></div>");
        });
    });

    describe("BLOCK rendering", () => {
        it("a child block renders as a div", () => {
            const root = makeBlock({}, [makeBlock()]);
            expect(generate(root)).toContain("<div></div>");
        });

        it("a block with no props has no class attribute", () => {
            const root = makeBlock({}, [makeBlock()]);
            const inner = generate(root).match(/<div(?:[^>]*)><\/div>/)?.[0] ?? "";
            expect(inner).not.toContain("class=");
        });

        it("a block with props receives a generated class attribute", () => {
            const root = makeBlock({}, [makeBlock({ fill: "#ccc" })]);
            expect(generate(root)).toMatch(/class="atxt-editor-[a-z0-9]+"/);
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
            const root = makeBlock({}, [makeBlock({ hidden: "TRUE" }, [makeText("Secret")])]);
            expect(generate(root)).not.toContain("Secret");
        });

        it("nested blocks render correctly", () => {
            const root = makeBlock({}, [makeBlock({}, [makeBlock({}, [makeText("Deep")])])]);
            expect(generate(root)).toContain("Deep");
        });
    });

    describe("TEXT rendering", () => {
        it("a text node renders as a span", () => {
            const root = makeBlock({}, [makeText("Hello")]);
            expect(generate(root)).toContain("<span>Hello</span>");
        });

        it("a text node with props receives a generated class attribute", () => {
            const root = makeBlock({}, [makeText("Hello", { color: "red" })]);
            expect(generate(root)).toMatch(/class="atxt-editor-[a-z0-9]+"/);
        });

        it("a text node with no props has no class attribute", () => {
            const root = makeBlock({}, [makeText("Hello")]);
            expect(generate(root)).toContain("<span>Hello</span>");
        });
    });

    describe("source position attributes", () => {
        it("a node with line and column gets data-line and data-column attributes", () => {
            const root = makeBlock({}, [makeText("Hello", {}, 3, 5)]);
            expect(generate(root)).toContain('data-line="3"');
            expect(generate(root)).toContain('data-column="5"');
        });

        it("a node without line and column gets no data attributes", () => {
            const root = makeBlock({}, [makeText("Hello")]);
            expect(generate(root)).not.toContain("data-line");
            expect(generate(root)).not.toContain("data-column");
        });
    });

    describe("CSS class generation", () => {
        it("two nodes with identical props share the same generated class", () => {
            const root = makeBlock({}, [
                makeText("A", { color: "red" }),
                makeText("B", { color: "red" }),
            ]);
            const html = generate(root);
            const matches = html.match(/atxt-editor-[a-z0-9]+/g) ?? [];
            expect(matches[0]).toBe(matches[1]);
        });

        it("two nodes with different props get different generated classes", () => {
            const root = makeBlock({}, [
                makeText("A", { color: "red" }),
                makeText("B", { color: "blue" }),
            ]);
            const html = generate(root);
            const matches = [...new Set(html.match(/atxt-editor-[a-z0-9]+/g) ?? [])];
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
});
