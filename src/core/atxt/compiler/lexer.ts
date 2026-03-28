import { TokenType, type Token } from "../types/tokens";
import type { CompilerError } from "../types/errors";
import { Scanner } from "./scanner";

const LexerMode = {
    NORMAL: "NORMAL",
    ANNOTATION_KEY: "ANNOTATION_KEY",
    ANNOTATION_VALUE: "ANNOTATION_VALUE",
} as const;

type LexerMode = (typeof LexerMode)[keyof typeof LexerMode];

export class Lexer {
    private scanner!: Scanner;
    private tokens: Token[] = [];
    private compilerErrors: CompilerError[] = [];
    private modeStack: LexerMode[] = [LexerMode.NORMAL];
    private static readonly PROP_VALUE_STOP_CHARS = new Set(["]", ";", "\n", '"', "'"]);

    /**
     * Sentinel character (U+E000, Unicode Private Use Area) injected by the
     * Lexer before any escaped character in TEXT tokens. The TextExpander
     * consumes this sentinel and treats the following character as an
     * unconditional literal — never as a symbol delimiter.
     *
     * Any occurrence of this character in the source file is stripped before
     * tokenization begins, so it is exclusively an internal protocol marker.
     */
    static readonly ESCAPE_SENTINEL = "\uE000";

    private static readonly KEY_CHAR_REGEX = /[a-zA-Z0-9_-]/;
    private static readonly SANITIZE_PATTERN = new RegExp(`[${Lexer.ESCAPE_SENTINEL}\\r]`, "g");

    private static readonly PURE_TEXT_DELIMITERS = ["[[", "]]", "{", "}", "\n"];

    private static readonly PURE_TEXT_DELIMITER_STARTS = new Set(
        this.PURE_TEXT_DELIMITERS.map((d) => d[0]),
    );

    tokenize(source: string): { tokens: Token[]; errors: CompilerError[] } {
        this.scanner = new Scanner(this.sanitizeSource(source));
        this.tokens = [];
        this.compilerErrors = [];
        this.modeStack = [LexerMode.NORMAL];

        while (!this.scanner.isAtEnd()) {
            this.scanner.mark();
            this.scanToken();
        }

        this.scanner.mark();
        this.addToken(TokenType.EOF, "");

        return { tokens: this.tokens, errors: this.compilerErrors };
    }

    private sanitizeSource(source: string): string {
        return source.replaceAll(Lexer.SANITIZE_PATTERN, "");
    }

    private scanToken() {
        const char = this.scanner.advance();

        switch (this.getCurrentMode()) {
            case LexerMode.NORMAL:
                this.handleNormalMode(char);
                break;
            case LexerMode.ANNOTATION_KEY:
                this.handleAnnotationKeyMode(char);
                break;
            case LexerMode.ANNOTATION_VALUE:
                this.handleAnnotationValueMode(char);
                break;
        }
    }

    private handleNormalMode(char: string) {
        switch (char) {
            case " ":
            case "\t":
                if (this.isAtLineStart()) break;
                this.consumeText(char);
                break;
            case "\n":
                this.addToken(TokenType.NEWLINE);
                break;
            case "{":
                this.addToken(TokenType.BLOCK_OPEN);
                break;
            case "}":
                this.addToken(TokenType.BLOCK_CLOSE);
                break;
            case "[":
                /* v8 ignore start -- @preserve */
                if (!this.scanner.match("[")) {
                    throw new Error("Invariant violation: case '[' reached with a lone bracket.");
                }
                /* v8 ignore stop -- @preserve */
                this.addToken(TokenType.ANNOTATION_OPEN, "[[");
                this.pushMode(LexerMode.ANNOTATION_KEY);
                break;
            case "\\":
                if (!this.scanner.isAtEnd()) {
                    const escapedChar = this.scanner.advance();
                    this.consumeText(Lexer.ESCAPE_SENTINEL + escapedChar);
                }
                break;
            default:
                this.consumeText(char);
                break;
        }
    }

    private handleAnnotationKeyMode(char: string) {
        switch (char) {
            case ":":
                this.addToken(TokenType.COLON);
                this.replaceCurrentMode(LexerMode.ANNOTATION_VALUE);
                break;
            case ";":
                this.addToken(TokenType.SEMICOLON);
                break;
            case "]":
                this.tryCloseAnnotation();
                break;
            case " ":
            case "\t":
            case "\n":
                break;
            default:
                if (char === "+" || char === "-" || this.isKeyChar(char)) {
                    this.consumePropertyKey();
                } else {
                    this.pushErrorAtMark(`Invalid character in property name: '${char}'`);
                }
                break;
        }
    }

