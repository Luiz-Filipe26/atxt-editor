import { TokenType, type Token } from "../types/tokens";
import { TokenStream } from "./tokenStream";
import * as AST from "../types/ast";
import type { CompilerError } from "../types/errors";
import { SymbolDetector } from "./symbolDetector";
import { SymbolParser } from "./symbolParser";
import {
    buildAnnotationNode,
    buildBlockNode,
    buildNewlineNode,
    buildPropertyNode,
    type PropEntry,
} from "./astBuilders";
import type { SourceLocation } from "../types/location";

export interface ParseResult {
    document: AST.DocumentNode;
    errors: CompilerError[];
}

type ParsedPropertyKey = {
    source: Token;
    key: string;
    toggle: AST.PropertyToggle;
};

export class Parser {
    private stream: TokenStream;
    private compilerErrors: CompilerError[] = [];
    private symbolDetector = new SymbolDetector();
    private static readonly BLOCK_BOUNDARY_TOKENS = new Set<TokenType>([
        TokenType.NEWLINE,
        TokenType.BLOCK_CLOSE,
        TokenType.EOF,
    ]);

    private constructor(tokens: Token[]) {
        this.stream = new TokenStream(tokens);
    }

    public static parse(tokens: Token[]): ParseResult {
        return new Parser(tokens).parse();
    }

    private parse(): ParseResult {
        const root: AST.DocumentNode = {
            type: AST.NodeType.DOCUMENT,
            line: 1,
            column: 1,
            children: [],
        };

        while (!this.stream.isAtEnd()) {
            root.children.push(...this.parseNextNode());
        }

        return { document: root, errors: this.compilerErrors };
    }

    private parseNextNode(): AST.BlockContentNode[] {
        const token = this.stream.advance();
        switch (token.type) {
            case TokenType.ANNOTATION_OPEN:
                return this.handleAnnotationNewline(this.parseAnnotation(token));
            case TokenType.BLOCK_OPEN:
                return this.enforceBlockSeparation([this.parseBlock(token)]);
            case TokenType.NEWLINE:
                return [buildNewlineNode(token)];
            case TokenType.TEXT:
                return this.parseTextLine(token);
            case TokenType.BLOCK_CLOSE:
                this.pushError("Unexpected block close.", token);
                return [];
            /* v8 ignore start -- @preserve */
            case TokenType.EOF:
                throw new Error("Invariant violation: parseNextNode() called at EOF.");
            default:
                throw new Error(
                    `Invariant violation: unexpected token type '${token.type}' in parseNextNode().`,
                );
            /* v8 ignore stop -- @preserve */
        }
    }

    private handleAnnotationNewline(node: AST.AnnotationNode | null): AST.BlockContentNode[] {
        if (!node) return [];
        if (!node.target) {
            this.stream.match(TokenType.NEWLINE);
            return [node];
        }
        return this.enforceBlockSeparation([node]);
    }

    private enforceBlockSeparation(nodes: AST.BlockContentNode[]): AST.BlockContentNode[] {
        const nextToken = this.stream.peek();
        if (!Parser.BLOCK_BOUNDARY_TOKENS.has(nextToken.type))
            nodes.push(buildNewlineNode(nextToken));
        return nodes;
    }

    private parseAnnotation(openingToken: Token): AST.AnnotationNode | null {
        const directive = this.consumeDirective(this.stream.peek());
        const { props, hasNormalProps } = this.parseProperties();
        this.consumeAnnotationClosure();

        if (directive === "HIDE") {
            this.resolveAnnotationTarget();
            return null;
        }

        if (directive === "SYMBOL") {
            this.handleSymbolDefinition(props);
            return null;
        }

        const target =
            directive === "NORMAL" && hasNormalProps ? this.resolveAnnotationTarget() : null;

        return buildAnnotationNode(openingToken, directive, props, target);
    }

    private handleSymbolDefinition(props: AST.PropertyNode[]): void {
        let symbol: string | undefined;
        let type: string | undefined;
        const symbolProps: PropEntry[] = [];

        for (const prop of props) {
            if (prop.key === "symbol") {
                symbol = prop.value;
                continue;
            }
            if (prop.key === "type") {
                type = prop.value;
                continue;
            }
            symbolProps.push({ name: prop.key, value: prop.value });
        }

        if (!symbol || symbolProps.length === 0) return;
        const symbolType = type === "block" ? "block" : "inline";
        this.symbolDetector.registerSymbol(symbol, symbolType, symbolProps);
    }

    private parseBlock(blockToken: Token): AST.BlockNode {
        this.stream.skipWhitespaceTokens();

        const children: AST.BlockContentNode[] = [];
        while (!this.stream.isAtEnd() && this.stream.peek().type !== TokenType.BLOCK_CLOSE) {
            children.push(...this.parseNextNode());
        }

        if (children.length > 0 && children[children.length - 1].type === AST.NodeType.NEWLINE)
            children.pop();

        if (!this.stream.match(TokenType.BLOCK_CLOSE))
            this.pushError("Unclosed block. Expected '}'.");

        return buildBlockNode(blockToken, children);
    }

