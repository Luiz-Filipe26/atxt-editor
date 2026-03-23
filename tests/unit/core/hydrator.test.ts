import { describe, it, expect } from "vitest";
import * as IR from "@/types/ir";
import { compileToIR } from "@/core/compiler";
import { COMPILER_DEFAULTS } from "@/domain/propertyDefinitions";

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
            expect(ir.root.type).toBe("BLOCK");
            expect(ir.root.props).toEqual({});
            expect(ir.root.children).toHaveLength(0);
        });

        it("the root block has the source position of the document", () => {
            const { ir } = compileToIR("Hello");
            expect(ir.root.line).toBe(1);
            expect(ir.root.column).toBe(1);
        });

        it("the root block has empty classes and ownProps", () => {
            const { ir } = compileToIR("Hello");
            expect(ir.root.classes).toEqual([]);
            expect(ir.root.ownProps).toEqual({});
        });
    });

    describe("IRDocument structure", () => {
        it("classDefinitions is empty when no classes are defined", () => {
            const { ir } = compileToIR("Hello");
            expect(ir.classDefinitions).toEqual({});
        });

        it("classDefinitions contains all defined classes after compilation", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: big; size: 24; weight: bold]]\nHello",
            );
            expect(errors).toHaveLength(0);
            expect(ir.classDefinitions["big"]).toEqual({ size: "24", weight: "bold" });
        });

        it("classDefinitions contains multiple classes", () => {
            const { ir } = compileToIR(
                "[[DEFINE class: big; size: 24]]\n[[DEFINE class: red; color: red]]\nHello",
            );
            expect(ir.classDefinitions["big"]).toBeDefined();
            expect(ir.classDefinitions["red"]).toBeDefined();
        });
    });

    describe("plain text nodes", () => {
        it("a plain text line produces an IR.Text with no props", () => {
            const { ir, errors } = compileToIR("Hello");
            expect(errors).toHaveLength(0);
            const text = texts(ir.root)[0];
            expect(text.type).toBe("TEXT");
            expect(text.content).toContain("Hello");
            expect(text.props).toEqual(COMPILER_DEFAULTS);
        });

        it("preserves the source position on IR.Text nodes", () => {
            const { ir } = compileToIR("Hello");
            const text = texts(ir.root)[0];
            expect(text.line).toBe(1);
            expect(text.column).toBe(1);
        });

        it("a plain text node has empty classes and ownProps", () => {
            const { ir } = compileToIR("Hello");
            const text = texts(ir.root)[0];
            expect(text.classes).toEqual([]);
            expect(text.ownProps).toEqual({});
        });
    });

    describe("explicit blocks", () => {
        it("an empty block produces an IR.Block with no props and no children", () => {
            const { ir, errors } = compileToIR("{}");
            expect(errors).toHaveLength(0);
            const block = blocks(ir.root)[0];
            expect(block.type).toBe("BLOCK");
            expect(block.props).toEqual({});
        });

        it("a block with text produces an IR.Block containing IR.Text children", () => {
            const { ir } = compileToIR("{\nHello\n}");
            const block = blocks(ir.root)[0];
            expect(texts(block).some((t) => t.content.includes("Hello"))).toBe(true);
        });

        it("preserves source position on IR.Block nodes", () => {
            const { ir } = compileToIR("{\nHello\n}");
            const block = blocks(ir.root)[0];
            expect(block.line).toBeDefined();
            expect(block.column).toBeDefined();
        });
    });

    describe("inline-scope property application", () => {
        it("applies an inline prop to the annotation target TEXT node", () => {
            const { ir, errors } = compileToIR("[[color: red]] Hello");
            expect(errors).toHaveLength(0);
            const text = textWith(ir.root, "Hello");
            expect(text?.props.color).toBe("red");
        });

        it("applies multiple inline props in one annotation", () => {
            const { ir } = compileToIR("[[color: red; size: 16]] Hello");
            const text = textWith(ir.root, "Hello");
            expect(text?.props.color).toBe("red");
            expect(text?.props.size).toBe("16");
        });

        it("inline props are only on the target node — not on subsequent text", () => {
            const { ir } = compileToIR("[[color: red]] Target\nOther");
            expect(textWith(ir.root, "Target")?.props.color).toBe("red");
            expect(textWith(ir.root, "Other")?.props.color).toBeUndefined();
        });
    });

    describe("block-scope property application", () => {
        it("applies block props to an IR.Block when the annotation targets a block", () => {
            const { ir, errors } = compileToIR("[[fill: #ccc]]\n{\nHello\n}");
            expect(errors).toHaveLength(0);
            expect(blocks(ir.root)[0].props.fill).toBe("#ccc");
        });

        it("block-scope props applied to a TEXT target are discarded — scope enforcement", () => {
            const { ir } = compileToIR("[[fill: #ccc]] Hello");
            expect(textWith(ir.root, "Hello")?.props.fill).toBeUndefined();
        });

        it("inline-scope props applied to a BLOCK target are discarded — scope enforcement", () => {
            const { ir } = compileToIR("[[color: red]]\n{\nHello\n}");
            expect(blocks(ir.root)[0].props.color).toBeUndefined();
        });
    });

    describe("classes field on IR nodes", () => {
        it("a node targeted by [[class: name]] has that class in its classes array", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: big; size: 24]]\n[[class: big]] Hello",
            );
            expect(errors).toHaveLength(0);
            // The annotation directly targets the wrapping block, not the text child
            const block = blocks(ir.root)[0];
            expect(block.classes).toEqual(["big"]);
        });

        it("a text node with no annotation has an empty classes array", () => {
            const { ir } = compileToIR("Hello");
            const text = texts(ir.root)[0];
            expect(text.classes).toEqual([]);
        });

        it("a block targeted by a class annotation carries that class", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: shaded; fill: #eee]]\n[[class: shaded]]\n{\nContent\n}",
            );
            expect(errors).toHaveLength(0);
            expect(blocks(ir.root)[0].classes).toEqual(["shaded"]);
        });

        it("children of a targeted block have empty classes — classes belong to the direct target", () => {
            const { ir } = compileToIR("[[DEFINE class: big; size: 24]]\n[[class: big]] Hello");
            const block = blocks(ir.root)[0];
            const text = textWith(block, "Hello");
            expect(text?.classes).toEqual([]);
        });
    });

    describe("ownProps field on IR nodes", () => {
        it("ownProps on the target block contains the directly declared inline-scoped props", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: big; size: 24]]\n[[class: big; color: red]] Hello",
            );
            expect(errors).toHaveLength(0);
            // The block is the direct target — it records what was written directly
            const block = blocks(ir.root)[0];
            expect(block.ownProps.color).toBe("red");
            expect(block.ownProps.size).toBeUndefined();
        });

        it("children of a targeted block have empty ownProps — ownProps belongs to the direct target", () => {
            const { ir } = compileToIR("[[color: red; size: 16]] Hello");
            const block = blocks(ir.root)[0];
            const text = textWith(block, "Hello");
            expect(text?.ownProps).toEqual({});
        });

        it("a plain text node with no annotation has empty ownProps", () => {
            const { ir } = compileToIR("Hello");
            const text = texts(ir.root)[0];
            expect(text.ownProps).toEqual({});
        });

        it("ownProps is empty on the target block when all props come from a class", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: big; size: 24]]\n[[class: big]] Hello",
            );
            expect(errors).toHaveLength(0);
            const block = blocks(ir.root)[0];
            expect(block.ownProps).toEqual({});
        });

        it("ownProps on a block target contains all directly declared block-scoped props", () => {
            const { ir } = compileToIR("[[fill: #eee; align: center]]\n{\nContent\n}");
            const block = blocks(ir.root)[0];
            expect(block.ownProps.fill).toBe("#eee");
            expect(block.ownProps.align).toBe("center");
        });

        it("props on the text child is fully resolved regardless of ownProps being empty", () => {
            const { ir } = compileToIR("[[color: red; size: 16]] Hello");
            const block = blocks(ir.root)[0];
            const text = textWith(block, "Hello");
            // props is fully resolved — ownProps is just the provenance record
            expect(text?.props.color).toBe("red");
            expect(text?.props.size).toBe("16");
        });
    });

    describe("toggle system (backpack)", () => {
        it("+toggle adds a prop to all subsequent sibling TEXT nodes", () => {
            const { ir, errors } = compileToIR("[[+color: red]]\nHello\nWorld");
            expect(errors).toHaveLength(0);
            expect(textWith(ir.root, "Hello")?.props.color).toBe("red");
            expect(textWith(ir.root, "World")?.props.color).toBe("red");
        });

        it("-toggle removes a prop from subsequent sibling TEXT nodes", () => {
            const { ir } = compileToIR("[[+color: red]]\nHello\n[[-color]]\nWorld");
            expect(textWith(ir.root, "Hello")?.props.color).toBe("red");
            expect(textWith(ir.root, "World")?.props.color).toBeUndefined();
        });

        it("multiple toggle-adds accumulate in the backpack", () => {
            const { ir } = compileToIR("[[+color: red]]\n[[+size: 16]]\nHello");
            const text = textWith(ir.root, "Hello");
            expect(text?.props.color).toBe("red");
            expect(text?.props.size).toBe("16");
        });

        it("+toggle with no following text nodes produces no node itself", () => {
            const { ir } = compileToIR("[[+color: red]]");
            expect(ir.root.children).toHaveLength(0);
        });

        it("backpack from outer scope propagates into nested blocks via inheritedProps", () => {
            const { ir } = compileToIR("[[+color: red]]\n{\nNested\n}");
            const block = blocks(ir.root)[0];
            expect(textWith(block, "Nested")?.props.color).toBe("red");
        });

        it("backpack changes inside a block do not propagate to the outer scope", () => {
            const { ir } = compileToIR("{\n[[+color: red]]\nInside\n}\nOutside");
            expect(textWith(ir.root, "Outside")?.props.color).toBeUndefined();
        });

        it("-toggle removes only the specified prop, leaving others intact", () => {
            const { ir } = compileToIR("[[+color: red]]\n[[+size: 16]]\nBefore\n[[-color]]\nAfter");
            const before = textWith(ir.root, "Before");
            const after = textWith(ir.root, "After");
            expect(before?.props.color).toBe("red");
            expect(before?.props.size).toBe("16");
            expect(after?.props.color).toBeUndefined();
            expect(after?.props.size).toBe("16");
        });

        it("popping one value from a multi-item stack leaves the remaining value active", () => {
            const { ir } = compileToIR(
                "[[+weight: bold]]\n[[+weight: 900]]\nBefore\n[[-weight]]\nAfter",
            );
            expect(textWith(ir.root, "After")?.props.weight).toBe("bold");
        });
    });

    describe("SET directive", () => {
        it("SET wraps all following siblings in a new IR.Block carrying the SET props", () => {
            const { ir, errors } = compileToIR("[[SET align: center]]\nHello\nWorld");
            expect(errors).toHaveLength(0);
            const wrapper = blocks(ir.root)[0];
            expect(wrapper.props.align).toBe("center");
        });

        it("SET captures only block-scope props in the wrapper", () => {
            const { ir } = compileToIR("[[SET color: red]]\nHello");
            const wrapper = blocks(ir.root)[0];
            expect(wrapper.props.color).toBeUndefined();
        });

        it("the children of the SET wrapper contain all following siblings", () => {
            const { ir } = compileToIR("[[SET align: center]]\nLine1\nLine2\nLine3");
            const wrapper = blocks(ir.root)[0];
            const content = texts(wrapper)
                .map((t) => t.content)
                .join("");
            expect(content).toContain("Line1");
            expect(content).toContain("Line2");
            expect(content).toContain("Line3");
        });

        it("SET stops collecting siblings at the end of the current scope", () => {
            const { ir } = compileToIR(
                "BeforeBlock\n{\n[[SET align: center]]\nInside\n}\nAfterBlock",
            );
            expect(textWith(ir.root, "AfterBlock")).toBeDefined();
        });
    });

    describe("DEFINE and class application", () => {
        it("applies a defined class to the annotation target", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: big; size: 24; weight: bold]]\n[[class: big]] Hello",
            );
            expect(errors).toHaveLength(0);
            const text = textWith(ir.root, "Hello");
            expect(text?.props.size).toBe("24");
            expect(text?.props.weight).toBe("bold");
        });

        it("inline props override class props for the same key", () => {
            const { ir } = compileToIR(
                "[[DEFINE class: big; size: 24]]\n[[class: big; size: 32]] Hello",
            );
            expect(textWith(ir.root, "Hello")?.props.size).toBe("32");
        });

        it("a class with block-scope props applied to a block target works correctly", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: shaded; fill: #eee]]\n[[class: shaded]]\n{\nContent\n}",
            );
            expect(errors).toHaveLength(0);
            expect(blocks(ir.root)[0].props.fill).toBe("#eee");
        });

        it("compose: child inherits parent properties at hydration time", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: base; color: red]]\n" +
                "[[DEFINE class: child; compose: base; size: 16]]\n" +
                "[[class: child]] Hello",
            );
            expect(errors).toHaveLength(0);
            const text = textWith(ir.root, "Hello");
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
            expect(blocks(ir.root)[0].props.hidden).toBe("true");
        });

        it("hidden: false also arrives in the IR", () => {
            const { ir } = compileToIR("[[hidden: false]]\n{\nContent\n}");
            expect(blocks(ir.root)[0].props.hidden).toBe("false");
        });
    });

    describe("indentation", () => {
        it("ignores invalid, zero, or negative indentation values", () => {
            const { ir } = compileToIR(
                "[[indent: abc]]\n{\nLine1\n}\n" +
                "[[indent: 0]]\n{\nLine2\n}\n" +
                "[[indent: -5]]\n{\nLine3\n}",
            );
            expect(textWith(blocks(ir.root)[0], "Line1")?.content).toMatch(/^Line1/);
            expect(textWith(blocks(ir.root)[1], "Line2")?.content).toMatch(/^Line2/);
            expect(textWith(blocks(ir.root)[2], "Line3")?.content).toMatch(/^Line3/);
        });

        it("skips non-TEXT children during indentation application", () => {
            const { ir } = compileToIR("[[indent: 4]]\n{\n{\nInnerBlock\n}\n}");
            const outerBlock = blocks(ir.root)[0];
            const innerBlock = blocks(outerBlock)[0];
            expect(innerBlock.type).toBe("BLOCK");
        });
    });

    describe("nested blocks", () => {
        it("nested block inherits the outer backpack via inheritedProps", () => {
            const { ir } = compileToIR("[[+size: 20]]\n{\nInner\n}");
            const block = blocks(ir.root)[0];
            expect(textWith(block, "Inner")?.props.size).toBe("20");
        });

        it("props on an inner block do not affect the outer scope", () => {
            const { ir } = compileToIR("{\n[[fill: blue]]\n{\nInner\n}\n}\nOuter");
            expect(textWith(ir.root, "Outer")?.props.fill).toBeUndefined();
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
            expect(textWith(ir.root, "Hello")).toBeDefined();
        });

        it("collects errors from multiple annotations in one document", () => {
            const { errors } = compileToIR("[[bad-prop: x]] Line1\n[[align: wrong]] Line2");
            expect(errors.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe("kind and leaf promotion", () => {
        it("a leaf block without container props is promoted to kind: paragraph", () => {
            const { ir } = compileToIR("{\nHello\n}");
            expect(blocks(ir.root)[0].props.kind).toBe("paragraph");
        });

        it("a leaf block with container props is not promoted to paragraph", () => {
            const { ir } = compileToIR("[[fill: #ccc]]\n{\nHello\n}");
            expect(blocks(ir.root)[0].props.kind).toBeUndefined();
        });

        it("a leaf-incompatible kind on a non-leaf block emits a HYDRATOR error", () => {
            const { errors } = compileToIR("[[kind: paragraph]]\n{\n{\nNested\n}\n}");
            expect(errors.some((e) => e.type === "HYDRATOR")).toBe(true);
        });
    });
});
