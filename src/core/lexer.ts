import type { CompilerError } from "../types/errors";
import { Scanner } from "./scanner";

export const TokenType = {
    TEXT: "TEXT",
    NEWLINE: "NEWLINE",
    ANNOTATION_OPEN: "ANNOTATION_OPEN",
    ANNOTATION_CLOSE: "ANNOTATION_CLOSE",
    BLOCK_OPEN: "BLOCK_OPEN",
    BLOCK_CLOSE: "BLOCK_CLOSE",
    IDENTIFIER: "IDENTIFIER",
    COLON: "COLON",
    SEMICOLON: "SEMICOLON",
    VALUE: "VALUE",
    EOF: "EOF",
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export const LexerMode = {
    NORMAL: "NORMAL",
    ANNOTATION_KEY: "ANNOTATION_KEY",
    ANNOTATION_VALUE: "ANNOTATION_VALUE",
} as const;

export type LexerMode = (typeof LexerMode)[keyof typeof LexerMode];

export interface Token {
    type: TokenType;
    literal: string;
    line: number;
    column: number;
}

export class Lexer {
    private scanner: Scanner;
    private tokens: Token[] = [];
    private compilerErrors: CompilerError[] = [];
    private modeStack: LexerMode[] = [LexerMode.NORMAL];

    constructor(source: string) {
        this.scanner = new Scanner(source);
    }

    tokenize(): { tokens: Token[]; errors: CompilerError[] } {
        while (!this.scanner.isAtEnd()) {
            this.scanner.mark();
            this.scanToken();
        }

        this.scanner.mark();
        this.addToken(TokenType.EOF, "");

        return { tokens: this.tokens, errors: this.compilerErrors };
    }

    private get currentMode(): LexerMode {
        return this.modeStack[this.modeStack.length - 1];
    }

    private isAtLineStart(): boolean {
        if (this.tokens.length === 0) return true;
        return this.tokens[this.tokens.length - 1].type === TokenType.NEWLINE;
    }

    private pushError(message: string, line?: number, column?: number) {
        this.compilerErrors.push({
            type: "LEXER",
            message,
            line: line ?? this.scanner.markLine,
            column: column ?? this.scanner.markColumn,
        });
    }

    private pushMode(mode: LexerMode) {
        this.modeStack.push(mode);
    }

    private popMode() {
        if (this.modeStack.length > 1) {
            this.modeStack.pop();
        } else {
            this.pushError(
                "Erro fatal: Tentativa de dar pop() no modo base (NORMAL).",
            );
        }
    }

    private replaceCurrentMode(mode: LexerMode) {
        this.modeStack[this.modeStack.length - 1] = mode;
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
                    this.pushError(`Caracter inválido no nome da propriedade: '${char}'`);
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
                if (this.isValueChar(char)) {
                    this.consumePropertyValue();
                } else {
                    this.pushError(
                        `Caracter inválido no valor da propriedade: '${char}'`,
                    );
                }
                break;
        }
    }

    private consumeUntil(stopCondition: (char: string) => boolean): string {
        let content = "";

        while (!this.scanner.isAtEnd()) {
            const nextChar = this.scanner.peek();

            if (nextChar === "\\") {
                this.scanner.advance();
                if (!this.scanner.isAtEnd()) {
                    content += this.scanner.advance();
                }
                continue;
            }

            if (stopCondition(nextChar)) {
                break;
            }

            content += this.scanner.advance();
        }

        return content;
    }

    private consumeString(quoteChar: string) {
        const startColumn = this.scanner.column - 1;
        let value = "";

        while (!this.scanner.isAtEnd() && this.scanner.peek() !== quoteChar) {
            if (this.scanner.peek() === "\n") {
                this.pushError(
                    "Quebra de linha não permitida dentro de valores entre aspas.",
                    this.scanner.line,
                    this.scanner.column,
                );
                break;
            }

            if (this.scanner.peek() === "\\") {
                this.scanner.advance();
                if (!this.scanner.isAtEnd()) {
                    value += this.scanner.advance();
                }
                continue;
            }

            value += this.scanner.advance();
        }

        if (this.scanner.isAtEnd() || this.scanner.peek() !== quoteChar) {
            this.pushError(
                `String não finalizada. Faltou fechar com '${quoteChar}'.`,
                this.scanner.line,
                startColumn,
            );
        } else {
            this.scanner.advance();
        }

        this.addToken(TokenType.VALUE, value);
    }

    private consumeText(firstChar: string) {
        if (firstChar === "\n") {
            this.addToken(TokenType.NEWLINE, "\n");
            return;
        }

        let content = firstChar;
        content += this.consumeUntil(
            (char) => this.isTrigger(char) || char === "\n",
        );
        this.addToken(TokenType.TEXT, content);
    }

    private consumePropertyKey() {
        while (this.isKeyChar(this.scanner.peek())) {
            this.scanner.advance();
        }

        const value = this.scanner.getMarkedSubstring();
        this.addToken(TokenType.IDENTIFIER, value);
    }

    private consumePropertyValue() {
        while (this.isValueChar(this.scanner.peek())) {
            this.scanner.advance();
        }

        const value = this.scanner.getMarkedSubstring();
        this.addToken(TokenType.VALUE, value);
    }

    private isTrigger(char: string): boolean {
        return char === "[" || char === "{" || char === "}";
    }

    private isKeyChar(char: string): boolean {
        return /[a-zA-Z0-9_\-]/.test(char);
    }

    private isValueChar(char: string): boolean {
        return /[a-zA-Z0-9_\-#.,]/.test(char);
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
