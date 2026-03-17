import { describe, it, expect } from "vitest";
import { getCssMapping } from "@/domain/cssPropertyMapping";

describe("getCssMapping", () => {
    describe("unknown keys", () => {
        it("returns null for an unregistered key", () => {
            expect(getCssMapping("nonexistent")).toBeNull();
        });

        it("returns null for an empty string", () => {
            expect(getCssMapping("")).toBeNull();
        });

        it("is case-sensitive", () => {
            expect(getCssMapping("COLOR")).toBeNull();
            expect(getCssMapping("Fill")).toBeNull();
        });
    });

    describe("compiler-only properties have no CSS mapping", () => {
        it("hidden has no CSS mapping — it is a generator directive", () => {
            expect(getCssMapping("hidden")).toBeNull();
        });

        it("indent has no CSS mapping — handled by the generator separately", () => {
            expect(getCssMapping("indent")).toBeNull();
        });
    });

    describe("null-unit properties — value passes through unchanged", () => {
        it.each([
            ["fill", "background-color"],
            ["border", "border"],
            ["align", "text-align"],
            ["color", "color"],
            ["font", "font-family"],
            ["weight", "font-weight"],
            ["style", "font-style"],
            ["line-height", "line-height"],
            ["decoration", "text-decoration"],
        ] as [string, string][])("%s maps to %s with unit: null", (key, cssProperty) => {
            expect(getCssMapping(key)).toEqual({ cssProperty, unit: null });
        });
    });

    describe("px-fallback properties — bare integers receive 'px' suffix", () => {
        it.each([
            ["radius", "border-radius"],
            ["width", "width"],
            ["height", "height"],
            ["size", "font-size"],
        ] as [string, string][])("%s maps to %s with unit: px-fallback", (key, cssProperty) => {
            expect(getCssMapping(key)).toEqual({
                cssProperty,
                unit: "px-fallback",
            });
        });
    });

    describe("multi-px-fallback properties — each space-separated token may receive 'px'", () => {
        it.each([
            ["padding", "padding"],
            ["margin", "margin"],
        ] as [string, string][])(
            "%s maps to %s with unit: multi-px-fallback",
            (key, cssProperty) => {
                expect(getCssMapping(key)).toEqual({
                    cssProperty,
                    unit: "multi-px-fallback",
                });
            },
        );
    });

    describe("full registry coverage — every ATXT property with a CSS equivalent is mapped", () => {
        const expectedKeys = [
            "fill",
            "radius",
            "padding",
            "margin",
            "border",
            "width",
            "height",
            "align",
            "color",
            "font",
            "size",
            "weight",
            "style",
            "line-height",
            "decoration",
        ];

        it.each(expectedKeys)("%s returns a non-null mapping", (key) => {
            expect(getCssMapping(key)).not.toBeNull();
        });

        it.each(expectedKeys)("%s mapping has a non-empty cssProperty", (key) => {
            const mapping = getCssMapping(key)!;
            expect(mapping.cssProperty.length).toBeGreaterThan(0);
        });
    });
});
