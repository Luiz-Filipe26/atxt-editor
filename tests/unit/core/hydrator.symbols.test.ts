import { describe, it, expect } from "vitest";
import { IR, compileToIR } from "@atxt";

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

describe("Hydrator — symbol integration", () => {
    describe("inline symbols via default classes", () => {
        it("**text** applies weight:bold to the enclosed text", () => {
            const { ir, errors } = compileToIR("**bold**");
            expect(errors).toHaveLength(0);
            expect(textWith(ir.root, "bold")?.props.get("weight")).toBe("bold");
        });

        it("_text_ applies style:italic to the enclosed text", () => {
            const { ir, errors } = compileToIR("_italic_");
            expect(errors).toHaveLength(0);
            expect(textWith(ir.root, "italic")?.props.get("style")).toBe("italic");
        });

        it("~~text~~ applies decoration:line-through to the enclosed text", () => {
            const { ir, errors } = compileToIR("~~strike~~");
            expect(errors).toHaveLength(0);
            expect(textWith(ir.root, "strike")?.props.get("decoration")).toBe("line-through");
        });

        it("text outside the symbol delimiters is not affected", () => {
            const { ir } = compileToIR("Hello **bold** world");
            expect(textWith(ir.root, "Hello")?.props.has("weight")).toBe(false);
            expect(textWith(ir.root, "world")?.props.has("weight")).toBe(false);
        });

        it("nested symbols apply both props to the inner text", () => {
            const { ir, errors } = compileToIR("**outer _inner_ end**");
            expect(errors).toHaveLength(0);
            const inner = textWith(ir.root, "inner");
            expect(inner?.props.get("weight")).toBe("bold");
            expect(inner?.props.get("style")).toBe("italic");
        });

        it("unclosed symbol produces no style on the text", () => {
            const { ir } = compileToIR("**unclosed");
            expect(textWith(ir.root, "**unclosed")?.props.has("weight")).toBe(false);
        });
    });

    describe("block symbols via default classes", () => {
        it("# heading produces a block with kind:heading1", () => {
            const { ir, errors } = compileToIR("# Hello");
            expect(errors).toHaveLength(0);
            expect(blocks(ir.root)[0].props.get("kind")).toBe("heading1");
        });

        it("# heading applies h1 default class properties", () => {
            const { ir } = compileToIR("# Hello");
            const text = textWith(ir.root, "Hello");
            expect(text?.props.get("weight")).toBe("bold");
        });

        it("> quote produces a block with kind:quote", () => {
            const { ir, errors } = compileToIR("> A quote");
            expect(errors).toHaveLength(0);
            expect(blocks(ir.root)[0].props.get("kind")).toBe("quote");
        });

        it("- item produces a block with kind:item", () => {
            const { ir, errors } = compileToIR("- An item");
            expect(errors).toHaveLength(0);
            expect(blocks(ir.root)[0].props.get("kind")).toBe("item");
        });

        it("+ item produces a block with kind:item", () => {
            const { ir, errors } = compileToIR("+ An item");
            expect(errors).toHaveLength(0);
            expect(blocks(ir.root)[0].props.get("kind")).toBe("item");
        });
    });

    describe("custom symbols", () => {
        it("a custom inline symbol applies its class properties to the enclosed text", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: highlight; color: yellow]]\n" +
                "[[SYMBOL symbol: ++; class: highlight; type: inline]]\n" +
                "++text++",
            );
            expect(errors).toHaveLength(0);
            expect(textWith(ir.root, "text")?.props.get("color")).toBe("yellow");
        });
        
        it("[[+class: name]] toggle pushes class props onto the backpack", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: highlight; color: yellow]]\n" +
                "[[+class: highlight]]text[[-class]]",
            );
            expect(errors).toHaveLength(0);
            expect(textWith(ir.root, "text")?.props.get("color")).toBe("yellow");
        });

        it("[[-class]] toggle restores the previous state", () => {
            const { ir, errors } = compileToIR(
                "[[DEFINE class: highlight; color: yellow]]\n" +
                "[[+class: highlight]]text[[-class]]after",
            );
            expect(errors).toHaveLength(0);
            expect(textWith(ir.root, "after")?.props.has("color")).toBe(false);
        });

        it("[[+class: name]] with an undefined class is silently ignored", () => {
            const { ir } = compileToIR("[[+class: undefined-class]]text[[-class]]");
            const t = textWith(ir.root, "text");
            expect(t).toBeDefined();
            expect(t?.props.has("color")).toBe(false);
            expect(t?.props.has("weight")).toBe(false);
        });

        it("[[-class]] when no class is active in the backpack is a no-op", () => {
            const { ir, errors } = compileToIR("[[-class]]\ntext");
            expect(textWith(ir.root, "text")).toBeDefined();
            expect(errors).toHaveLength(0);
        });
    });
});
