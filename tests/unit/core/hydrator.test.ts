import { describe, it, expect } from "vitest";
import * as IR from "@/types/ir";
import { compileToIR } from "@/core/compiler";


function texts(ir: IR.Block): IR.Text[] {
    const result: IR.Text[] = [];
    for (const child of ir.children) {
        if (child.type === "TEXT") result.push(child as IR.Text);
        else if (child.type === "BLOCK") result.push(...texts(child as IR.Block));
    }
    return result;
}

function blocks(ir: IR.Block): IR.Block[] {
    return ir.children.filter((c) => c.type === "BLOCK") as IR.Block[];
}

function textWith(ir: IR.Block, substr: string): IR.Text | undefined {
    return texts(ir).find((t) => t.content.includes(substr));
}

describe("Hydrator", () => {
    describe("root IR structure", () => {
        it("produces an IR.Block root with empty props for an empty document", () => {
            const { ir, errors } = compileToIR("");
            expect(errors).toHaveLength(0);
            expect(ir.type).toBe("BLOCK");
            expect(ir.props).toEqual({});
            expect(ir.children).toHaveLength(0);
        });

        it("the root block has the source position of the document", () => {
            const { ir } = compileToIR("Hello");
            expect(ir.line).toBe(1);
            expect(ir.column).toBe(1);
        });
    });

    describe("plain text nodes", () => {
        it("a plain text line produces an IR.Text with no props", () => {
            const { ir, errors } = compileToIR("Hello");
            expect(errors).toHaveLength(0);
            const text = texts(ir)[0];
            expect(text.type).toBe("TEXT");
            expect(text.content).toContain("Hello");
            expect(text.props).toEqual({});
        });

        it("preserves the source position on IR.Text nodes", () => {
            const { ir } = compileToIR("Hello");
            const text = texts(ir)[0];
            expect(text.line).toBe(1);
            expect(text.column).toBe(1);
        });
    });

    describe("explicit blocks", () => {
        it("an empty block produces an IR.Block with no props and no children", () => {
            const { ir, errors } = compileToIR("{}");
            expect(errors).toHaveLength(0);
            const block = blocks(ir)[0];
            expect(block.type).toBe("BLOCK");
            expect(block.props).toEqual({});
        });

        it("a block with text produces an IR.Block containing IR.Text children", () => {
            const { ir } = compileToIR("{\nHello\n}");
            const block = blocks(ir)[0];
            expect(texts(block).some((t) => t.content.includes("Hello"))).toBe(true);
        });

        it("preserves source position on IR.Block nodes", () => {
            const { ir } = compileToIR("{\nHello\n}");
            const block = blocks(ir)[0];
            expect(block.line).toBeDefined();
            expect(block.column).toBeDefined();
        });
    });

    describe("inline-scope property application", () => {
        it("applies an inline prop to the annotation target TEXT node", () => {
            const { ir, errors } = compileToIR("[[color: red]] Hello");
            expect(errors).toHaveLength(0);
            const text = textWith(ir, "Hello");
            expect(text?.props.color).toBe("red");
        });

        it("applies multiple inline props in one annotation", () => {
            const { ir } = compileToIR("[[color: red; size: 16]] Hello");
            const text = textWith(ir, "Hello");
            expect(text?.props.color).toBe("red");
            expect(text?.props.size).toBe("16");
        });

        it("inline props are only on the target node — not on subsequent text", () => {
            const { ir } = compileToIR("[[color: red]] Target\nOther");
            expect(textWith(ir, "Target")?.props.color).toBe("red");
            expect(textWith(ir, "Other")?.props.color).toBeUndefined();
        });
    });

    describe("block-scope property application", () => {
        it("applies block props to an IR.Block when the annotation targets a block", () => {
            const { ir, errors } = compileToIR("[[fill: #ccc]]\n{\nHello\n}");
            expect(errors).toHaveLength(0);
            expect(blocks(ir)[0].props.fill).toBe("#ccc");
        });

        it("block-scope props applied to a TEXT target are discarded — scope enforcement", () => {
            // fill is block-scope; on a TEXT target it gets routed to blockProps,
            // but the TEXT node only receives inlineProps
            const { ir } = compileToIR("[[fill: #ccc]] Hello");
            expect(textWith(ir, "Hello")?.props.fill).toBeUndefined();
        });

        it("inline-scope props applied to a BLOCK target are discarded — scope enforcement", () => {
            // color is inline-scope; on a BLOCK target it goes to inlineProps,
            // but the BLOCK node only receives blockProps
            const { ir } = compileToIR("[[color: red]]\n{\nHello\n}");
            expect(blocks(ir)[0].props.color).toBeUndefined();
        });
    });

    describe("toggle system (backpack)", () => {
        it("+toggle adds a prop to all subsequent sibling TEXT nodes", () => {
            const { ir, errors } = compileToIR("[[+color: red]]\nHello\nWorld");
            expect(errors).toHaveLength(0);
            expect(textWith(ir, "Hello")?.props.color).toBe("red");
            expect(textWith(ir, "World")?.props.color).toBe("red");
        });

        it("-toggle removes a prop from subsequent sibling TEXT nodes", () => {
            const { ir } = compileToIR("[[+color: red]]\nHello\n[[-color]]\nWorld");
            expect(textWith(ir, "Hello")?.props.color).toBe("red");
            expect(textWith(ir, "World")?.props.color).toBeUndefined();
        });

        it("multiple toggle-adds accumulate in the backpack", () => {
            const { ir } = compileToIR("[[+color: red]]\n[[+size: 16]]\nHello");
            const text = textWith(ir, "Hello");
            expect(text?.props.color).toBe("red");
            expect(text?.props.size).toBe("16");
        });

        it("+toggle with no following text nodes produces no node itself", () => {
            const { ir } = compileToIR("[[+color: red]]");
            // The toggle annotation produces no IR node
            expect(ir.children.filter((c) => c.type !== "TEXT")).toHaveLength(0);
        });

        it("backpack from outer scope propagates into nested blocks via inheritedProps", () => {
            const { ir } = compileToIR("[[+color: red]]\n{\nNested\n}");
            const block = blocks(ir)[0];
            expect(textWith(block, "Nested")?.props.color).toBe("red");
        });

        it("backpack changes inside a block do not propagate to the outer scope", () => {
            const { ir } = compileToIR("{\n[[+color: red]]\nInside\n}\nOutside");
            expect(textWith(ir, "Outside")?.props.color).toBeUndefined();
        });

        it("-toggle removes only the specified prop, leaving others intact", () => {
            const { ir } = compileToIR("[[+color: red]]\n[[+size: 16]]\nBefore\n[[-color]]\nAfter");
            const before = textWith(ir, "Before");
            const after = textWith(ir, "After");
            expect(before?.props.color).toBe("red");
            expect(before?.props.size).toBe("16");
            expect(after?.props.color).toBeUndefined();
            expect(after?.props.size).toBe("16");
        });
    });

    describe("SET directive", () => {
        it("SET wraps all following siblings in a new IR.Block carrying the SET props", () => {
            const { ir, errors } = compileToIR("[[SET align: center]]\nHello\nWorld");
            expect(errors).toHaveLength(0);
            const wrapper = blocks(ir)[0];
            expect(wrapper.props.align).toBe("center");
        });

        it("SET captures only block-scope props in the wrapper", () => {
            // color is inline-scope — SET with color produces an empty-props wrapper
            const { ir } = compileToIR("[[SET color: red]]\nHello");
            const wrapper = blocks(ir)[0];
            expect(wrapper.props.color).toBeUndefined();
        });

        it("the children of the SET wrapper contain all following siblings", () => {
            const { ir } = compileToIR("[[SET align: center]]\nLine1\nLine2\nLine3");
            const wrapper = blocks(ir)[0];
            const content = texts(wrapper)
                .map((t) => t.content)
                .join("");
            expect(content).toContain("Line1");
            expect(content).toContain("Line2");
            expect(content).toContain("Line3");
        });

        it("SET stops collecting siblings at the end of the current scope", () => {
            const { ir } = compileToIR("BeforeBlock\n{\n[[SET align: center]]\nInside\n}\nAfterBlock");
            // AfterBlock must be in the root, not inside the SET wrapper
            expect(textWith(ir, "AfterBlock")).toBeDefined();
        });
    });

    describe("DEFINE and class application", () => {
        it("applies a defined class to the annotation target", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: big; size: 24; weight: bold]]\n[[class: big]] Hello",
            );
            expect(errors).toHaveLength(0);
            const text = textWith(ir, "Hello");
            expect(text?.props.size).toBe("24");
            expect(text?.props.weight).toBe("bold");
        });

        it("inline props override class props for the same key", () => {
            const { ir } = compileToIR(
                "[[DEFINE class: big; size: 24]]\n[[class: big; size: 32]] Hello",
            );
            expect(textWith(ir, "Hello")?.props.size).toBe("32");
        });

        it("a class with block-scope props applied to a block target works correctly", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: shaded; fill: #eee]]\n[[class: shaded]]\n{\nContent\n}",
            );
            expect(errors).toHaveLength(0);
            expect(blocks(ir)[0].props.fill).toBe("#eee");
        });

        it("compose: child inherits parent properties at hydration time", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: base; color: red]]\n" +
                "[[DEFINE class: child; compose: base; size: 16]]\n" +
                "[[class: child]] Hello",
            );
            expect(errors).toHaveLength(0);
            const text = textWith(ir, "Hello");
            expect(text?.props.color).toBe("red");
            expect(text?.props.size).toBe("16");
        });

        it("emits a HYDRATOR error when applying an undefined class", () => {
            const { errors } = compileToIR("[[class: undefined-class]] Hello");
            expect(errors.some((e) => e.type === "HYDRATOR")).toBe(true);
        });
    });

    describe("hidden property", () => {
        it("hidden: true on a block target arrives in the IR as a block prop", () => {
            const { ir, errors } = compileToIR("[[hidden: true]]\n{\nContent\n}");
            expect(errors).toHaveLength(0);
            expect(blocks(ir)[0].props.hidden).toBe("true");
        });

        it("hidden: false also arrives in the IR", () => {
            const { ir } = compileToIR("[[hidden: false]]\n{\nContent\n}");
            expect(blocks(ir)[0].props.hidden).toBe("false");
        });
    });

    describe("indentation", () => {
        it("indent property adds literal leading spaces to each text line in the block", () => {
            const { ir, errors } = compileToIR("[[indent: 4]]\n{\nHello\n}");
            expect(errors).toHaveLength(0);
            const block = blocks(ir)[0];
            const text = textWith(block, "Hello");
            expect(text?.content).toMatch(/^ {4}Hello/);
        });

        it("indent: 2 adds exactly two spaces", () => {
            const { ir } = compileToIR("[[indent: 2]]\n{\nLine\n}");
            const block = blocks(ir)[0];
            expect(textWith(block, "Line")?.content).toMatch(/^ {2}Line/);
        });

        it("ignores invalid, zero, or negative indentation values", () => {
            const { ir } = compileToIR(
                "[[indent: abc]]\n{\nLine1\n}\n" +
                "[[indent: 0]]\n{\nLine2\n}\n" +
                "[[indent: -5]]\n{\nLine3\n}",
            );

            const block1 = blocks(ir)[0];
            const block2 = blocks(ir)[1];
            const block3 = blocks(ir)[2];

            // Ensures the text remained intact and did not receive leading spaces
            expect(textWith(block1, "Line1")?.content).toMatch(/^Line1/);
            expect(textWith(block2, "Line2")?.content).toMatch(/^Line2/);
            expect(textWith(block3, "Line3")?.content).toMatch(/^Line3/);
        });

        it("skips non-TEXT children during indentation application", () => {
            // A block with indentation containing a nested block
            const { ir } = compileToIR("[[indent: 4]]\n{\n{\nInnerBlock\n}\n}");

            const outerBlock = blocks(ir)[0];
            const innerBlock = blocks(outerBlock)[0];

            // Must hit the "if (child.type !== 'TEXT') continue;"
            // without crashing, leaving the inner block intact.
            expect(innerBlock.type).toBe("BLOCK");
        });

        it("does not apply indentation to inline text fragments that do not start a line", () => {
            const { ir } = compileToIR("[[indent: 4]]\n{\nPrefix [[color: red]] Suffix\n}");
            const block = blocks(ir)[0];
            const prefix = textWith(block, "Prefix");
            const innerBlock = blocks(block)[0];
            const suffix = textWith(innerBlock, "Suffix");

            // Prefix starts the line — recieves indentation
            expect(prefix?.content).toMatch(/^ {4}Prefix/);

            // Suffix is mid-line — doesn't receive indentation
            expect(suffix?.content).not.toMatch(/^ {4}/);
            expect(suffix?.content).toContain("Suffix");
        });
    });

    describe("nested blocks", () => {
        it("nested block inherits the outer backpack via inheritedProps", () => {
            const { ir } = compileToIR("[[+size: 20]]\n{\nInner\n}");
            const block = blocks(ir)[0];
            expect(textWith(block, "Inner")?.props.size).toBe("20");
        });

        it("props on an inner block do not affect the outer scope", () => {
            const { ir } = compileToIR("{\n[[fill: blue]]\n{\nInner\n}\n}\nOuter");
            // Outer text has no fill prop
            expect(textWith(ir, "Outer")?.props.fill).toBeUndefined();
        });
    });

    describe("error collection", () => {
        it("collects a HYDRATOR error for an unknown property", () => {
            const { errors } = compileToIR("[[totally-unknown: value]] Hello");
            expect(errors.some((e) => e.type === "HYDRATOR")).toBe(true);
        });

        it("collects a HYDRATOR error for a property with an invalid value", () => {
            const { errors } = compileToIR("[[align: diagonal]] Hello");
            expect(errors.some((e) => e.type === "HYDRATOR")).toBe(true);
        });

        it("produces partial IR even when there are hydrator errors", () => {
            const { ir } = compileToIR("[[unknown-prop: x]] Hello");
            expect(textWith(ir, "Hello")).toBeDefined();
        });

        it("collects errors from multiple annotations in one document", () => {
            const { errors } = compileToIR("[[bad-prop: x]] Line1\n[[align: wrong]] Line2");
            expect(errors.length).toBeGreaterThanOrEqual(2);
        });
    });
});
