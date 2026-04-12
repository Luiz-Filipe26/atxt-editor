import { describe, it, expect } from "vitest";
import { Lexer, TokenType } from "@atxt";

const S = Lexer.ESCAPE_SENTINEL;

function tokenize(source: string) {
    return Lexer.tokenize(source);
}

function onlyTypes(source: string) {
    return tokenize(source)
        .tokens.filter((t) => t.type !== TokenType.Eof)
        .map((t) => t.type);
}

/** Strips escape sentinels from a string, mirroring what TextExpander does. */
function stripSentinels(s: string): string {
    return s.replaceAll(S, "");
}

/** Joins all TEXT token literals with sentinels stripped — the user-visible text content. */
function visibleText(source: string): string {
    return tokenize(source)
        .tokens.filter((t) => t.type === TokenType.Text)
        .map((t) => stripSentinels(t.literal))
        .join("");
}

describe("Lexer", () => {
    describe("plain text and newlines", () => {
        it("tokenizes a single word", () => {
            const { tokens, errors } = tokenize("Hello");
            expect(errors).toHaveLength(0);
            expect(tokens[0].type).toBe(TokenType.Text);
            expect(tokens[0].literal).toBe("Hello");
        });

        it("tokenizes text followed by a newline", () => {
            expect(onlyTypes("Hello\n")).toEqual([TokenType.Text, TokenType.Newline]);
        });

        it("emits a standalone NEWLINE for a blank line", () => {
            expect(onlyTypes("\n")).toEqual([TokenType.Newline]);
        });

        it("emits multiple NEWLINE tokens for consecutive blank lines", () => {
            expect(onlyTypes("\n\n\n")).toEqual([
                TokenType.Newline,
                TokenType.Newline,
                TokenType.Newline,
            ]);
        });

        it("strips leading whitespace at the start of a line", () => {
            const { tokens } = tokenize("    Hello");
            expect(tokens[0].type).toBe(TokenType.Text);
            expect(tokens[0].literal).toBe("Hello");
        });

        it("strips leading tabs at the start of a line", () => {
            const { tokens } = tokenize("\t\tHello");
            expect(tokens[0].type).toBe(TokenType.Text);
            expect(tokens[0].literal).toBe("Hello");
        });

        it("preserves whitespace that is not at the start of a line", () => {
            const { tokens } = tokenize("Hello   World");
            expect(tokens[0].literal).toBe("Hello   World");
        });

        it("records the correct line and column for tokens on the second line", () => {
            const { tokens } = tokenize("First\nSecond");
            const second = tokens.find((t) => t.literal === "Second");
            expect(second?.line).toBe(2);
            expect(second?.column).toBe(1);
        });
    });

    describe("blocks", () => {
        it("emits BLOCK_OPEN for {", () => {
            expect(onlyTypes("{")).toEqual([TokenType.BlockOpen]);
        });

        it("emits BLOCK_CLOSE for }", () => {
            expect(onlyTypes("}")).toEqual([TokenType.BlockClose]);
        });

        it("emits both tokens for an empty block", () => {
            expect(onlyTypes("{}")).toEqual([TokenType.BlockOpen, TokenType.BlockClose]);
        });
    });

    describe("annotations", () => {
        it("tokenizes a minimal annotation with one property", () => {
            expect(onlyTypes("[[key: value]]")).toEqual([
                TokenType.AnnotationOpen,
                TokenType.Identifier,
                TokenType.Colon,
                TokenType.Value,
                TokenType.AnnotationClose,
            ]);
        });

        it("extracts the key and value literals correctly", () => {
            const { tokens } = tokenize("[[color: red]]");
            expect(tokens.find((t) => t.type === TokenType.Identifier)?.literal).toBe("color");
            expect(tokens.find((t) => t.type === TokenType.Value)?.literal).toBe("red");
        });

        it("tokenizes two properties separated by a semicolon", () => {
            const { tokens } = tokenize("[[size: 16; weight: bold]]");
            const ids = tokens.filter((t) => t.type === TokenType.Identifier).map((t) => t.literal);
            const vals = tokens.filter((t) => t.type === TokenType.Value).map((t) => t.literal);
            expect(ids).toEqual(["size", "weight"]);
            expect(vals).toEqual(["16", "bold"]);
        });

        it("tokenizes three properties with trailing semicolon", () => {
            const { tokens, errors } = tokenize("[[a: 1; b: 2; c: 3]]");
            expect(errors).toHaveLength(0);
            const vals = tokens.filter((t) => t.type === TokenType.Value).map((t) => t.literal);
            expect(vals).toEqual(["1", "2", "3"]);
        });

        it("tokenizes directive keywords as IDENTIFIER tokens", () => {
            for (const keyword of ["SET", "DEFINE", "HIDE"]) {
                const { tokens } = tokenize(`[[${keyword}]]`);
                const id = tokens.find((t) => t.type === TokenType.Identifier);
                expect(id?.literal).toBe(keyword);
            }
        });

        it("includes the + prefix in the IDENTIFIER literal for toggle-add", () => {
            const { tokens, errors } = tokenize("[[+color: red]]");
            expect(errors).toHaveLength(0);
            const id = tokens.find((t) => t.type === TokenType.Identifier);
            expect(id?.literal).toBe("+color");
        });

        it("includes the - prefix in the IDENTIFIER literal for toggle-remove", () => {
            const { tokens, errors } = tokenize("[[-color]]");
            expect(errors).toHaveLength(0);
            const id = tokens.find((t) => t.type === TokenType.Identifier);
            expect(id?.literal).toBe("-color");
        });

        it("tokenizes an annotation followed by text on the same line", () => {
            const { tokens, errors } = tokenize("[[color: red]] Hello");
            expect(errors).toHaveLength(0);
            expect(tokens[0].type).toBe(TokenType.AnnotationOpen);
            const text = tokens.find((t) => t.type === TokenType.Text);
            expect(text?.literal).toContain("Hello");
        });
    });

    describe("property values", () => {
        it("unquoted value can contain spaces — stops at ] or ;", () => {
            const { tokens, errors } = tokenize("[[font: Georgia, serif]]");
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.Value);
            expect(value?.literal).toBe("Georgia, serif");
        });

        it("trims trailing whitespace from unquoted values", () => {
            const { tokens } = tokenize("[[font: Arial   ]]");
            const value = tokens.find((t) => t.type === TokenType.Value);
            expect(value?.literal).toBe("Arial");
        });

        it("double-quoted value strips the quotes and preserves internal content", () => {
            const { tokens, errors } = tokenize('[[border: "1px solid black"]]');
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.Value);
            expect(value?.literal).toBe("1px solid black");
        });

        it("single-quoted value works identically to double-quoted", () => {
            const { tokens, errors } = tokenize("[[border: '1px solid black']]");
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.Value);
            expect(value?.literal).toBe("1px solid black");
        });

        it("quoted value containing semicolons is not split", () => {
            const { tokens, errors } = tokenize('[[style: "a; b; c"]]');
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.Value);
            expect(value?.literal).toBe("a; b; c");
        });
    });

    describe("escape sequences", () => {
        it("\\[ does not produce ANNOTATION_OPEN — the characters appear as text", () => {
            const { tokens, errors } = tokenize("\\[\\[");
            expect(errors).toHaveLength(0);
            expect(tokens.some((t) => t.type === TokenType.AnnotationOpen)).toBe(false);
            // Token literals contain sentinel — TextExpander will strip it.
            // Visible content seen by the author: [[
            expect(visibleText("\\[\\[")).toBe("[[");
        });

        it("\\{ does not produce BLOCK_OPEN", () => {
            const { tokens, errors } = tokenize("\\{");
            expect(errors).toHaveLength(0);
            expect(tokens.some((t) => t.type === TokenType.BlockOpen)).toBe(false);
            // Raw token literal carries the sentinel prefix.
            expect(tokens[0].literal).toBe(S + "{");
        });

        it("\\\\ produces a single literal backslash in the visible text", () => {
            const { tokens } = tokenize("\\\\");
            expect(tokens[0].type).toBe(TokenType.Text);
            // Raw literal has sentinel; visible content is a single backslash.
            expect(tokens[0].literal).toBe(S + "\\");
            expect(visibleText("\\\\")).toBe("\\");
        });

        it("escaped structural characters inside text are treated as literals", () => {
            expect(visibleText("a\\[b\\]c")).toBe("a[b]c");
        });

        it("a backslash at EOF inside a quoted string does not crash", () => {
            const { errors } = tokenize('[[font: "Arial\\');
            expect(errors.some((e) => e.type === "LEXER")).toBe(true);
        });

        it("a lone backslash at EOF is silently discarded", () => {
            const { tokens, errors } = tokenize("\\");
            expect(errors).toHaveLength(0);
            // No TEXT token produced — nothing to escape.
            expect(tokens.filter((t) => t.type === TokenType.Text)).toHaveLength(0);
        });

        it("sentinel character in source is stripped before tokenization", () => {
            // U+E000 in source is reserved and removed.
            const { tokens, errors } = tokenize("ab\uE000cd");
            expect(errors).toHaveLength(0);
            expect(tokens[0].literal).toBe("abcd");
        });
    });

    describe("lexer errors", () => {
        it("emits a LEXER error for a single ] that does not close an annotation", () => {
            const { errors } = tokenize("[[key: value]");
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].type).toBe("LEXER");
        });

        it("emits a LEXER error for an unterminated double-quoted string", () => {
            const { errors } = tokenize('[[font: "Arial]]');
            expect(errors.some((e) => e.type === "LEXER")).toBe(true);
            expect(errors.some((e) => e.message.includes("Unterminated"))).toBe(true);
        });

        it("emits a LEXER error for an unterminated single-quoted string", () => {
            const { errors } = tokenize("[[font: 'Arial]]");
            expect(errors.some((e) => e.type === "LEXER")).toBe(true);
        });

        it("reports the correct line for an error on a non-first line", () => {
            const { errors } = tokenize("Normal text\n[[key: value]");
            const err = errors.find((e) => e.type === "LEXER");
            expect(err?.line).toBe(2);
        });

        it("emits no errors for a well-formed annotation", () => {
            const { errors } = tokenize("[[color: red; size: 16]]");
            expect(errors).toHaveLength(0);
        });

        it("emits no errors for a well-formed document with multiple constructs", () => {
            const { errors } = tokenize(
                "[[SET align: center]]\n[[+color: red]]\nHello World\n[[-color]]\n",
            );
            expect(errors).toHaveLength(0);
        });
    });

    describe("single '[' not followed by '[' — treated as text", () => {
        it("a lone '[' produces no ANNOTATION_OPEN and appears as text content", () => {
            const { tokens, errors } = tokenize("a[b");
            expect(errors).toHaveLength(0);
            expect(tokens.some((t) => t.type === TokenType.AnnotationOpen)).toBe(false);
            const text = tokens
                .filter((t) => t.type === TokenType.Text)
                .map((t) => t.literal)
                .join("");
            expect(text).toContain("[");
        });
    });

    describe("backslash edge cases", () => {
        it("an escaped newline produces a literal newline in text content, not a structural NEWLINE", () => {
            const { tokens, errors } = tokenize("\\\n");
            expect(errors).toHaveLength(0);
            const text = tokens.find((t) => t.type === TokenType.Text);
            // Raw literal: sentinel + \n. Visible content: \n.
            expect(text?.literal).toBe(S + "\n");
            expect(tokens.some((t) => t.type === TokenType.Newline)).toBe(false);
        });
    });

    describe("carriage return handling", () => {
        it("\\r in normal mode is silently dropped (Windows-style \\r\\n becomes one NEWLINE)", () => {
            const { tokens, errors } = tokenize("\r\n");
            expect(errors).toHaveLength(0);
            const types = tokens.filter((t) => t.type !== TokenType.Eof).map((t) => t.type);
            expect(types).toEqual([TokenType.Newline]);
        });
    });

    describe("semicolon in ANNOTATION_KEY mode", () => {
        it("semicolon after a value-less toggle key stays in ANNOTATION_KEY mode correctly", () => {
            const { tokens, errors } = tokenize("[[-color; +size: 16]]");
            expect(errors).toHaveLength(0);
            const ids = tokens.filter((t) => t.type === TokenType.Identifier).map((t) => t.literal);
            expect(ids).toContain("-color");
            expect(ids).toContain("+size");
            const semis = tokens.filter((t) => t.type === TokenType.Semicolon);
            expect(semis).toHaveLength(1);
        });
    });

    describe("single ']' in ANNOTATION_KEY mode", () => {
        it("a single ']' inside an annotation key position emits a LEXER error", () => {
            const { errors } = tokenize("[[key]");
            expect(errors.some((e) => e.type === "LEXER")).toBe(true);
        });
    });

    describe("invalid character in property name", () => {
        it("a character that is not a valid key char emits a LEXER error", () => {
            const { errors } = tokenize("[[!key: val]]");
            expect(errors.some((e) => e.type === "LEXER")).toBe(true);
        });
    });

    describe("quoted value edge cases", () => {
        it("a newline inside a quoted value emits a LEXER error", () => {
            const { errors } = tokenize('[[font: "Arial\n"]]');
            expect(errors.some((e) => e.type === "LEXER" && e.message.includes("Line break"))).toBe(
                true,
            );
        });

        it("a backslash escape inside a quoted value preserves the escaped character without sentinel", () => {
            const { tokens, errors } = tokenize('[[font: "Ar\\"ial"]]');
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.Value);
            // Quoted values bypass TextExpander — no sentinel in the value.
            expect(value?.literal).toBe('Ar"ial');
        });

        it("a backslash at EOF inside text content is consumed without error", () => {
            const { errors } = tokenize("a\\");
            expect(errors).toHaveLength(0);
        });
    });

    describe("annotation key at end of file — covers scanner.peek() returning \\0", () => {
        it("an annotation key with no closing ']]' is tokenized without lexer errors", () => {
            const { tokens, errors } = tokenize("[[color");
            expect(errors).toHaveLength(0);
            const id = tokens.find((t) => t.type === TokenType.Identifier);
            expect(id?.literal).toBe("color");
        });
    });
});