    private handleAnnotationValueMode(char: string) {
        switch (char) {
            case ";":
                this.addToken(TokenType.SEMICOLON);
                this.replaceCurrentMode(LexerMode.ANNOTATION_KEY);
                break;
            case "]":
                this.tryCloseAnnotation();
                break;
            case '"':
            case "'":
                this.consumeString(char);
                break;
            case " ":
            case "\t":
            case "\n":
                break;
            default:
                this.consumePropertyValue();
                break;
        }
    }

    private tryCloseAnnotation(): void {
        if (this.scanner.match("]")) {
            this.addToken(TokenType.ANNOTATION_CLOSE, "]]");
            this.popMode();
        } else {
            this.pushErrorAtMark("Expected ']' to close annotation.");
        }
    }

    private consumeText(firstChar: string) {
        let content = firstChar;
        content += this.consumeUntil(this.isPureTextDelimiter);
        this.addToken(TokenType.TEXT, content);
    }

    private consumeString(quoteChar: string) {
        this.scanner.mark();
        let value = "";

        while (!this.scanner.isAtEnd() && this.scanner.peek() !== quoteChar) {
            if (this.scanner.peek() === "\n") {
                this.pushErrorAtCurrent("Line break not allowed inside quoted values.");
                break;
            }
            if (this.scanner.peek() === "\\") {
                value += this.consumeEscapedCharRaw();
                continue;
            }
            value += this.scanner.advance();
        }

        if (this.scanner.isAtEnd() || this.scanner.peek() !== quoteChar) {
            this.pushErrorAtMark(`Unterminated string. Missing closing '${quoteChar}'.`);
            return;
        }

        this.scanner.advance();
        this.addToken(TokenType.VALUE, value);
    }

    private consumeUntil(stopCondition: (char: string) => boolean): string {
        let content = "";

        while (!this.scanner.isAtEnd()) {
            const nextChar = this.scanner.peek();
            if (nextChar === "\\") {
                content += this.consumeEscapedChar();
                continue;
            }
            if (stopCondition(nextChar)) break;
            content += this.scanner.advance();
        }

        return content;
    }

    private consumePropertyKey() {
        while (this.isKeyChar(this.scanner.peek())) {
            this.scanner.advance();
        }

        const value = this.scanner.getMarkedSubstring();
        this.addToken(TokenType.IDENTIFIER, value);
    }

    private consumePropertyValue() {
        while (!this.scanner.isAtEnd() && this.isPropValueChar(this.scanner.peek())) {
            this.scanner.advance();
        }

        const value = this.scanner.getMarkedSubstring().trimEnd();
        this.addToken(TokenType.VALUE, value);
    }

    // Used in TEXT tokens — emits SENTINEL + char so TextExpander can treat it as literal.
    private consumeEscapedChar(): string {
        this.scanner.advance();
        if (!this.scanner.isAtEnd()) return Lexer.ESCAPE_SENTINEL + this.scanner.advance();
        return "";
    }

    // Used in quoted annotation values — emits the raw char with no sentinel (values bypass TextExpander).
    private consumeEscapedCharRaw(): string {
        this.scanner.advance();
        if (!this.scanner.isAtEnd()) return this.scanner.advance();
        return "";
    }

    private isAtLineStart(): boolean {
        if (this.tokens.length === 0) return true;
        return this.tokens[this.tokens.length - 1].type === TokenType.NEWLINE;
    }

    private isPureTextDelimiter = (char: string): boolean => {
        if (!Lexer.PURE_TEXT_DELIMITER_STARTS.has(char)) return false;
        return Lexer.PURE_TEXT_DELIMITERS.some((d) => this.scanner.check(d));
    };

    private isKeyChar(char: string): boolean {
        return Lexer.KEY_CHAR_REGEX.test(char);
    }

    private isPropValueChar(char: string): boolean {
        return !Lexer.PROP_VALUE_STOP_CHARS.has(char);
    }

    private getCurrentMode(): LexerMode {
        return this.modeStack[this.modeStack.length - 1];
    }

    private pushMode(mode: LexerMode) {
        this.modeStack.push(mode);
    }

    private popMode() {
        /* v8 ignore next -- @preserve */
        if (this.modeStack.length <= 1)
            throw new Error("Invariant violation: popMode() called on base mode.");
        this.modeStack.pop();
    }

    private replaceCurrentMode(mode: LexerMode) {
        this.modeStack[this.modeStack.length - 1] = mode;
    }

    private pushErrorAtMark(message: string) {
        this.compilerErrors.push({
            type: "LEXER",
            message,
            line: this.scanner.markLine,
            column: this.scanner.markColumn,
        });
    }

    private pushErrorAtCurrent(message: string) {
        this.compilerErrors.push({
            type: "LEXER",
            message,
            line: this.scanner.line,
            column: this.scanner.column,
        });
    }

    private addToken(type: TokenType, literal?: string) {
        this.tokens.push({
            type,
            literal: literal ?? this.scanner.getMarkedSubstring(),
            line: this.scanner.markLine,
            column: this.scanner.markColumn,
        });
    }
}
