import { TokenType, type Token } from "../types/tokens";
import { TokenStream } from "./tokenStream";
import * as AST from "../types/ast";
import { CompilerErrorType, type CompilerError } from "../types/errors";
import { SymbolDetector, SymbolRegistrationResult } from "./symbolDetector";
import { SymbolParser } from "./symbolParser";
import {
    buildAnnotationNode,
    buildBlockNode,
    buildNewlineNode,
    buildPropertyNode,
} from "./astBuilders";
import type { SourceLocation } from "../types/location";
import { PropKey } from "../domain/annotationProperties.ts";
import { SymbolEntryType } from "../types/symbols.ts";

export interface ParsingResult {
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
    private isInsidePreamble = true;
    private static readonly BLOCK_BOUNDARY_TOKENS = new Set<TokenType>([
        TokenType.Newline,
        TokenType.BlockClose,
        TokenType.Eof,
    ]);

    private constructor(tokens: Token[]) {
        this.stream = new TokenStream(tokens);
    }

    public static parse(tokens: Token[]): ParsingResult {
        return new Parser(tokens).parse();
    }

    private parse(): ParsingResult {
        const root: AST.DocumentNode = {
            type: AST.NodeType.Document,
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
            case TokenType.AnnotationOpen:
                return this.handleAnnotationNewline(this.parseAnnotation(token));
            case TokenType.BlockOpen:
                return [this.parseBlock(token)];
            case TokenType.Newline:
                return [buildNewlineNode(token)];
            case TokenType.Text:
                return this.parseTextLine(token);
            case TokenType.BlockClose:
                this.pushError("Unexpected block close.", token);
                return [];
            /* v8 ignore start -- @preserve */
            case TokenType.Eof:
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
            this.stream.match(TokenType.Newline);
            return [node];
        }
        return this.enforceBlockSeparation(node);
    }

    private enforceBlockSeparation(node: AST.BlockContentNode): AST.BlockContentNode[] {
        const nextToken = this.stream.peek();
        if (!Parser.BLOCK_BOUNDARY_TOKENS.has(nextToken.type))
            return [node, buildNewlineNode(nextToken)];
        return [node];
    }

    private parseAnnotation(openingToken: Token): AST.AnnotationNode | null {
        const directive = this.consumeDirective(this.stream.peek());
        const { props, hasNormalProps } = this.parseProperties();
        this.consumeAnnotationClosure();

        if (directive === AST.AnnotationDirective.Hide) {
            this.resolveAnnotationTarget();
            return null;
        }

        if (directive === AST.AnnotationDirective.Symbol) {
            this.handleSymbolDefinition(props);
            return null;
        }

        const target =
            directive === AST.AnnotationDirective.Normal && hasNormalProps
                ? this.resolveAnnotationTarget()
                : null;

        return buildAnnotationNode(openingToken, directive, props, target);
    }

    private handleSymbolDefinition(props: AST.PropertyNode[]): void {
        let symbolProp: AST.PropertyNode | undefined;
        let type: string | undefined;
        const symbolProps: AST.PropEntry[] = [];

        for (const prop of props) {
            if (prop.key === PropKey.Symbol) {
                symbolProp = prop;
                continue;
            }
            if (prop.key === PropKey.Type) {
                type = prop.value;
                continue;
            }
            symbolProps.push({ key: prop.key, value: prop.value });
        }

        if (!symbolProp || symbolProps.length === 0) return;
        const symbolType =
            type === SymbolEntryType.Block ? SymbolEntryType.Block : SymbolEntryType.Inline;
        const result = this.symbolDetector.registerSymbol({
            sequence: symbolProp.value,
            type: symbolType,
            props: symbolProps,
            isInsidePreamble: this.isInsidePreamble,
        });
        if (result !== SymbolRegistrationResult.Ok)
            this.reportSymbolRegistrationError(result, symbolProp);
    }

    private reportSymbolRegistrationError(
        result: Exclude<SymbolRegistrationResult, typeof SymbolRegistrationResult.Ok>,
        symbolProp: AST.PropertyNode,
    ): void {
        const messages: Record<
            Exclude<SymbolRegistrationResult, typeof SymbolRegistrationResult.Ok>,
            string
        > = {
            [SymbolRegistrationResult.Duplicate]: `Symbol '${symbolProp.value}' is already registered.`,
            [SymbolRegistrationResult.ClosingConflict]: `The closing sequence of '${symbolProp.value}' conflicts with an existing symbol.`,
            [SymbolRegistrationResult.InvalidSequence]: `'${symbolProp.value}' contains invalid characters for a symbol sequence.`,
        };
        const message = messages[result];
        this.pushError(message, symbolProp);
    }

    private parseBlock(blockToken: Token): AST.BlockNode {
        this.stream.match(TokenType.Newline);

        const children: AST.BlockContentNode[] = [];
        while (!this.stream.isAtEnd() && this.stream.peek().type !== TokenType.BlockClose) {
            children.push(...this.parseNextNode());
        }

        if (children.length > 0 && children[children.length - 1].type === AST.NodeType.Newline)
            children.pop();

        if (!this.stream.match(TokenType.BlockClose))
            this.pushError("Unclosed block. Expected '}'.");

        return buildBlockNode(blockToken, children);
    }

