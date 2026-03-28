import { describe, it, expect } from "vitest";
import { getPropertyDefinition } from "@atxt";

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

    describe("radius, width, height — any integer", () => {
        it.each(["radius", "width", "height"])(
            "%s accepts integers including zero and negatives",
            (key) => {
                const { validate } = getPropertyDefinition(key)!;
                expect(validate("0")).toBe(true);
                expect(validate("10")).toBe(true);
                expect(validate("-5")).toBe(true);
            },
        );

        it.each(["radius", "width", "height"])(
            "%s rejects decimals, units, and non-numbers",
            (key) => {
                const { validate } = getPropertyDefinition(key)!;
                expect(validate("10px")).toBe(false);
                expect(validate("1.5")).toBe(false);
                expect(validate("abc")).toBe(false);
                expect(validate("")).toBe(false);
            },
        );
    });

    describe("indent — non-negative integer", () => {
        const { validate } = getPropertyDefinition("indent")!;

        it.each(["0", "1", "4", "100"])('accepts "%s"', (val) => expect(validate(val)).toBe(true));

        it.each(["-1", "-5", "1.5", "10px", "abc", ""])('rejects "%s"', (val) =>
            expect(validate(val)).toBe(false),
        );
    });

    describe("size — positive number", () => {
        const { validate } = getPropertyDefinition("size")!;

        it.each(["1", "14", "13.5", "0.5"])('accepts "%s"', (val) =>
            expect(validate(val)).toBe(true),
        );

        it.each(["0", "-1", "-5", "1.5rem", "14px", "abc", ""])('rejects "%s"', (val) =>
            expect(validate(val)).toBe(false),
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

    describe("fill — CSS color", () => {
        const { validate } = getPropertyDefinition("fill")!;

        it.each(["#fff", "#ff0000", "#ff000080", "red", "cornflowerblue", "transparent"])(
            'accepts valid color "%s"',
            (val) => expect(validate(val)).toBe(true),
        );

        it("accepts rgb()", () => expect(validate("rgb(255,0,0)")).toBe(true));
        it("accepts rgba()", () => expect(validate("rgba(0,0,0,0.5)")).toBe(true));
        it("accepts hsl()", () => expect(validate("hsl(0,100%,50%)")).toBe(true));
        it("accepts hsla()", () => expect(validate("hsla(0,100%,50%,0.5)")).toBe(true));

        it.each(["", "   ", "javascript:alert(1)", "expression(alert(1))", "1px solid black"])(
            'rejects invalid value "%s"',
            (val) => expect(validate(val)).toBe(false),
        );
    });

    describe("border — safe CSS shorthand characters", () => {
        const { validate } = getPropertyDefinition("border")!;

        it.each(["1px solid black", "2px dashed #ccc", "thin solid red", "0"])(
            'accepts valid border "%s"',
            (val) => expect(validate(val)).toBe(true),
        );

        it.each(["", "javascript:alert(1)", "1px solid url(x)", "expression(alert(1))"])(
            'rejects invalid value "%s"',
            (val) => expect(validate(val)).toBe(false),
        );
    });

    describe("color — CSS color", () => {
        const { validate } = getPropertyDefinition("color")!;

        it.each(["red", "#ff0000", "rgb(255,0,0)", "rgba(0,0,0,0.5)", "hsl(0,100%,50%)"])(
            'accepts valid color "%s"',
            (val) => expect(validate(val)).toBe(true),
        );

        it.each(["", "Georgia, serif", "1.5", "20px", "javascript:alert(1)", "expression(x)"])(
            'rejects invalid value "%s"',
            (val) => expect(validate(val)).toBe(false),
        );
    });

    describe("font — font family name", () => {
        const { validate } = getPropertyDefinition("font")!;

        it.each(["Arial", "Georgia, serif", "Times New Roman", "sans-serif", "Helvetica Neue"])(
            'accepts valid font "%s"',
            (val) => expect(validate(val)).toBe(true),
        );

        it.each(["", "expression(alert(1))", "url(evil.com)", "javascript:x"])(
            'rejects invalid value "%s"',
            (val) => expect(validate(val)).toBe(false),
        );
    });

    describe("line-height", () => {
        const { validate } = getPropertyDefinition("line-height")!;

        it.each(["normal", "1.5", "2", "1.8"])('accepts valid value "%s"', (val) =>
            expect(validate(val)).toBe(true),
        );

        it.each(["", "0", "-1", "20px", "bold", "expression(1)"])(
            'rejects invalid value "%s"',
            (val) => expect(validate(val)).toBe(false),
        );
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
