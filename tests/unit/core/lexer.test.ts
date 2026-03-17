import { describe, it, expect } from "vitest";
import { Lexer } from "@/core/lexer";
import { TokenType } from "@/types/tokens";

function tokenize(source: string) {
    return new Lexer().tokenize(source);
}

function onlyTypes(source: string) {
    return tokenize(source)
        .tokens.filter((t) => t.type !== TokenType.EOF)
        .map((t) => t.type);
}

describe("Lexer", () => {
    describe("plain text and newlines", () => {
        it("tokenizes a single word", () => {
            const { tokens, errors } = tokenize("Hello");
            expect(errors).toHaveLength(0);
            expect(tokens[0].type).toBe(TokenType.TEXT);
            expect(tokens[0].literal).toBe("Hello");
        });

        it("tokenizes text followed by a newline", () => {
            expect(onlyTypes("Hello\n")).toEqual([TokenType.TEXT, TokenType.NEWLINE]);
        });

        it("emits a standalone NEWLINE for a blank line", () => {
            expect(onlyTypes("\n")).toEqual([TokenType.NEWLINE]);
        });

        it("emits multiple NEWLINE tokens for consecutive blank lines", () => {
            expect(onlyTypes("\n\n\n")).toEqual([
                TokenType.NEWLINE,
                TokenType.NEWLINE,
                TokenType.NEWLINE,
            ]);
        });

        it("strips leading whitespace at the start of a line", () => {
            const { tokens } = tokenize("    Hello");
            expect(tokens[0].type).toBe(TokenType.TEXT);
            expect(tokens[0].literal).toBe("Hello");
        });

        it("strips leading tabs at the start of a line", () => {
            const { tokens } = tokenize("\t\tHello");
            expect(tokens[0].type).toBe(TokenType.TEXT);
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
            expect(onlyTypes("{")).toEqual([TokenType.BLOCK_OPEN]);
        });

        it("emits BLOCK_CLOSE for }", () => {
            expect(onlyTypes("}")).toEqual([TokenType.BLOCK_CLOSE]);
        });

        it("emits both tokens for an empty block", () => {
            expect(onlyTypes("{}")).toEqual([TokenType.BLOCK_OPEN, TokenType.BLOCK_CLOSE]);
        });
    });

    describe("annotations", () => {
        it("tokenizes a minimal annotation with one property", () => {
            expect(onlyTypes("[[key: value]]")).toEqual([
                TokenType.ANNOTATION_OPEN,
                TokenType.IDENTIFIER,
                TokenType.COLON,
                TokenType.VALUE,
                TokenType.ANNOTATION_CLOSE,
            ]);
        });

        it("extracts the key and value literals correctly", () => {
            const { tokens } = tokenize("[[color: red]]");
            expect(tokens.find((t) => t.type === TokenType.IDENTIFIER)?.literal).toBe("color");
            expect(tokens.find((t) => t.type === TokenType.VALUE)?.literal).toBe("red");
        });

        it("tokenizes two properties separated by a semicolon", () => {
            const { tokens } = tokenize("[[size: 16; weight: bold]]");
            const ids = tokens.filter((t) => t.type === TokenType.IDENTIFIER).map((t) => t.literal);
            const vals = tokens.filter((t) => t.type === TokenType.VALUE).map((t) => t.literal);
            expect(ids).toEqual(["size", "weight"]);
            expect(vals).toEqual(["16", "bold"]);
        });

        it("tokenizes three properties with trailing semicolon", () => {
            const { tokens, errors } = tokenize("[[a: 1; b: 2; c: 3]]");
            expect(errors).toHaveLength(0);
            const vals = tokens.filter((t) => t.type === TokenType.VALUE).map((t) => t.literal);
            expect(vals).toEqual(["1", "2", "3"]);
        });

        it("tokenizes directive keywords as IDENTIFIER tokens", () => {
            for (const keyword of ["SET", "DEFINE", "HIDE"]) {
                const { tokens } = tokenize(`[[${keyword}]]`);
                const id = tokens.find((t) => t.type === TokenType.IDENTIFIER);
                expect(id?.literal).toBe(keyword);
            }
        });

        it("includes the + prefix in the IDENTIFIER literal for toggle-add", () => {
            const { tokens, errors } = tokenize("[[+color: red]]");
            expect(errors).toHaveLength(0);
            const id = tokens.find((t) => t.type === TokenType.IDENTIFIER);
            expect(id?.literal).toBe("+color");
        });

        it("includes the - prefix in the IDENTIFIER literal for toggle-remove", () => {
            const { tokens, errors } = tokenize("[[-color]]");
            expect(errors).toHaveLength(0);
            const id = tokens.find((t) => t.type === TokenType.IDENTIFIER);
            expect(id?.literal).toBe("-color");
        });

        it("tokenizes an annotation followed by text on the same line", () => {
            const { tokens, errors } = tokenize("[[color: red]] Hello");
            expect(errors).toHaveLength(0);
            expect(tokens[0].type).toBe(TokenType.ANNOTATION_OPEN);
            const text = tokens.find((t) => t.type === TokenType.TEXT);
            expect(text?.literal).toContain("Hello");
        });
    });

    describe("property values", () => {
        it("unquoted value can contain spaces — stops at ] or ;", () => {
            const { tokens, errors } = tokenize("[[font: Georgia, serif]]");
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.VALUE);
            expect(value?.literal).toBe("Georgia, serif");
        });

        it("trims trailing whitespace from unquoted values", () => {
            const { tokens } = tokenize("[[font: Arial   ]]");
            const value = tokens.find((t) => t.type === TokenType.VALUE);
            expect(value?.literal).toBe("Arial");
        });

        it("double-quoted value strips the quotes and preserves internal content", () => {
            const { tokens, errors } = tokenize('[[border: "1px solid black"]]');
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.VALUE);
            expect(value?.literal).toBe("1px solid black");
        });

        it("single-quoted value works identically to double-quoted", () => {
            const { tokens, errors } = tokenize("[[border: '1px solid black']]");
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.VALUE);
            expect(value?.literal).toBe("1px solid black");
        });

        it("quoted value containing semicolons is not split", () => {
            const { tokens, errors } = tokenize('[[style: "a; b; c"]]');
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.VALUE);
            expect(value?.literal).toBe("a; b; c");
        });
    });

    describe("escape sequences", () => {
        it("\\[ does not produce ANNOTATION_OPEN — the characters appear as text", () => {
            const { tokens, errors } = tokenize("\\[\\[");
            expect(errors).toHaveLength(0);
            expect(tokens.some((t) => t.type === TokenType.ANNOTATION_OPEN)).toBe(false);
            const combined = tokens
                .filter((t) => t.type === TokenType.TEXT)
                .map((t) => t.literal)
                .join("");
            expect(combined).toBe("[[");
        });

        it("\\{ does not produce BLOCK_OPEN", () => {
            const { tokens, errors } = tokenize("\\{");
            expect(errors).toHaveLength(0);
            expect(tokens.some((t) => t.type === TokenType.BLOCK_OPEN)).toBe(false);
            expect(tokens[0].literal).toBe("{");
        });

        it("\\\\ produces a single literal backslash", () => {
            const { tokens } = tokenize("\\\\");
            expect(tokens[0].type).toBe(TokenType.TEXT);
            expect(tokens[0].literal).toBe("\\");
        });

        it("escaped structural characters inside text are treated as literals", () => {
            const { tokens, errors } = tokenize("a\\[b\\]c");
            expect(errors).toHaveLength(0);
            const combined = tokens
                .filter((t) => t.type === TokenType.TEXT)
                .map((t) => t.literal)
                .join("");
            expect(combined).toBe("a[b]c");
        });

        it("a backslash at EOF inside a quoted string does not crash", () => {
            const { errors } = tokenize('[[font: "Arial\\');
            expect(errors.some((e) => e.type === "LEXER")).toBe(true);
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
            expect(tokens.some((t) => t.type === TokenType.ANNOTATION_OPEN)).toBe(false);
            const text = tokens
                .filter((t) => t.type === TokenType.TEXT)
                .map((t) => t.literal)
                .join("");
            expect(text).toContain("[");
        });
    });

    describe("backslash edge cases", () => {
        it("a lone backslash at end of file is emitted as a literal TEXT token", () => {
            const { tokens, errors } = tokenize("\\");
            expect(errors).toHaveLength(0);
            expect(tokens[0].type).toBe(TokenType.TEXT);
            expect(tokens[0].literal).toBe("\\");
        });

        it("an escaped newline produces a literal newline in text content, not a structural NEWLINE", () => {
            const { tokens, errors } = tokenize("\\\n");
            expect(errors).toHaveLength(0);
            const text = tokens.find((t) => t.type === TokenType.TEXT);
            expect(text?.literal).toBe("\n");
            expect(tokens.some((t) => t.type === TokenType.NEWLINE)).toBe(false);
        });
    });

    describe("carriage return handling", () => {
        it("\\r in normal mode is silently dropped (Windows-style \\r\\n becomes one NEWLINE)", () => {
            const { tokens, errors } = tokenize("\r\n");
            expect(errors).toHaveLength(0);
            const types = tokens.filter((t) => t.type !== TokenType.EOF).map((t) => t.type);
            expect(types).toEqual([TokenType.NEWLINE]);
        });
    });

    describe("semicolon in ANNOTATION_KEY mode", () => {
        it("semicolon after a value-less toggle key stays in ANNOTATION_KEY mode correctly", () => {
            // [[-color]] has no value, so after reading '-color' we are still in ANNOTATION_KEY.
            // The ';' that follows exercises the case ";" branch in handleAnnotationKeyMode.
            const { tokens, errors } = tokenize("[[-color; +size: 16]]");
            expect(errors).toHaveLength(0);
            const ids = tokens.filter((t) => t.type === TokenType.IDENTIFIER).map((t) => t.literal);
            expect(ids).toContain("-color");
            expect(ids).toContain("+size");
            const semis = tokens.filter((t) => t.type === TokenType.SEMICOLON);
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

        it("a backslash escape inside a quoted value preserves the escaped character", () => {
            const { tokens, errors } = tokenize('[[font: "Ar\\"ial"]]');
            expect(errors).toHaveLength(0);
            const value = tokens.find((t) => t.type === TokenType.VALUE);
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
            const id = tokens.find((t) => t.type === TokenType.IDENTIFIER);
            expect(id?.literal).toBe("color");
        });
    });
});
