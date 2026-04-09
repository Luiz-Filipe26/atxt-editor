import { describe, it, expect } from "vitest";
import { AST } from "@atxt";
import { PropertyResolver } from "@atxt/compiler/propertyResolver";

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
    merge?: string,
): AST.AnnotationNode {
    const properties: AST.PropertyNode[] = [
        prop("class", className),
        ...(merge ? [prop("merge", merge)] : []),
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

function toMap(record: Record<string, string>): Map<string, string> {
    return new Map(Object.entries(record));
}

describe("PropertyResolver", () => {
    describe("resolveProperties — single property", () => {
        it("resolves a valid inline property", () => {
            const { resolver, errors } = makeResolver();
            expect(resolver.resolveProperties([prop("color", "red")]).props).toEqual(
                toMap({ color: "red" }),
            );
            expect(errors).toHaveLength(0);
        });

        it("resolves a valid block property", () => {
            const { resolver } = makeResolver();
            expect(resolver.resolveProperties([prop("align", "center")]).props).toEqual(
                toMap({ align: "center" }),
            );
        });

        it("returns empty props for an empty property list", () => {
            const { resolver } = makeResolver();
            const result = resolver.resolveProperties([]);
            expect(result.props).toEqual(toMap({}));
            expect(result.classes).toEqual([]);
            expect(result.ownProps).toEqual(toMap({}));
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
            expect(result.props).toEqual(toMap({ color: "red", size: "16", align: "center" }));
        });

        it("resolves a mix of block and inline properties into a flat Map", () => {
            const { resolver } = makeResolver();
            const result = resolver.resolveProperties([prop("fill", "#ccc"), prop("color", "red")]);
            expect(result.props).toEqual(toMap({ fill: "#ccc", color: "red" }));
        });
    });

    describe("resolveProperties — error handling", () => {
        it("emits a warning and skips an unknown property", () => {
            const { resolver, errors } = makeResolver();
            const result = resolver.resolveProperties([prop("alien-prop", "value")]);
            expect(result.props).toEqual(toMap({}));
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("alien-prop");
        });

        it("emits a warning and skips a property with an invalid value", () => {
            const { resolver, errors } = makeResolver();
            const result = resolver.resolveProperties([prop("align", "diagonal")]);
            expect(result.props).toEqual(toMap({}));
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
            expect(result.props).toEqual(toMap({ color: "red", size: "16" }));
            expect(errors).toHaveLength(1);
        });
    });

    describe("resolveProperties — toggle handling", () => {
        it("includes plus-toggle properties in the resolved result", () => {
            const { resolver } = makeResolver();
            const result = resolver.resolveProperties([prop("color", "blue", "plus")]);
            expect(result.props).toEqual(toMap({ color: "blue" }));
        });

        it("excludes minus-toggle properties from the resolved result", () => {
            const { resolver, errors } = makeResolver();
            const result = resolver.resolveProperties([prop("color", "", "minus")]);
            expect(result.props).toEqual(toMap({}));
            expect(errors).toHaveLength(0);
        });
    });

    describe("resolveProperties — classes and directProps", () => {
        it("returns empty classes and ownProps for plain properties", () => {
            const { resolver } = makeResolver();
            const result = resolver.resolveProperties([prop("color", "red")]);
            expect(result.classes).toEqual([]);
            expect(result.ownProps).toEqual(toMap({ color: "red" }));
        });

        it("classes contains the applied class name", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("big", { size: "24" }));
            const result = resolver.resolveProperties([prop("class", "big")]);
            expect(result.classes).toEqual(["big"]);
        });

        it("ownProps contains only properties written directly on the annotation — not class-inherited ones", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("big", { size: "24" }));
            const result = resolver.resolveProperties([prop("class", "big"), prop("color", "red")]);

            expect(result.ownProps).toEqual(toMap({ color: "red" }));
            expect(result.ownProps.has("size")).toBe(false);
        });

        it("props contains both class-inherited and direct properties merged", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("big", { size: "24" }));
            const result = resolver.resolveProperties([prop("class", "big"), prop("color", "red")]);
            expect(result.props).toEqual(toMap({ size: "24", color: "red" }));
        });

        it("direct props override class props in the merged result", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("big", { size: "24" }));
            const result = resolver.resolveProperties([prop("class", "big"), prop("size", "32")]);
            expect(result.props.get("size")).toBe("32");
            expect(result.ownProps.get("size")).toBe("32");
        });
    });

    describe("defineClass and class application", () => {
        it("a defined class is resolved when applied by name", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("bold-red", { color: "red", weight: "bold" }));
            const result = resolver.resolveProperties([prop("class", "bold-red")]);
            expect(result.props).toEqual(toMap({ color: "red", weight: "bold" }));
        });

        it("inline properties override class properties for conflicting keys", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("fancy", { color: "red", size: "20" }));
            const result = resolver.resolveProperties([
                prop("class", "fancy"),
                prop("color", "blue"),
            ]);
            expect(result.props.get("color")).toBe("blue");
            expect(result.props.get("size")).toBe("20");
        });

        it("class properties do not override inline properties when class is declared first", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("base", { size: "14" }));
            const result = resolver.resolveProperties([prop("size", "20"), prop("class", "base")]);
            expect(result.props.get("size")).toBe("20");
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
            const result = resolver.resolveProperties([prop("class", "bad")]);
            expect(result.props.has("align")).toBe(false);
        });

        it("resolveClass returns null for a name not in the registry", () => {
            const { resolver } = makeResolver();
            expect(resolver.resolveClass("nonexistent")).toBeNull();
        });
    });

    describe("getClassDefinitions", () => {
        it("returns empty Map when no classes are defined", () => {
            const { resolver } = makeResolver();
            expect(resolver.getClassDefinitions()).toEqual(new Map());
        });

        it("returns all defined classes with their resolved props", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("big", { size: "24", weight: "bold" }));
            resolver.defineClass(defineAnnotation("red", { color: "red" }));
            const defs = resolver.getClassDefinitions();
            expect(defs.get("big")).toEqual(toMap({ size: "24", weight: "bold" }));
            expect(defs.get("red")).toEqual(toMap({ color: "red" }));
        });

        it("returns a copy — mutations do not affect the internal registry", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("big", { size: "24" }));
            const defs = resolver.getClassDefinitions();
            defs.set("big", toMap({ size: "999" }));
            expect(resolver.getClassDefinitions().get("big")).toEqual(toMap({ size: "24" }));
        });
    });

    describe("merge inheritance", () => {
        it("child class inherits all properties from parent via merge", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("base", { color: "red", size: "14" }));
            resolver.defineClass(defineAnnotation("child", { size: "18" }, "base"));

            const result = resolver.resolveProperties([prop("class", "child")]);
            expect(result.props.get("color")).toBe("red");
            expect(result.props.get("size")).toBe("18");
        });

        it("child properties override merged properties", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("base", { color: "red" }));
            resolver.defineClass(defineAnnotation("child", { color: "blue" }, "base"));

            const result = resolver.resolveProperties([prop("class", "child")]);
            expect(result.props.get("color")).toBe("blue");
        });

        it("emits a warning when merge references an undefined class", () => {
            const { resolver, errors } = makeResolver();
            resolver.defineClass(defineAnnotation("orphan", {}, "missing-parent"));
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("missing-parent");
        });
    });

    describe("routePropertiesByScope", () => {
        it("routes all block properties to blockProps", () => {
            const { resolver } = makeResolver();
            const { blockProps, inlineProps } = resolver.partitionByScope(
                toMap({
                    fill: "#ccc",
                    align: "center",
                    hidden: "true",
                }),
            );
            expect(blockProps).toEqual(
                toMap({
                    fill: "#ccc",
                    align: "center",
                    hidden: "true",
                }),
            );
            expect(inlineProps).toEqual(toMap({}));
        });

        it("routes all inline properties to inlineProps", () => {
            const { resolver } = makeResolver();
            const { blockProps, inlineProps } = resolver.partitionByScope(
                toMap({
                    color: "red",
                    size: "16",
                    weight: "bold",
                }),
            );
            expect(blockProps).toEqual(toMap({}));
            expect(inlineProps).toEqual(toMap({ color: "red", size: "16", weight: "bold" }));
        });

        it("splits a mixed set of properties into the correct buckets", () => {
            const { resolver } = makeResolver();
            const { blockProps, inlineProps } = resolver.partitionByScope(
                toMap({
                    fill: "#ccc",
                    color: "red",
                    align: "center",
                    size: "16",
                }),
            );
            expect(blockProps).toEqual(toMap({ fill: "#ccc", align: "center" }));
            expect(inlineProps).toEqual(toMap({ color: "red", size: "16" }));
        });

        it("silently drops properties that are not in the registry", () => {
            const { resolver } = makeResolver();
            const { blockProps, inlineProps } = resolver.partitionByScope(
                toMap({
                    unknown: "value",
                }),
            );
            expect(blockProps).toEqual(toMap({}));
            expect(inlineProps).toEqual(toMap({}));
        });

        it("returns empty buckets for an empty input", () => {
            const { resolver } = makeResolver();
            expect(resolver.partitionByScope(toMap({}))).toEqual({
                blockProps: toMap({}),
                inlineProps: toMap({}),
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
            expect(result.props.get("color")).toBe("blue");
            expect(errors).toHaveLength(0);
        });

        it("clears class definitions visible via getClassDefinitions", () => {
            const { resolver } = makeResolver();
            resolver.defineClass(defineAnnotation("cls", { color: "red" }));
            resolver.reset();
            expect(resolver.getClassDefinitions()).toEqual(new Map());
        });
    });
});
