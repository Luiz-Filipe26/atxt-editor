import { TokenType, type Token } from "@/types/tokens";
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
    private readonly VALUE_STOP_CHARS = new Set(["]", ";", "\n", "\r", '"', "'"]);
    private readonly TRIGGER_CHARS = new Set(["[", "{", "}"]);
    private static readonly KEY_CHAR_REGEX = /[a-zA-Z0-9_-]/;
    private static readonly LEXER_ESCAPE_CHARS = new Set(["[", "]", "{", "}", "\\", '"', "'"]);

    tokenize(source: string): { tokens: Token[]; errors: CompilerError[] } {
        this.scanner = new Scanner(source);
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

    private scanToken() {
        const char = this.scanner.advance();

        switch (this.currentMode) {
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
                if (this.isAtLineStart()) {
                    break;
                }
                this.consumeText(char);
                break;
            case "\n":
                this.addToken(TokenType.NEWLINE, "\n");
                break;
            case "{":
                this.addToken(TokenType.BLOCK_OPEN);
                break;
            case "}":
                this.addToken(TokenType.BLOCK_CLOSE);
                break;
            case "[":
                if (this.scanner.match("[")) {
                    this.addToken(TokenType.ANNOTATION_OPEN, "[[");
                    this.pushMode(LexerMode.ANNOTATION_KEY);
                } else {
                    this.consumeText(char);
                }
                break;
            case "\\":
                if (!this.scanner.isAtEnd()) {
                    const escapedChar = this.scanner.advance();
                    this.consumeText(escapedChar);
                } else {
                    this.consumeText("\\");
                }
                break;
            case "\r":
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
                if (this.scanner.match("]")) {
                    this.addToken(TokenType.ANNOTATION_CLOSE, "]]");
                    this.popMode();
                } else {
                    this.pushError("Expected ']' to close annotation.");
                }
                break;
            case " ":
            case "\r":
            case "\t":
            case "\n":
                break;
            default:
                if (char === "+" || char === "-" || this.isKeyChar(char)) {
                    this.consumePropertyKey();
                } else {
                    this.pushError(`Invalid character in property name: '${char}'`);
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
                if (this.scanner.match("]")) {
                    this.addToken(TokenType.ANNOTATION_CLOSE, "]]");
                    this.popMode();
                } else {
                    this.pushError("Expected ']' to close annotation.");
                }
                break;
            case '"':
            case "'":
                this.consumeString(char);
                break;
            case " ":
            case "\r":
            case "\t":
            case "\n":
                break;
            default:
                this.consumePropertyValue();
                break;
        }
    }

    private consumeText(firstChar: string) {
        let content = firstChar;
        content += this.consumeUntil((char) => this.isTrigger(char) || char === "\n");
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
                value += this.consumeEscapedChar();
                continue;
            }
            value += this.scanner.advance();
        }

        if (this.scanner.isAtEnd() || this.scanner.peek() !== quoteChar) {
            this.pushError(`Unterminated string. Missing closing '${quoteChar}'.`);
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
                const following = this.scanner.peekNext();
                if (Lexer.LEXER_ESCAPE_CHARS.has(following)) {
                    content += this.consumeEscapedChar();
                } else {
                    content += this.scanner.advance();
                }
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
        while (!this.scanner.isAtEnd() && this.isValueChar(this.scanner.peek())) {
            this.scanner.advance();
        }

        const value = this.scanner.getMarkedSubstring().trimEnd();
        this.addToken(TokenType.VALUE, value);
    }

    private consumeEscapedChar(): string {
        this.scanner.advance();
        if (!this.scanner.isAtEnd()) {
            return this.scanner.advance();
        }
        return "";
    }

    private isAtLineStart(): boolean {
        if (this.tokens.length === 0) return true;
        return this.tokens[this.tokens.length - 1].type === TokenType.NEWLINE;
    }

    private isTrigger(char: string): boolean {
        return this.TRIGGER_CHARS.has(char);
    }

    private isKeyChar(char: string): boolean {
        return Lexer.KEY_CHAR_REGEX.test(char);
    }

    private isValueChar(char: string): boolean {
        return !this.VALUE_STOP_CHARS.has(char);
    }

    private get currentMode(): LexerMode {
        return this.modeStack[this.modeStack.length - 1];
    }

    private pushMode(mode: LexerMode) {
        this.modeStack.push(mode);
    }

    private popMode() {
        /* v8 ignore next 1 -- @preserve */
        if (this.modeStack.length <= 1)
            throw new Error("Invariant violation: popMode() called on base mode.");
        this.modeStack.pop();
    }

    private replaceCurrentMode(mode: LexerMode) {
        this.modeStack[this.modeStack.length - 1] = mode;
    }

    private pushError(message: string, line?: number, column?: number) {
        this.compilerErrors.push({
            type: "LEXER",
            message,
            line: line ?? this.scanner.markLine,
            column: column ?? this.scanner.markColumn,
        });
    }

    private pushErrorAtCurrent(message: string) {
        this.pushError(message, this.scanner.line, this.scanner.column);
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
