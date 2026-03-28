import type { Token } from "@/types/tokens";
import * as AST from "../types/ast";
import { Lexer } from "./lexer";
import { SymbolDetector } from "./symbolDetector";

/**
 * Expands inline symbols within a pre-lexed TEXT token into AST nodes.
 *
 * Assumes the Lexer has already resolved structural escapes. Characters
 * explicitly escaped by the author arrive prefixed with ESCAPE_SENTINEL.
 * This class consumes those sentinels and emits the following
 * character as unconditional literal text, never as a symbol delimiter.
 */
export class TextExpander {
    private symbolDetector: SymbolDetector;

    private text = "";
    private line = 0;
    private startCol = 0;
    private pos = 0;
    private buffer = "";
    private bufferStartCol = 0;
    private result: AST.BlockContentNode[] = [];

    constructor(symbolDetector: SymbolDetector) {
        this.symbolDetector = symbolDetector;
    }

    expandSymbolsOnTextAt(token: Token) {
        return this.expandSymbolsOnText(token.literal, token.line, token.column);
    }

    expandSymbolsOnText(text: string, line: number, startCol: number): AST.BlockContentNode[] {
        this.text = text;
        this.line = line;
        this.startCol = startCol;
        this.pos = 0;
        this.buffer = "";
        this.bufferStartCol = startCol;
        this.result = [];

        while (this.pos < this.text.length) {
            if (this.text[this.pos] === Lexer.ESCAPE_SENTINEL) {
                this.consumeEscapedChar();
                continue;
            }
            if (this.tryExpandSymbol()) continue;
            this.accumulateChar();
        }

        this.flushBuffer();
        return this.result;
    }

    private consumeEscapedChar(): void {
        this.pos++; // skip sentinel
        if (this.pos < this.text.length) {
            if (!this.buffer) this.bufferStartCol = this.startCol + this.pos;
            this.buffer += this.text[this.pos];
            this.pos++;
        }
    }

    private tryExpandSymbol(): boolean {
        const match = this.symbolDetector.detectAt(this.text, this.pos);
        if (!match) return false;

        this.flushBuffer();

        const openColumn = this.startCol + this.pos;
        const closeColumn = this.startCol + match.closePos;
        const innerText = this.text.slice(this.pos + match.openLength, match.closePos);
        const innerCol = this.startCol + this.pos + match.openLength;

        this.result.push(this.buildToggle(match.props, "plus", openColumn));
        this.result.push(
            ...new TextExpander(this.symbolDetector).expandSymbolsOnText(
                innerText,
                this.line,
                innerCol,
            ),
        );
        this.result.push(this.buildToggle(match.props, "minus", closeColumn));

        this.pos = match.closePos + match.closing.length;
        return true;
    }

    private accumulateChar(): void {
        if (!this.buffer) this.bufferStartCol = this.startCol + this.pos;
        this.buffer += this.text[this.pos];
        this.pos++;
    }

    private flushBuffer(): void {
        if (!this.buffer) return;
        this.result.push({
            type: AST.NodeType.TEXT,
            line: this.line,
            column: this.bufferStartCol,
            content: this.buffer,
        });
        this.buffer = "";
    }

    private buildToggle(
        props: Record<string, string>,
        toggle: "plus" | "minus",
        column: number,
    ): AST.AnnotationNode {
        return {
            type: AST.NodeType.ANNOTATION,
            line: this.line,
            column,
            directive: "NORMAL",
            properties: Object.entries(props).map(([key, value]) => ({
                type: AST.NodeType.PROPERTY,
                line: this.line,
                column,
                key,
                value: toggle === "minus" ? "" : value,
                toggle,
            })),
            target: null,
        };
    }
}
