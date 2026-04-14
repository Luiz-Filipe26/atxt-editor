import { describe, it, expect } from "vitest";
import { compileToHTML, compileToIR } from "@atxt";
import { CompilerErrorType } from "@atxt/types/errors";

describe("Generator — security", () => {
    describe("XSS via text content", () => {
        it("script tag in text content is not rendered as HTML", () => {
            const { html } = compileToHTML("<script>alert(1)</script>");
            expect(html).not.toContain("<script>");
            expect(html).not.toContain("alert(1)");
        });

        it("img onerror payload in text content is neutralized", () => {
            const { html } = compileToHTML('<img src=x onerror="alert(1)">');
            expect(html).not.toContain("onerror");
            expect(html).not.toContain("<img");
        });

        it("iframe injection in text content is removed", () => {
            const { html } = compileToHTML('<iframe src="javascript:alert(1)"></iframe>');
            expect(html).not.toContain("<iframe");
        });

        it("svg onload payload in text content is neutralized", () => {
            const { html } = compileToHTML('<svg onload="alert(1)">');
            expect(html).not.toContain("onload");
        });

        it("unknown tags are removed by DOMPurify, surrounding text is preserved", () => {
            const { html } = compileToHTML("Hello <World> & 'friends'");
            expect(html).not.toContain("<World>");
            expect(html).toContain("Hello");
            expect(html).toContain("friends");
            expect(html).toContain("&amp;");
        });
    });

    describe("Strict semantic validation blocks exploits", () => {
        it("malicious URLs fail color validation (fill/color)", () => {
            const { errors } = compileToIR("[[fill: javascript:alert(1)]] {Hello}");
            expect(errors.some((e) => e.type === CompilerErrorType.Lowerer)).toBe(true);
        });

        it("CSS expressions fail color validation (color)", () => {
            const { errors } = compileToIR("[[color: expression(alert(1))]] Hello");
            expect(errors.some((e) => e.type === CompilerErrorType.Lowerer)).toBe(true);
        });

        it("malicious strings fail border validation", () => {
            const { errors } = compileToIR("[[border: 1px solid javascript:alert(1)]] {Hello}");
            expect(errors.some((e) => e.type === CompilerErrorType.Lowerer)).toBe(true);
        });
    });

    describe("XSS via property values — target validation (HtmlGenerator)", () => {
        it.each(["expression(alert(1))", "url(evil.com)", "javascript:alert(1)"])(
            "rejects malicious font pattern '%s' and logs a generator error",
            (payload) => {
                const { errors, html } = compileToHTML(`[[font: ${payload}]] Hello`);
                expect(errors.some((e) => e.type === CompilerErrorType.HtmlGenerator)).toBe(true);
                expect(html).not.toContain(payload);
            },
        );
    });

    describe("disallowed HTML tags are removed", () => {
        it("object tag is removed", () => {
            const { html } = compileToHTML('<object data="malicious.swf"></object>');
            expect(html).not.toContain("<object");
        });

        it("link tag is removed", () => {
            const { html } = compileToHTML('<link rel="stylesheet" href="evil.css">');
            expect(html).not.toContain("<link");
        });

        it("meta tag is removed", () => {
            const { html } = compileToHTML('<meta http-equiv="refresh" content="0;url=evil.com">');
            expect(html).not.toContain("<meta");
        });
    });

    describe("allowed structure is preserved after sanitization", () => {
        it("data-id attributes survive sanitization", () => {
            const { html } = compileToHTML("Hello");
            expect(html).toMatch(/data-id="[^"]+"/);
        });

        it("generated class attributes survive sanitization", () => {
            const { html } = compileToHTML("[[color: red]] Hello");
            expect(html).toMatch(/class="atxt-cls-[a-z0-9]+"/);
        });

        it("semantic tags from kind survive sanitization", () => {
            const { html } = compileToHTML("# Heading");
            expect(html).toContain("<h1");
        });

        it("style tag with generated CSS survives sanitization", () => {
            const { html } = compileToHTML("[[color: red]] Hello");
            expect(html).toContain("<style>");
            expect(html).toContain("color: red");
        });
    });
});
