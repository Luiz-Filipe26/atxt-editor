import { describe, it, expect } from "vitest";
import { dedent } from "@/utils/stringUtils";

describe("dedent", () => {
    describe("static templates (no interpolation)", () => {
        it("removes the base indentation from every line", () => {
            const result = dedent`
                line one
                line two
                line three
            `;
            expect(result).toBe("line one\nline two\nline three");
        });

        it("preserves relative indentation between lines", () => {
            const result = dedent`
                outer
                    inner
                outer again
            `;
            expect(result).toBe("outer\n    inner\nouter again");
        });

        it("trims leading and trailing blank lines", () => {
            const result = dedent`

                content

            `;
            expect(result).toBe("content");
        });

        it("handles a template with no leading newline (no base indent to strip)", () => {
            const result = dedent`hello`;
            expect(result).toBe("hello");
        });

        it("handles a single-line template with leading indent", () => {
            const result = dedent`
                single line
            `;
            expect(result).toBe("single line");
        });
    });

    describe("interpolated values", () => {
        it("injects a single-line value at the correct column", () => {
            const value = "injected";
            const result = dedent`
                before
                ${value}
                after
            `;
            expect(result).toBe("before\ninjected\nafter");
        });

        it("applies insertion-point indentation to all lines of a multi-line value", () => {
            const value = "line A\nline B\nline C";
            const result = dedent`
                prefix:
                    ${value}
                suffix
            `;
            expect(result).toBe("prefix:\n    line A\n    line B\n    line C\nsuffix");
        });

        it("applies correct indentation when insertion point is at base level", () => {
            const value = "alpha\nbeta";
            const result = dedent`
                ${value}
            `;
            expect(result).toBe("alpha\nbeta");
        });

        it("handles multiple interpolations at different indentation levels", () => {
            const a = "alpha";
            const b = "beta\ngamma";
            const result = dedent`
                ${a}
                    ${b}
            `;
            expect(result).toBe("alpha\n    beta\n    gamma");
        });

        it("handles an empty interpolated value without collapsing surrounding lines", () => {
            const empty = "";
            const result = dedent`
                before
                ${empty}
                after
            `;
            expect(result).toBe("before\n\nafter");
        });

        it("handles a numeric interpolated value", () => {
            const n = 42;
            const result = dedent`
                value: ${n}
            `;
            expect(result).toBe("value: 42");
        });
        it("interpolation with no preceding newline has no insertion indent", () => {
            const value = "hello";
            const result = dedent`${value} world`;
            expect(result).toBe("hello world");
        });
    });

    describe("real-world usage — CSS generation", () => {
        it("produces correctly indented CSS blocks when injecting multi-line strings", () => {
            const baseCss = ".root {\n  color: red;\n}";
            const dynamicCss = ".a {\n  font-size: 16px;\n}";
            const result = dedent`
                <style>
                    ${baseCss}
                    ${dynamicCss}
                </style>
            `;
            expect(result).toBe(
                "<style>\n" +
                "    .root {\n" +
                "      color: red;\n" +
                "    }\n" +
                "    .a {\n" +
                "      font-size: 16px;\n" +
                "    }\n" +
                "</style>",
            );
        });
    });
});
