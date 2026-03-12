import { TokenType, type Token } from "./lexer";
import { TokenStream } from "./tokenStream";
import {
    NodeType,
    type ASTNode,
    type DocumentNode,
    type BlockNode,
    type TextNode,
    type AnnotationNode,
    type PropertyNode,
    type AnnotationDirective,
} from "../types/ast";
import type { CompilerError } from "../types/errors";

export class Parser {
    private stream: TokenStream;
    private compilerErrors: CompilerError[] = [];

    constructor(tokens: Token[]) {
        this.stream = new TokenStream(tokens);
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

    public parse(): { document: DocumentNode; errors: CompilerError[] } {
        const root: DocumentNode = {
            type: NodeType.DOCUMENT,
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

    private parseNextNode(): ASTNode | null {
        const token = this.stream.advance();
        switch (token.type) {
            case TokenType.ANNOTATION_OPEN:
                return this.parseAnnotation(token);
            case TokenType.BLOCK_OPEN:
                return this.parseBlock(token);
            case TokenType.NEWLINE:
            case TokenType.TEXT:
                return this.parseTextLine(token);
            case TokenType.EOF:
                return null;
            default:
                this.pushError(
                    `Unexpected loose token in document: '${token.literal}'`,
                    token,
                );
                return null;
        }
    }

    private parseAnnotation(openingToken: Token): AnnotationNode {
        const directive = this.consumeDirective();
        const props = this.parseProperties();
        this.consumeAnnotationClosure();

        const hasNormalProps = props.some((p) => p.toggle === undefined);
        const needsTarget = directive === "NORMAL" && hasNormalProps;

        return {
            type: NodeType.ANNOTATION,
            line: openingToken.line,
            column: openingToken.column,
            directive: directive,
            properties: props,
            target: needsTarget ? this.resolveAnnotationTarget() : null,
        };
    }

    private resolveAnnotationTarget(): ASTNode | null {
        if (this.stream.isAtEnd()) return null;

        if (this.stream.isTargetingBlock()) {
            this.stream.skipWhitespaceTokens();
            return this.parseBlock(this.stream.advance());
        }

        this.stream.skipWhitespaceTokens();
        return this.consumeTargetLine();
    }

    private consumeTargetLine(): TextNode | null {
        if (this.stream.isAtEnd()) return null;

        const startToken = this.stream.peek();
        let aggregatedText = "";

        while (!this.stream.isAtEnd()) {
            const token = this.stream.peek();

            if (token.type === TokenType.NEWLINE) {
                break;
            }

            if (token.type === TokenType.TEXT) {
                aggregatedText += this.stream.advance().literal;
            } else {
                break;
            }
        }

        return {
            type: NodeType.TEXT,
            line: startToken.line,
            column: startToken.column,
            content: aggregatedText,
        };
    }

    private consumeDirective(): AnnotationDirective {
        const peekToken = this.stream.peek();

        if (peekToken.type === TokenType.IDENTIFIER) {
            if (peekToken.literal === "SET") {
                this.stream.advance();
                return "SET";
            }
            if (peekToken.literal === "DEFINE") {
                this.stream.advance();
                return "DEFINE";
            }
        }
        return "NORMAL";
    }

    private parseProperties(): PropertyNode[] {
        const props: PropertyNode[] = [];

        while (
            !this.stream.isAtEnd() &&
            this.stream.peek().type !== TokenType.ANNOTATION_CLOSE
        ) {
            if (this.stream.match(TokenType.SEMICOLON)) continue;

            const keyToken = this.stream.peek();
            const rawKey = this.parsePropertyKey();
            if (!rawKey) continue;

            let toggle: PropertyNode["toggle"] = undefined;
            let key = rawKey;

            if (rawKey.startsWith("+")) {
                toggle = "plus";
                key = rawKey.substring(1);
            } else if (rawKey.startsWith("-")) {
                toggle = "minus";
                key = rawKey.substring(1);
            }

            if (toggle === "minus") {
                props.push({
                    type: NodeType.PROPERTY,
                    line: keyToken.line,
                    column: keyToken.column,
                    key,
                    value: "",
                    toggle,
                });
                this.requirePropertySeparator(rawKey);
                continue;
            }

            if (!this.consumeColon(key)) continue;

            const value = this.parsePropertyValue(key);
            if (!value) continue;

            props.push({
                type: NodeType.PROPERTY,
                line: keyToken.line,
                column: keyToken.column,
                key,
                value,
                toggle,
            });

            this.requirePropertySeparator(rawKey);
        }

        return props;
    }

    private parsePropertyKey(): string | null {
        if (this.stream.peek().type !== TokenType.IDENTIFIER) {
            this.pushError(
                `Expected property name, found '${this.stream.peek().literal}'.`,
            );
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

    private requirePropertySeparator(propertyName: string): void {
        const afterValue = this.stream.peek().type;
        if (afterValue === TokenType.SEMICOLON) {
            this.stream.advance();
        } else if (afterValue !== TokenType.ANNOTATION_CLOSE) {
            this.pushError(`Expected ';' after property value '${propertyName}'.`);
            this.synchronizeToNextProperty();
        }
    }

    private consumeAnnotationClosure(): void {
        if (!this.stream.match(TokenType.ANNOTATION_CLOSE)) {
            this.pushError("Annotation was not closed with ']]'.");
        }
    }

    private synchronizeToNextProperty() {
        while (!this.stream.isAtEnd()) {
            if (this.stream.match(TokenType.SEMICOLON)) return;
            if (this.stream.peek().type === TokenType.ANNOTATION_CLOSE) return;
            this.stream.advance();
        }
    }

    private parseBlock(blockToken: Token): BlockNode {
        const children: ASTNode[] = [];
        while (
            !this.stream.isAtEnd() &&
            this.stream.peek().type !== TokenType.BLOCK_CLOSE
        ) {
            const node = this.parseNextNode();
            if (node) children.push(node);
        }

        if (!this.stream.match(TokenType.BLOCK_CLOSE)) {
            this.pushError("Unclosed block. Expected '}'.");
        }

        return {
            type: NodeType.BLOCK,
            line: blockToken.line,
            column: blockToken.column,
            children: children,
        };
    }

    private parseTextLine(startToken: Token): TextNode {
        let content = startToken.literal;

        if (startToken.type === TokenType.NEWLINE) {
            return this.buildTextNode(startToken, content);
        }

        while (!this.stream.isAtEnd()) {
            const nextToken = this.stream.peek();
            if (
                nextToken.type !== TokenType.TEXT &&
                nextToken.type !== TokenType.NEWLINE
            ) {
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

    private buildTextNode(startToken: Token, content: string): TextNode {
        return {
            type: NodeType.TEXT,
            line: startToken.line,
            column: startToken.column,
            content: content,
        };
    }
}
