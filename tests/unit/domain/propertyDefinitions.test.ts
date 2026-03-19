import { describe, it, expect } from "vitest";
import { getPropertyDefinition } from "@/domain/propertyDefinitions";

describe("getPropertyDefinition", () => {
    describe("unknown properties", () => {
        it("returns null for an unregistered key", () => {
            expect(getPropertyDefinition("nonexistent")).toBeNull();
        });

        it("returns null for an empty string", () => {
            expect(getPropertyDefinition("")).toBeNull();
        });

        it("is case-sensitive — uppercase keys are not found", () => {
            expect(getPropertyDefinition("COLOR")).toBeNull();
            expect(getPropertyDefinition("Fill")).toBeNull();
            expect(getPropertyDefinition("ALIGN")).toBeNull();
        });
    });

    describe("scope assignments", () => {
        it.each([
            "hidden",
            "fill",
            "radius",
            "indent",
            "padding",
            "margin",
            "border",
            "width",
            "height",
            "align",
        ])("%s is block-scoped", (key) => {
            expect(getPropertyDefinition(key)?.scope).toBe("block");
        });

        it.each(["color", "font", "size", "weight", "style", "line-height", "decoration"])(
            "%s is inline-scoped",
            (key) => {
                expect(getPropertyDefinition(key)?.scope).toBe("inline");
            },
        );
    });

    describe("hidden", () => {
        const { validate } = getPropertyDefinition("hidden")!;

        it.each(["true", "false", "TRUE", "FALSE", "True", "False"])(
            'accepts case-insensitive boolean "%s"',
            (val) => expect(validate(val)).toBe(true),
        );

        it.each(["1", "0", "yes", "no", "", " ", "truee"])('rejects non-boolean "%s"', (val) =>
            expect(validate(val)).toBe(false),
        );
    });

    describe("align", () => {
        const { validate } = getPropertyDefinition("align")!;

        it.each(["left", "right", "center", "justify"])('accepts "%s"', (val) =>
            expect(validate(val)).toBe(true),
        );

        it.each(["start", "end", "LEFT", "CENTER", "middle", ""])('rejects "%s"', (val) =>
            expect(validate(val)).toBe(false),
        );
    });

    describe("radius, width, height, indent, size — integer only", () => {
        it.each(["radius", "width", "height", "indent", "size"])(
            "%s accepts bare integers including zero and negatives",
            (key) => {
                const { validate } = getPropertyDefinition(key)!;
                expect(validate("0")).toBe(true);
                expect(validate("10")).toBe(true);
                expect(validate("100")).toBe(true);
                expect(validate("-5")).toBe(true);
            },
        );

        it.each(["radius", "width", "height", "indent", "size"])(
            "%s rejects decimals, units, and non-numbers",
            (key) => {
                const { validate } = getPropertyDefinition(key)!;
                expect(validate("10px")).toBe(false);
                expect(validate("1.5")).toBe(false);
                expect(validate("1.5rem")).toBe(false);
                expect(validate("abc")).toBe(false);
                expect(validate("")).toBe(false);
            },
        );
    });

    describe("padding and margin — whitespace-separated integers", () => {
        it.each(["padding", "margin"])("%s accepts one to four integers", (key) => {
            const { validate } = getPropertyDefinition(key)!;
            expect(validate("10")).toBe(true);
            expect(validate("10 20")).toBe(true);
            expect(validate("10 20 10")).toBe(true);
            expect(validate("10 20 10 5")).toBe(true);
            expect(validate("0 0 0 0")).toBe(true);
        });

        it.each(["padding", "margin"])("%s rejects values with units or non-numbers", (key) => {
            const { validate } = getPropertyDefinition(key)!;
            expect(validate("10px")).toBe(false);
            expect(validate("10 auto")).toBe(false);
            expect(validate("1.5")).toBe(false);
            expect(validate("10 20px")).toBe(false);
            expect(validate("")).toBe(false);
        });
    });

    describe("fill and border — non-empty string", () => {
        it.each(["fill", "border"])("%s accepts any non-empty string", (key) => {
            const { validate } = getPropertyDefinition(key)!;
            expect(validate("#ff0000")).toBe(true);
            expect(validate("1px solid black")).toBe(true);
            expect(validate("rgba(0,0,0,0.5)")).toBe(true);
        });

        it.each(["fill", "border"])("%s rejects empty and whitespace-only strings", (key) => {
            const { validate } = getPropertyDefinition(key)!;
            expect(validate("")).toBe(false);
            expect(validate("   ")).toBe(false);
        });
    });

    describe("color, font, line-height — non-empty string", () => {
        it.each(["color", "font", "line-height"])("%s accepts any non-empty string", (key) => {
            const { validate } = getPropertyDefinition(key)!;
            expect(validate("red")).toBe(true);
            expect(validate("Georgia, serif")).toBe(true);
            expect(validate("1.5")).toBe(true);
            expect(validate("20px")).toBe(true);
        });

        it.each(["color", "font", "line-height"])("%s rejects empty string", (key) => {
            const { validate } = getPropertyDefinition(key)!;
            expect(validate("")).toBe(false);
        });
    });

    describe("weight", () => {
        const { validate } = getPropertyDefinition("weight")!;

        it.each(["normal", "bold", "bolder", "lighter"])('accepts keyword "%s"', (val) =>
            expect(validate(val)).toBe(true),
        );

        it.each([
            ["1", true],
            ["100", true],
            ["500", true],
            ["1000", true],
            ["0", false],
            ["1001", false],
        ] as [string, boolean][])("numeric %s → %s", (val, expected) => {
            expect(validate(val)).toBe(expected);
        });

        it.each(["light", "heavy", "Bold", "1.5", "100px", "", "0"])(
            'rejects invalid value "%s"',
            (val) => expect(validate(val)).toBe(false),
        );
    });

    describe("style", () => {
        const { validate } = getPropertyDefinition("style")!;

        it.each(["normal", "italic", "oblique"])('accepts "%s"', (val) =>
            expect(validate(val)).toBe(true),
        );

        it.each(["bold", "underline", "ITALIC", ""])('rejects "%s"', (val) =>
            expect(validate(val)).toBe(false),
        );
    });

    describe("decoration", () => {
        const { validate } = getPropertyDefinition("decoration")!;

        it.each(["none", "underline", "line-through", "overline"])('accepts "%s"', (val) =>
            expect(validate(val)).toBe(true),
        );

        it.each(["blink", "bold", "UNDERLINE", "strike", ""])('rejects "%s"', (val) =>
            expect(validate(val)).toBe(false),
        );
    });

    describe("kind property", () => {
        it("kind is block-scoped and not a container", () => {
            const def = getPropertyDefinition("kind")!;
            expect(def.scope).toBe("block");
            expect(def.container).toBe(false);
        });

        it("kind accepts all valid values from the spec", () => {
            const { validate } = getPropertyDefinition("kind")!;
            for (const v of [
                "paragraph",
                "heading1",
                "heading2",
                "heading3",
                "heading4",
                "heading5",
                "code",
                "item",
                "quote",
                "list",
                "ordered-list",
                "aside",
                "section",
                "article",
                "header",
                "footer",
            ]) {
                expect(validate(v)).toBe(true);
            }
        });

        it("kind rejects unknown values", () => {
            const { validate } = getPropertyDefinition("kind")!;
            expect(validate("div")).toBe(false);
            expect(validate("")).toBe(false);
        });
    });

    describe("container flag", () => {
        it("visual container props have container: true", () => {
            for (const key of [
                "fill",
                "padding",
                "margin",
                "border",
                "radius",
                "width",
                "height",
            ]) {
                expect(getPropertyDefinition(key)?.container).toBe(true);
            }
        });

        it("control props have container: false", () => {
            for (const key of ["kind", "hidden", "indent", "align"]) {
                expect(getPropertyDefinition(key)?.container).toBe(false);
            }
        });

        it("all inline props have container: false", () => {
            for (const key of [
                "color",
                "font",
                "size",
                "weight",
                "style",
                "line-height",
                "decoration",
            ]) {
                expect(getPropertyDefinition(key)?.container).toBe(false);
            }
        });
    });
});
