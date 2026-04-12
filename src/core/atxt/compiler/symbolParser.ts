import type { Token } from "../types/tokens";
import * as AST from "../types/ast";
import { Lexer } from "./lexer";
import { SymbolDetector, type InlineSymbolMatch } from "./symbolDetector";
import {
    buildAnnotationNode,
    buildBlockNode,
    buildPropertyNodesFromPairs,
    buildToggleCloseNode,
    buildToggleOpenNode,
} from "./astBuilders";
import type { SourceLocation } from "../types/location";

export interface Source {
    text: string;
    line: number;
    startCol: number;
}

/**
 * Expands text tokens into AST nodes.
 * * @remarks
 * Assumes the Lexer has already handled structural escapes via ESCAPE_SENTINEL.
 */
export class SymbolParser {
    private source = { text: "", line: 0, startCol: 0 };
    private buffer = { content: "", docCol: 0 };
    private readonly symbolDetector: SymbolDetector;

    private constructor(symbolDetector: SymbolDetector) {
        this.symbolDetector = symbolDetector;
    }

    public static expandLine(token: Token, detector: SymbolDetector): AST.BlockContentNode[] {
        return new SymbolParser(detector).expandLine(token);
    }

    public static expandInlineAt(token: Token, detector: SymbolDetector): AST.BlockContentNode[] {
        return new SymbolParser(detector).expandInlineAt(token);
    }

    private expandLine(token: Token): AST.BlockContentNode[] {
        const blockSymbol = this.symbolDetector.detectBlockSymbol(token.literal);
        if (!blockSymbol) {
            return this.expandInline({
                text: token.literal,
                line: token.line,
                startCol: token.column,
            });
        }

        const restCol = token.column + blockSymbol.symbolLength;
        const target = buildBlockNode(
            { line: token.line, column: restCol },
            this.expandInline({
                text: token.literal.slice(blockSymbol.symbolLength),
                line: token.line,
                startCol: restCol,
            }),
        );
        return [
            buildAnnotationNode(
                token,
                "NORMAL",
                buildPropertyNodesFromPairs(token, blockSymbol.props),
                target,
            ),
        ];
    }

    private expandInlineAt(token: Token) {
        return this.expandInline({
            text: token.literal,
            line: token.line,
            startCol: token.column,
        });
    }

    private expandInline(source: Source): AST.BlockContentNode[] {
        this.source = source;
        this.buffer = { content: "", docCol: this.source.startCol };
        const result: AST.BlockContentNode[] = [];

        let currentTextPos = 0;
        while (currentTextPos < this.source.text.length) {
            const escapedPos = this.tryConsumeEscapeAndGetPos(currentTextPos);
            if (escapedPos !== null) {
                currentTextPos = escapedPos;
                continue;
            }
            const expanded = this.tryExpandSymbol(currentTextPos);
            if (expanded !== null) {
                result.push(...expanded.nodes);
                currentTextPos = expanded.advancedTo;
                continue;
            }
            currentTextPos = this.appendCharToBufferAndGetPos(currentTextPos);
        }

        const finalNode = this.flushBufferToTextNode();
        if (finalNode) result.push(finalNode);
        return result;
    }

    private tryConsumeEscapeAndGetPos(pos: number): number | null {
        if (this.source.text[pos] !== Lexer.ESCAPE_SENTINEL) return null;
        pos++;
        return pos < this.source.text.length ? this.appendCharToBufferAndGetPos(pos) : pos;
    }

    private appendCharToBufferAndGetPos(currentTextPos: number): number {
        if (!this.buffer.content) this.buffer.docCol = this.source.startCol + currentTextPos;
        this.buffer.content += this.source.text[currentTextPos];
        return currentTextPos + 1;
    }

    private tryExpandSymbol(
        currentTextPos: number,
    ): { nodes: AST.BlockContentNode[]; advancedTo: number } | null {
        const locations = this.matchLocations(currentTextPos);
        if (!locations) return null;
        const { match } = locations;

        const insideNodes = new SymbolParser(this.symbolDetector).expandInline({
            text: this.source.text.slice(currentTextPos + match.symbolLength, match.closingPos),
            line: this.source.line,
            startCol: locations.innnerStart.column,
        });

        const flushedNode = this.flushBufferToTextNode();
        let nodes = flushedNode ? [flushedNode] : [];
        nodes.push(
            buildToggleOpenNode(locations.openSymbol, match.props),
            ...insideNodes,
            buildToggleCloseNode(locations.closeSymbol, match.props),
        );

        return { nodes, advancedTo: match.closingPos + match.closing.length };
    }

    private matchLocations(currentTextPos: number): {
        openSymbol: SourceLocation;
        closeSymbol: SourceLocation;
        innnerStart: SourceLocation;
        match: InlineSymbolMatch;
    } | null {
        const match = this.symbolDetector.detectAt(this.source.text, currentTextPos);
        if (!match) return null;
        const open = { line: this.source.line, column: this.source.startCol + currentTextPos };
        const close = { line: this.source.line, column: this.source.startCol + match.closingPos };
        const matchPos = { line: this.source.line, column: open.column + match.symbolLength };
        return { openSymbol: open, closeSymbol: close, innnerStart: matchPos, match };
    }

    private flushBufferToTextNode(): AST.BlockContentNode | null {
        if (!this.buffer.content) return null;
        const node = {
            type: AST.NodeType.Text,
            line: this.source.line,
            column: this.buffer.docCol,
            content: this.buffer.content,
        };
        this.buffer.content = "";
        return node;
    }
}
