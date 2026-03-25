import { TokenType, type Token } from "../types/tokens";
import { TokenStream } from "./tokenStream";
import * as AST from "../types/ast";
import type { CompilerError } from "../types/errors";
import { SymbolDetector, type BlockSymbolMatch } from "./symbolDetector";
import { TextExpander } from "./textExpander";

export class Parser {
    private stream!: TokenStream;
    private compilerErrors: CompilerError[] = [];
    private symbolDetector = new SymbolDetector();
    private textExpander = new TextExpander(this.symbolDetector);

    parse(tokens: Token[]): { document: AST.DocumentNode; errors: CompilerError[] } {
        this.stream = new TokenStream(tokens);
        this.compilerErrors = [];

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
            case TokenType.ANNOTATION_OPEN: {
                const node = this.parseAnnotation(token);
                if (!node || node.target === null) this.stream.match(TokenType.NEWLINE);
                return node ? [node] : [];
            }
            case TokenType.BLOCK_OPEN:
                return [this.parseBlock(token)];
            case TokenType.NEWLINE:
            case TokenType.TEXT:
                return this.parseTextLine(token);
            case TokenType.BLOCK_CLOSE:
                this.pushError(`Unexpected block close.`, token);
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

    private parseAnnotation(openingToken: Token): AST.AnnotationNode | null {
        const directive = this.consumeDirective();
        const props = this.parseProperties();
        this.consumeAnnotationClosure();

        if (directive === "HIDE") {
            this.resolveAnnotationTarget();
            this.stream.match(TokenType.NEWLINE);
            return null;
        }

        if (directive === "SYMBOL") {
            this.handleSymbolDefinition(props);
            this.stream.match(TokenType.NEWLINE);
            return null;
        }

        const hasNormalProps = props.some((p) => p.toggle === undefined);
        const needsTarget = directive === "NORMAL" && hasNormalProps;
        const target = needsTarget ? this.resolveAnnotationTarget() : null;

        return {
            type: AST.NodeType.ANNOTATION,
            line: openingToken.line,
            column: openingToken.column,
            directive,
            properties: props,
            target,
        };
    }

    private handleSymbolDefinition(props: AST.PropertyNode[]): void {
        const symbolProp = props.find((p) => p.key === "symbol");
        if (!symbolProp?.value) return;
        const typeProp = props.find((p) => p.key === "type")?.value ?? "";

        const symbolProps = Object.fromEntries(
            props
                .filter((p) => p.key !== "symbol" && p.key !== "type")
                .map((p) => [p.key, p.value]),
        );

        if (Object.keys(symbolProps).length === 0) return;

        typeProp === "block"
            ? this.symbolDetector.registerBlock(symbolProp.value, symbolProps)
            : this.symbolDetector.registerInline(symbolProp.value, symbolProps);
    }

    private parseBlock(blockToken: Token): AST.BlockNode {
        this.stream.skipWhitespaceTokens();

        const children: AST.BlockContentNode[] = [];
        while (!this.stream.isAtEnd() && this.stream.peek().type !== TokenType.BLOCK_CLOSE) {
            children.push(...this.parseNextNode());
        }

        if (children.length > 0 && children[children.length - 1].type === AST.NodeType.NEWLINE) {
            children.pop();
        }

        if (!this.stream.match(TokenType.BLOCK_CLOSE)) {
            this.pushError("Unclosed block. Expected '}'.");
        }

        return {
            type: AST.NodeType.BLOCK,
            line: blockToken.line,
            column: blockToken.column,
            children,
        };
    }

    private parseTextLine(startToken: Token): AST.BlockContentNode[] {
        if (startToken.type === TokenType.NEWLINE) return [this.buildNewlineNode(startToken)];

        /*! v8 ignore start -- @preserve */
        if (this.stream.peek().type === TokenType.TEXT)
            throw new Error(
                `Invariant violation: adjacent TEXT tokens at ${this.stream.peek().line}:${this.stream.peek().column}.`,
            );
        /*! v8 ignore stop -- @preserve */

        const newlineToken = this.stream.match(TokenType.NEWLINE);
        const blockSymbol = this.symbolDetector.detectBlockSymbol(startToken.literal);

        const nodes: AST.BlockContentNode[] = blockSymbol
            ? [this.buildBlockSymbolAnnotation(blockSymbol, startToken.literal, startToken)]
            : this.textExpander.expand(startToken.literal, startToken.line, startToken.column);

        if (newlineToken) nodes.push(this.buildNewlineNode(newlineToken));

        return nodes;
    }

    private buildBlockSymbolAnnotation(
        blockSymbol: BlockSymbolMatch,
        content: string,
        startToken: Token,
    ): AST.AnnotationNode {
        const restColumn = startToken.column + blockSymbol.prefixLength;
        return {
            type: AST.NodeType.ANNOTATION,
            line: startToken.line,
            column: startToken.column,
            directive: "NORMAL",
            properties: Object.entries(blockSymbol.props).map(([key, value]) =>
                this.buildPropertyNode(startToken, key, value, undefined),
            ),
            target: {
                type: AST.NodeType.BLOCK,
                line: startToken.line,
                column: restColumn,
                children: this.textExpander.expand(
                    content.slice(blockSymbol.prefixLength),
                    startToken.line,
                    restColumn,
                ),
            },
        };
    }

    private resolveAnnotationTarget(): AST.TargetNode | null {
        if (this.stream.isAtEnd()) return null;

        if (this.stream.isTargetingBlock()) {
            this.stream.skipWhitespaceTokens();
            const block = this.parseBlock(this.stream.advance());
            this.stream.match(TokenType.NEWLINE);
            return block;
        }

        this.stream.skipWhitespaceTokens();
        return this.consumeTargetLine();
    }

    private consumeTargetLine(): AST.BlockNode | null {
        if (this.stream.isAtEnd()) return null;

        const startToken = this.stream.peek();
        const children: AST.BlockContentNode[] = [];

        while (!this.stream.isAtEnd()) {
            const token = this.stream.peek();
            if (token.type === TokenType.NEWLINE) {
                this.stream.advance();
                break;
            }
            if (token.type === TokenType.ANNOTATION_OPEN) {
                this.stream.advance();
                const node = this.parseAnnotation(token);
                if (node) children.push(node);
            } else if (token.type === TokenType.TEXT) {
                const tok = this.stream.advance();
                children.push(...this.textExpander.expand(tok.literal, tok.line, tok.column));
            } else {
                break;
            }
        }

        if (children.length === 0) return null;

        return {
            type: AST.NodeType.BLOCK,
            line: startToken.line,
            column: startToken.column,
            children,
        };
    }

    private consumeDirective(): AST.AnnotationDirective {
        const token = this.stream.peek();
        const isDirectiveKeyword =
            token.type === TokenType.IDENTIFIER &&
            ["SET", "DEFINE", "HIDE", "SYMBOL"].includes(token.literal);

        if (isDirectiveKeyword) return this.stream.advance().literal as AST.AnnotationDirective;
        return "NORMAL";
    }

    private parseProperties(): AST.PropertyNode[] {
        const props: AST.PropertyNode[] = [];

        while (!this.stream.isAtEnd() && this.stream.peek().type !== TokenType.ANNOTATION_CLOSE) {
            if (this.stream.match(TokenType.SEMICOLON)) continue;

            const keyToken = this.stream.peek();
            const rawKey = this.parsePropertyKey();
            if (!rawKey) continue;

            const { key, toggle } = this.parseTogglePrefix(rawKey);

            if (toggle === "minus") {
                props.push(this.buildPropertyNode(keyToken, key, "", toggle));
                this.requirePropertySeparator(rawKey);
                continue;
            }

            if (!this.consumeColon(key)) continue;
            const value = this.parsePropertyValue(key);
            if (!value) continue;

            props.push(this.buildPropertyNode(keyToken, key, value, toggle));
            this.requirePropertySeparator(rawKey);
        }

        return props;
    }

    private parsePropertyKey(): string | null {
        if (this.stream.peek().type !== TokenType.IDENTIFIER) {
            this.pushError(`Expected property name, found '${this.stream.peek().literal}'.`);
            this.synchronizeToNextProperty();
            return null;
        }
        return this.stream.advance().literal;
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

    private parsePropertyValue(propertyName: string): string | null {
        const valueType = this.stream.peek().type;
        if (valueType !== TokenType.VALUE && valueType !== TokenType.IDENTIFIER) {
            this.pushError(
                `Expected value for '${propertyName}', found '${this.stream.peek().literal}'.`,
            );
            this.synchronizeToNextProperty();
            return null;
        }
        return this.stream.advance().literal;
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

    private parseTogglePrefix(rawKey: string): { key: string; toggle: AST.PropertyNode["toggle"] } {
        const toggle: AST.PropertyNode["toggle"] =
            rawKey[0] === "+" ? "plus" : rawKey[0] === "-" ? "minus" : undefined;
        return { key: toggle !== undefined ? rawKey.substring(1) : rawKey, toggle };
    }

    private buildNewlineNode(token: Token): AST.NewlineNode {
        return { type: AST.NodeType.NEWLINE, line: token.line, column: token.column };
    }

    private buildPropertyNode(
        keyToken: Token,
        key: string,
        value: string,
        toggle: AST.PropertyNode["toggle"],
    ): AST.PropertyNode {
        return {
            type: AST.NodeType.PROPERTY,
            line: keyToken.line,
            column: keyToken.column,
            key,
            value,
            toggle,
        };
    }

    private pushError(message: string, token?: Token) {
        const currentToken = token ?? this.stream.peek();
        this.compilerErrors.push({
            type: "PARSER",
            message,
            line: currentToken.line,
            column: currentToken.column,
        });
    }
}