    private parseTextLine(startToken: Token): AST.BlockContentNode[] {
        /*! v8 ignore start -- @preserve */
        if (this.stream.peek().type === TokenType.Text)
            throw new Error(
                `Invariant violation: adjacent TEXT tokens at ${this.stream.peek().line}:${this.stream.peek().column}.`,
            );
        /*! v8 ignore stop -- @preserve */
        const nodes = this.expandSymbolsLine(startToken);
        const newlineToken = this.stream.match(TokenType.Newline);
        if (newlineToken) nodes.push(buildNewlineNode(newlineToken));

        return nodes;
    }

    private resolveAnnotationTarget(): AST.BlockNode | null {
        this.stream.skipWhitespaceTokens();
        if (this.stream.isAtEnd()) return null;
        return this.stream.peek().type === TokenType.BlockOpen
            ? this.parseBlock(this.stream.advance())
            : this.consumeTargetLine(this.stream.peek());
    }

    private consumeTargetLine(startToken: Token): AST.BlockNode | null {
        const children: AST.BlockContentNode[] = [];

        while (this.stream.match(TokenType.AnnotationOpen, TokenType.Text)) {
            const token = this.stream.previous();
            if (token.type === TokenType.AnnotationOpen) {
                const node = this.parseAnnotation(token);
                if (node) children.push(node);
                continue;
            }
            children.push(...this.expandSymbolsInline(token));
        }

        return children.length > 0 ? buildBlockNode(startToken, children) : null;
    }

    private consumeDirective(token: Token): AST.AnnotationDirective {
        return token.type === TokenType.Identifier &&
            (AST.DIRECTIVE_KEYWORDS as readonly string[]).includes(token.literal)
            ? (this.stream.advance().literal as AST.AnnotationDirective)
            : "NORMAL";
    }

    private parseProperties(): { props: AST.PropertyNode[]; hasNormalProps: boolean } {
        const props: AST.PropertyNode[] = [];
        let hasNormalProps = false;

        while (!this.stream.isAtEnd() && this.stream.peek().type !== TokenType.AnnotationClose) {
            if (this.stream.match(TokenType.Semicolon)) continue;
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
        let toggle: AST.PropertyToggle = undefined;

        if (this.stream.match(TokenType.TogglePlus)) {
            toggle = AST.PropertyToggle.Plus;
        } else if (this.stream.match(TokenType.ToggleMinus)) {
            toggle = AST.PropertyToggle.Minus;
        }

        if (this.stream.peek().type !== TokenType.Identifier) {
            this.pushError(`Expected property name, found '${this.stream.peek().literal}'.`);
            this.synchronizeToNextProperty();
            return null;
        }

        const token = this.stream.advance();
        return { source: token, key: token.literal, toggle };
    }

    private parsePropertyValue(parsedKey: ParsedPropertyKey): string | null {
        const { toggle, key } = parsedKey;
        if (toggle === AST.PropertyToggle.Minus) return "";
        if (!this.consumeColon(key)) return null;

        if (!this.stream.match(TokenType.Value, TokenType.Identifier)) {
            this.pushError(`Expected value for '${key}', found '${this.stream.peek().literal}'.`);
            this.synchronizeToNextProperty();
            return null;
        }
        return this.stream.previous().literal;
    }

    private consumeColon(propertyName: string): boolean {
        if (this.stream.peek().type !== TokenType.Colon) {
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
        if (!this.stream.match(TokenType.AnnotationClose)) {
            this.pushError("Annotation was not closed with ']]'.");
        }
    }

    private requirePropertySeparator(propertyName: string): void {
        const afterValue = this.stream.peek().type;
        if (afterValue === TokenType.Semicolon) {
            this.stream.advance();
        } else if (afterValue !== TokenType.AnnotationClose) {
            this.pushError(`Expected ';' after property value '${propertyName}'.`);
            this.synchronizeToNextProperty();
        }
    }

    private synchronizeToNextProperty() {
        while (!this.stream.isAtEnd()) {
            if (this.stream.match(TokenType.Semicolon)) return;
            if (this.stream.peek().type === TokenType.AnnotationClose) return;
            this.stream.advance();
        }
    }

    private expandSymbolsLine(token: Token): AST.BlockContentNode[] {
        this.isInsidePreamble = false;
        return SymbolParser.expandLine(token, this.symbolDetector);
    }

    private expandSymbolsInline(token: Token): AST.BlockContentNode[] {
        this.isInsidePreamble = false;
        return SymbolParser.expandInlineAt(token, this.symbolDetector);
    }

    private pushError(message: string, sourceLocation?: SourceLocation) {
        const currentLocation = sourceLocation ?? this.stream.peek();
        this.compilerErrors.push({
            type: CompilerErrorType.Parser,
            message,
            line: currentLocation.line,
            column: currentLocation.column,
        });
    }
}
