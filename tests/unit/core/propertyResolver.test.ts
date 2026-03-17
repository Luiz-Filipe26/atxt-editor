import { describe, it, expect } from "vitest";
import { PropertyResolver } from "@/core/propertyResolver";
import * as AST from "@/types/ast";

function makeResolver() {
    const errors: string[] = [];
    const resolver = new PropertyResolver((msg) => errors.push(msg));
    return { resolver, errors };
}

function prop(key: string, value: string, toggle?: "plus" | "minus"): AST.PropertyNode {
    return {
        type: AST.NodeType.PROPERTY,
        key,
        value,
        toggle,
        line: 1,
        column: 1,
    };
}

function defineAnnotation(
    className: string,
    extraProps: Record<string, string> = {},
    compose?: string,
): AST.AnnotationNode {
    const properties: AST.PropertyNode[] = [
        prop("class", className),
        ...(compose ? [prop("compose", compose)] : []),
        ...Object.entries(extraProps).map(([k, v]) => prop(k, v)),
    ];
    return {
        type: AST.NodeType.ANNOTATION,
        directive: "DEFINE",
        properties,
        target: null,
        line: 1,
        column: 1,
    };
}

describe("PropertyResolver", () => {
    describe("resolveProperties — single property", () => {
        it("resolves a valid inline property", () => {
            const { resolver, errors } = makeResolver();
            expect(resolver.resolveProperties([prop("color", "red")])).toEqual({
                color: "red",
            });
            expect(errors).toHaveLength(0);
        });

        it("resolves a valid block property", () => {
            const { resolver } = makeResolver();
            expect(resolver.resolveProperties([prop("align", "center")])).toEqual({
                align: "center",
            });
        });

        it("returns empty object for an empty property list", () => {
            const { resolver } = makeResolver();
            expect(resolver.resolveProperties([])).toEqual({});
        });
    });

    describe("resolveProperties — multiple properties", () => {
        it("resolves multiple valid properties at once", () => {
            const { resolver } = makeResolver();
            const result = resolver.resolveProperties([
                prop("color", "red"),
                prop("size", "16"),
                prop("align", "center"),
            ]);
            expect(result).toEqual({ color: "red", size: "16", align: "center" });
        });

        it("resolves a mix of block and inline properties into a flat record", () => {
            const { resolver } = makeResolver();
            const result = resolver.resolveProperties([prop("fill", "#ccc"), prop("color", "red")]);
            expect(result).toEqual({ fill: "#ccc", color: "red" });
        });
    });

    describe("resolveProperties — error handling", () => {
        it("emits a warning and skips an unknown property", () => {
            const { resolver, errors } = makeResolver();
            const result = resolver.resolveProperties([prop("alien-prop", "value")]);
            expect(result).toEqual({});
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("alien-prop");
        });

        it("emits a warning and skips a property with an invalid value", () => {
            const { resolver, errors } = makeResolver();
            const result = resolver.resolveProperties([prop("align", "diagonal")]);
            expect(result).toEqual({});
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("align");
        });

        it("skips the invalid property but keeps the valid ones", () => {
            const { resolver, errors } = makeResolver();
            const result = resolver.resolveProperties([
                prop("color", "red"),
                prop("align", "diagonal"),
                prop("size", "16"),
            ]);
            expect(result).toEqual({ color: "red", size: "16" });
            expect(errors).toHaveLength(1);
        });
    });

    describe("resolveProperties — toggle handling", () => {
        it("includes plus-toggle properties in the resolved result", () => {
            const { resolver } = makeResolver();
            const result = resolver.resolveProperties([prop("color", "blue", "plus")]);
            expect(result).toEqual({ color: "blue" });
        });

        it("excludes minus-toggle properties from the resolved result", () => {
            const { resolver, errors } = makeResolver();
            const result = resolver.resolveProperties([prop("color", "", "minus")]);
            expect(result).toEqual({});
            expect(errors).toHaveLength(0);
        });
    });

    describe("defineClass and class application", () => {
        it("a defined class is resolved when applied by name", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("bold-red", { color: "red", weight: "bold" }));
            const result = resolver.resolveProperties([prop("class", "bold-red")]);
            expect(result).toEqual({ color: "red", weight: "bold" });
        });

        it("inline properties override class properties for conflicting keys", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("fancy", { color: "red", size: "20" }));
            const result = resolver.resolveProperties([
                prop("class", "fancy"),
                prop("color", "blue"),
            ]);
            expect(result.color).toBe("blue");
            expect(result.size).toBe("20");
        });

        it("class properties do not override inline properties when class is declared first", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("base", { size: "14" }));
            const result = resolver.resolveProperties([prop("size", "20"), prop("class", "base")]);
            // applyClassProperties runs first, then applyInlineProperties overwrites
            expect(result.size).toBe("20");
        });

        it("emits a warning when applying an undefined class", () => {
            const { resolver, errors } = makeResolver();
            resolver.resolveProperties([prop("class", "nonexistent")]);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("nonexistent");
        });

        it("emits an error when DEFINE is missing the class property", () => {
            const { resolver, errors } = makeResolver();
            resolver.defineClass({
                type: AST.NodeType.ANNOTATION,
                directive: "DEFINE",
                properties: [prop("color", "red")],
                target: null,
                line: 1,
                column: 1,
            });
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("class");
        });

        it("silently ignores invalid properties inside a DEFINE", () => {
            const { resolver, errors } = makeResolver();
            resolver.defineClass(defineAnnotation("bad", { align: "diagonal" }));
            expect(errors).toHaveLength(1);
            // The class is still defined but without the invalid property
            const result = resolver.resolveProperties([prop("class", "bad")]);
            expect(result.align).toBeUndefined();
        });
    });

    describe("compose inheritance", () => {
        it("child class inherits all properties from parent via compose", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("base", { color: "red", size: "14" }));
            resolver.defineClass(defineAnnotation("child", { size: "18" }, "base"));

            const result = resolver.resolveProperties([prop("class", "child")]);
            expect(result.color).toBe("red"); // inherited
            expect(result.size).toBe("18"); // overridden by child
        });

        it("child properties override composed properties", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("base", { color: "red" }));
            resolver.defineClass(defineAnnotation("child", { color: "blue" }, "base"));

            const result = resolver.resolveProperties([prop("class", "child")]);
            expect(result.color).toBe("blue");
        });

        it("emits a warning when compose references an undefined class", () => {
            const { resolver, errors } = makeResolver();
            resolver.defineClass(defineAnnotation("orphan", {}, "missing-parent"));
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("missing-parent");
        });
    });

    describe("routePropertiesByScope", () => {
        it("routes all block properties to blockProps", () => {
            const { resolver } = makeResolver();
            const { blockProps, inlineProps } = resolver.routePropertiesByScope({
                fill: "#ccc",
                align: "center",
                hidden: "true",
            });
            expect(blockProps).toEqual({
                fill: "#ccc",
                align: "center",
                hidden: "true",
            });
            expect(inlineProps).toEqual({});
        });

        it("routes all inline properties to inlineProps", () => {
            const { resolver } = makeResolver();
            const { blockProps, inlineProps } = resolver.routePropertiesByScope({
                color: "red",
                size: "16",
                weight: "bold",
            });
            expect(blockProps).toEqual({});
            expect(inlineProps).toEqual({ color: "red", size: "16", weight: "bold" });
        });

        it("splits a mixed set of properties into the correct buckets", () => {
            const { resolver } = makeResolver();
            const { blockProps, inlineProps } = resolver.routePropertiesByScope({
                fill: "#ccc",
                color: "red",
                align: "center",
                size: "16",
            });
            expect(blockProps).toEqual({ fill: "#ccc", align: "center" });
            expect(inlineProps).toEqual({ color: "red", size: "16" });
        });

        it("silently drops properties that are not in the registry", () => {
            const { resolver } = makeResolver();
            const { blockProps, inlineProps } = resolver.routePropertiesByScope({
                unknown: "value",
            });
            expect(blockProps).toEqual({});
            expect(inlineProps).toEqual({});
        });

        it("returns empty buckets for an empty input", () => {
            const { resolver } = makeResolver();
            expect(resolver.routePropertiesByScope({})).toEqual({
                blockProps: {},
                inlineProps: {},
            });
        });
    });

    describe("reset", () => {
        it("clears all defined classes so they produce errors after reset", () => {
            const { resolver, errors } = makeResolver();
            resolver.defineClass(defineAnnotation("myclass", { color: "red" }));
            resolver.reset();
            resolver.resolveProperties([prop("class", "myclass")]);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("myclass");
        });

        it("allows the same class name to be re-defined after reset", () => {
            const { resolver, errors } = makeResolver();
            resolver.defineClass(defineAnnotation("cls", { color: "red" }));
            resolver.reset();
            resolver.defineClass(defineAnnotation("cls", { color: "blue" }));
            const result = resolver.resolveProperties([prop("class", "cls")]);
            expect(result.color).toBe("blue");
            expect(errors).toHaveLength(0);
        });
    });
});