    private parseTextLine(startToken: Token): AST.BlockContentNode[] {
        /*! v8 ignore start -- @preserve */
        if (this.stream.peek().type === TokenType.TEXT)
            throw new Error(
                `Invariant violation: adjacent TEXT tokens at ${this.stream.peek().line}:${this.stream.peek().column}.`,
            );
        /*! v8 ignore stop -- @preserve */
        const nodes = SymbolParser.expandLine(startToken, this.symbolDetector);
        const newlineToken = this.stream.match(TokenType.NEWLINE);
        if (newlineToken) nodes.push(buildNewlineNode(newlineToken));

        return nodes;
    }

    private resolveAnnotationTarget(): AST.BlockNode | null {
        this.stream.skipWhitespaceTokens();
        if (this.stream.isAtEnd()) return null;
        return this.stream.peek().type === TokenType.BLOCK_OPEN
            ? this.parseBlock(this.stream.advance())
            : this.consumeTargetLine(this.stream.peek());
    }

    private consumeTargetLine(startToken: Token): AST.BlockNode | null {
        const children: AST.BlockContentNode[] = [];

        while (this.stream.match(TokenType.ANNOTATION_OPEN, TokenType.TEXT)) {
            const token = this.stream.previous();
            if (token.type === TokenType.ANNOTATION_OPEN) {
                const node = this.parseAnnotation(token);
                if (node) children.push(node);
                continue;
            }
            children.push(...SymbolParser.expandInlineAt(token, this.symbolDetector));
        }

        return children.length > 0 ? buildBlockNode(startToken, children) : null;
    }

    private consumeDirective(token: Token): AST.AnnotationDirective {
        return token.type === TokenType.IDENTIFIER &&
            (AST.DIRECTIVE_KEYWORDS as readonly string[]).includes(token.literal)
            ? (this.stream.advance().literal as AST.AnnotationDirective)
            : "NORMAL";
    }

    private parseProperties(): { props: AST.PropertyNode[]; hasNormalProps: boolean } {
        const props: AST.PropertyNode[] = [];
        let hasNormalProps = false;

        while (!this.stream.isAtEnd() && this.stream.peek().type !== TokenType.ANNOTATION_CLOSE) {
            if (this.stream.match(TokenType.SEMICOLON)) continue;
            const parsedKey = this.parsePropertyKey();
            if (!parsedKey) continue;

            const value = this.parsePropertyValue(parsedKey);
            if (value === null) continue;

            if (!parsedKey.toggle) hasNormalProps = true;

            props.push(buildPropertyNode({ ...parsedKey, value }));
            this.requirePropertySeparator(parsedKey.source.literal);
        }
        return { props, hasNormalProps };
    }

    private parsePropertyKey(): ParsedPropertyKey | null {
        if (this.stream.peek().type !== TokenType.IDENTIFIER) {
            this.pushError(`Expected property name, found '${this.stream.peek().literal}'.`);
            this.synchronizeToNextProperty();
            return null;
        }
        const token = this.stream.advance();
        const rawKey = token.literal;
        const toggle: AST.PropertyToggle =
            rawKey[0] === "+" ? "plus" : rawKey[0] === "-" ? "minus" : undefined;
        const key = toggle !== undefined ? rawKey.substring(1) : rawKey;

        return { source: token, key, toggle };
    }

    private parsePropertyValue(parsedKey: ParsedPropertyKey): string | null {
        const { toggle, key } = parsedKey;
        if (toggle === "minus") return "";
        if (!this.consumeColon(key)) return null;

        if (!this.stream.match(TokenType.VALUE, TokenType.IDENTIFIER)) {
            this.pushError(`Expected value for '${key}', found '${this.stream.peek().literal}'.`);
            this.synchronizeToNextProperty();
            return null;
        }
        return this.stream.previous().literal;
    }

    private consumeColon(propertyName: string): boolean {
        if (this.stream.peek().type !== TokenType.COLON) {
            this.pushError(
                `Expected ':' after property '${propertyName}', found '${this.stream.peek().literal}'.`,
            );
            this.synchronizeToNextProperty();
            return false;
        }
        this.stream.advance();
        return true;
    }

    private consumeAnnotationClosure(): void {
        if (!this.stream.match(TokenType.ANNOTATION_CLOSE)) {
            this.pushError("Annotation was not closed with ']]'.");
        }
    }

    private requirePropertySeparator(propertyName: string): void {
        const afterValue = this.stream.peek().type;
        if (afterValue === TokenType.SEMICOLON) {
            this.stream.advance();
        } else if (afterValue !== TokenType.ANNOTATION_CLOSE) {
            this.pushError(`Expected ';' after property value '${propertyName}'.`);
            this.synchronizeToNextProperty();
        }
    }

    private synchronizeToNextProperty() {
        while (!this.stream.isAtEnd()) {
            if (this.stream.match(TokenType.SEMICOLON)) return;
            if (this.stream.peek().type === TokenType.ANNOTATION_CLOSE) return;
            this.stream.advance();
        }
    }

    private pushError(message: string, sourceLocation?: SourceLocation) {
        const currentLocation = sourceLocation ?? this.stream.peek();
        this.compilerErrors.push({
            type: "PARSER",
            message,
            line: currentLocation.line,
            column: currentLocation.column,
        });
    }
}
