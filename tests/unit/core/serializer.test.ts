import { describe, it, expect } from "vitest";
import { serialize } from "@/core/serializer";
import * as IR from "@/types/ir";

let idCounter = 0;

function makeBlock(
    props: IR.ResolvedProps = {},
    children: IR.Node[] = [],
    classes: string[] = [],
    ownProps: IR.ResolvedProps = {},
): IR.Block {
    return { id: `b${idCounter++}`, type: "BLOCK", props, classes, ownProps, children };
}

function makeText(content: string, props: IR.ResolvedProps = {}): IR.Text {
    return { id: `t${idCounter++}`, type: "TEXT", props, classes: [], ownProps: {}, content };
}

function makeNewline(): IR.Newline {
    return { id: `n${idCounter++}`, type: "NEWLINE" };
}

function makeDoc(
    children: IR.Node[],
    classDefinitions: Record<string, IR.ResolvedProps> = {},
): IR.IRDocument {
    return {
        root: makeBlock({}, children),
        nodeMap: new Map(),
        classDefinitions,
    };
}

beforeEach(() => {
    idCounter = 0;
});

describe("Serializer", () => {
    describe("empty document", () => {
        it("serializes an empty document to an empty string", () => {
            expect(serialize(makeDoc([]))).toBe("");
        });
    });

    describe("class definitions", () => {
        it("emits DEFINE directives sorted alphabetically by class name", () => {
            const doc = makeDoc([], {
                warning: { color: "red" },
                callout: { fill: "#fffbe6" },
            });
            const result = serialize(doc);
            expect(result).toContain("[[DEFINE class: callout; fill: #fffbe6]]");
            expect(result).toContain("[[DEFINE class: warning; color: red]]");
            expect(result.indexOf("callout")).toBeLessThan(result.indexOf("warning"));
        });

        it("emits props within a DEFINE sorted alphabetically", () => {
            const doc = makeDoc([], {
                heading: { weight: "bold", size: "24", kind: "heading1" },
            });
            expect(serialize(doc)).toContain(
                "[[DEFINE class: heading; kind: heading1; size: 24; weight: bold]]",
            );
        });

        it("separates definitions from document body with a blank line", () => {
            const doc = makeDoc([makeBlock({}, [makeText("Hello")])], { note: { color: "gray" } });
            const lines = serialize(doc).split("\n");
            const defLine = lines.findIndex((l) => l.startsWith("[[DEFINE"));
            const blankLine = lines[defLine + 1];
            expect(blankLine).toBe("");
        });
    });

    describe("annotated blocks", () => {
        it("emits annotation and braces for a block with a class", () => {
            const block = makeBlock({ kind: "paragraph" }, [makeText("Hello")], ["my-class"]);
            const result = serialize(makeDoc([block]));
            expect(result).toBe("[[class: my-class]] {\n    Hello\n}");
        });

        it("emits ownProps sorted alphabetically in the annotation", () => {
            const block = makeBlock({}, [makeText("Hello")], [], { size: "16", align: "center" });
            const result = serialize(makeDoc([block]));
            expect(result).toContain("[[align: center; size: 16]]");
        });

        it("emits class before ownProps in the annotation", () => {
            const block = makeBlock({}, [makeText("Hello")], ["note"], { color: "gray" });
            const result = serialize(makeDoc([block]));
            expect(result).toContain("[[class: note; color: gray]]");
        });

        it("indents leaf content one level inside braces", () => {
            const block = makeBlock({}, [makeText("text")], ["x"]);
            const lines = serialize(makeDoc([block])).split("\n");
            expect(lines[1]).toBe("    text");
        });

        it("emits closing brace at the same indentation as the annotation", () => {
            const block = makeBlock({}, [makeText("text")], ["x"]);
            const lines = serialize(makeDoc([block])).split("\n");
            expect(lines[2]).toBe("}");
        });
    });

    describe("nested blocks", () => {
        it("indents nested annotated blocks correctly", () => {
            const inner = makeBlock({}, [makeText("inner")], ["child"]);
            const outer = makeBlock({}, [inner], ["parent"]);
            const result = serialize(makeDoc([outer]));
            expect(result).toBe(
                "[[class: parent]] {\n" +
                "    [[class: child]] {\n" +
                "        inner\n" +
                "    }\n" +
                "}",
            );
        });
    });

    describe("inline toggles", () => {
        it("emits no toggle for the first text node with no props", () => {
            const block = makeBlock({}, [makeText("plain")], ["p"]);
            const result = serialize(makeDoc([block]));
            expect(result).toContain("    plain");
            expect(result).not.toContain("[[+");
        });

        it("emits +prop toggle when a prop is introduced", () => {
            const block = makeBlock(
                {},
                [makeText("plain"), makeText("bold", { weight: "bold" })],
                ["p"],
            );
            const result = serialize(makeDoc([block]));
            expect(result).toContain("[[+weight: bold]]bold");
        });

        it("emits -prop toggle when a prop is removed", () => {
            const block = makeBlock(
                {},
                [makeText("bold", { weight: "bold" }), makeText("plain")],
                ["p"],
            );
            const result = serialize(makeDoc([block]));
            expect(result).toContain("bold[[-weight]]plain");
        });

        it("emits both added and removed props in a single annotation", () => {
            const block = makeBlock(
                {},
                [
                    makeText("a", { weight: "bold", color: "red" }),
                    makeText("b", { weight: "bold" }),
                ],
                ["p"],
            );
            const result = serialize(makeDoc([block]));
            expect(result).toContain("[[-color]]");
        });

        it("resets toggle state between sibling blocks", () => {
            const block1 = makeBlock({}, [makeText("bold", { weight: "bold" })], ["p"]);
            const block2 = makeBlock({}, [makeText("plain")], ["q"]);
            const result = serialize(makeDoc([block1, block2]));
            const lines = result.split("\n");
            const block2Content = lines.find((l) => l.includes("plain"))!;
            expect(block2Content).not.toContain("[[");
        });

        it("emits toggles sorted alphabetically when multiple props change", () => {
            const block = makeBlock({}, [makeText("x", { color: "red", weight: "bold" })], ["p"]);
            const result = serialize(makeDoc([block]));
            const toggleMatch = result.match(/\[\[(\+[^\]]+)\]\]/);
            expect(toggleMatch![1]).toBe("+color: red; +weight: bold");
        });

        it("handles newline nodes as line separators", () => {
            const block = makeBlock(
                {},
                [makeText("line1"), makeNewline(), makeText("line2")],
                ["p"],
            );
            const result = serialize(makeDoc([block]));
            expect(result).toContain("    line1\n    line2");
        });
    });

    describe("edge cases", () => {
        it("skips empty blocks", () => {
            const empty = makeBlock({}, [], ["x"]);
            expect(serialize(makeDoc([empty]))).toBe("");
        });

        it("text nodes directly in root without a block wrapper are serialized as plain text", () => {
            const doc: IR.IRDocument = {
                root: {
                    ...makeBlock(),
                    children: [makeText("orphan")],
                },
                nodeMap: new Map(),
                classDefinitions: {},
            };
            expect(serialize(doc)).toBe("orphan");
        });

        it("two consecutive newline nodes produce one blank line between paragraphs", () => {
            const block = makeBlock(
                {},
                [makeText("a"), makeNewline(), makeNewline(), makeText("b")],
                ["p"],
            );
            const result = serialize(makeDoc([block]));
            const lines = result.split("\n");
            const blankCount = lines.filter((l) => l.trim() === "").length;
            expect(blankCount).toBe(1);
        });

        it("emits an empty line when a newline node appears before any text in a run", () => {
            const block = makeBlock({}, [makeNewline(), makeText("text")], ["p"]);
            const result = serialize(makeDoc([block]));
            expect(result).toContain("\n    text");
        });

        it("does not emit a trailing line when run ends with a newline node", () => {
            const block = makeBlock({}, [makeText("text"), makeNewline()], ["p"]);
            const result = serialize(makeDoc([block]));
            const lines = result.split("\n");
            expect(lines.some((l) => l.includes("text"))).toBe(true);
            const lastMeaningful = lines.filter((l) => l.trim() !== "").at(-1);
            expect(lastMeaningful).toBe("}");
        });

        it("three consecutive newline nodes produce two blank lines", () => {
            const block = makeBlock(
                {},
                [makeText("a"), makeNewline(), makeNewline(), makeNewline(), makeText("b")],
                ["p"],
            );
            const result = serialize(makeDoc([block]));
            const lines = result.split("\n");
            const blanks = lines.filter((l) => l.trim() === "").length;
            expect(blanks).toBe(2);
        });

        it("a leading newline node in the document is preserved", () => {
            const doc = makeDoc([makeNewline(), makeText("text")]);
            const result = serialize(doc);
            expect(result.startsWith("\n")).toBe(true);
        });
    });
});
