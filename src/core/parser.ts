import { TokenType, type Token } from "../types/tokens";
import { TokenStream } from "./tokenStream";
import * as AST from "../types/ast";
import type { CompilerError } from "../types/errors";

export class Parser {
    private stream!: TokenStream;
    private compilerErrors: CompilerError[] = [];

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
            const node = this.parseNextNode();
            if (node) root.children.push(node);
        }

        return { document: root, errors: this.compilerErrors };
    }

    private parseNextNode(): AST.BlockContentNode | null {
        const token = this.stream.advance();
        switch (token.type) {
            case TokenType.ANNOTATION_OPEN:
                return this.parseAnnotation(token);
            case TokenType.BLOCK_OPEN:
                return this.parseBlock(token);
            case TokenType.NEWLINE:
            case TokenType.TEXT:
                return this.parseTextLine(token);
            case TokenType.BLOCK_CLOSE:
                this.pushError(`Unexpected block close.`, token);
                return null;
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
            return null;
        }

        const hasNormalProps = props.some((p) => p.toggle === undefined);
        const needsTarget = directive === "NORMAL" && hasNormalProps;

        return {
            type: AST.NodeType.ANNOTATION,
            line: openingToken.line,
            column: openingToken.column,
            directive: directive,
            properties: props,
            target: needsTarget ? this.resolveAnnotationTarget() : null,
        };
    }

    private parseBlock(blockToken: Token): AST.BlockNode {
        const children: AST.BlockContentNode[] = [];
        while (!this.stream.isAtEnd() && this.stream.peek().type !== TokenType.BLOCK_CLOSE) {
            const node = this.parseNextNode();
            if (node) children.push(node);
        }

        if (!this.stream.match(TokenType.BLOCK_CLOSE)) {
            this.pushError("Unclosed block. Expected '}'.");
        }

        return {
            type: AST.NodeType.BLOCK,
            line: blockToken.line,
            column: blockToken.column,
            children: children,
        };
    }

    private parseTextLine(startToken: Token): AST.TextNode {
        let content = startToken.literal;

        if (startToken.type === TokenType.NEWLINE) {
            return this.buildTextNode(startToken, content);
        }

        while (!this.stream.isAtEnd()) {
            const nextToken = this.stream.peek();
            if (nextToken.type !== TokenType.TEXT && nextToken.type !== TokenType.NEWLINE) {
                break;
            }
            if (nextToken.type === TokenType.NEWLINE) {
                content += this.stream.advance().literal;
                break;
            }
            content += this.stream.advance().literal;
        }

        return this.buildTextNode(startToken, content);
    }

    private resolveAnnotationTarget(): AST.TargetNode | null {
        if (this.stream.isAtEnd()) return null;

        if (this.stream.isTargetingBlock()) {
            this.stream.skipWhitespaceTokens();
            return this.parseBlock(this.stream.advance());
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

            if (token.type === TokenType.NEWLINE) break;

            if (token.type === TokenType.ANNOTATION_OPEN) {
                this.stream.advance();
                const node = this.parseAnnotation(token);
                if (node) children.push(node);
            } else if (token.type === TokenType.TEXT) {
                children.push(this.buildTextNode(token, this.stream.advance().literal));
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
            ["SET", "DEFINE", "HIDE"].includes(token.literal);

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

    private parseTogglePrefix(rawKey: string): {
        key: string;
        toggle: AST.PropertyNode["toggle"];
    } {
        const toggle: AST.PropertyNode["toggle"] =
            rawKey[0] === "+" ? "plus" : rawKey[0] === "-" ? "minus" : undefined;
        return { key: toggle !== undefined ? rawKey.substring(1) : rawKey, toggle };
    }

    private buildTextNode(startToken: Token, content: string): AST.TextNode {
        return {
            type: AST.NodeType.TEXT,
            line: startToken.line,
            column: startToken.column,
            content,
        };
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
