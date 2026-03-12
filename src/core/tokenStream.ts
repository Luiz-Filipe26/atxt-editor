import { TokenType, type Token } from "./lexer";

export class TokenStream {
    private readonly tokens: Token[];
    public current = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    peek(): Token {
        return this.tokens[this.current];
    }

    previous(): Token {
        return this.tokens[this.current - 1];
    }

    isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    advance(): Token {
        if (!this.isAtEnd()) {
            this.current++;
            return this.previous();
        }
        return this.peek();
    }

    match(...types: TokenType[]): Token | null {
        for (const type of types) {
            if (!this.isAtEnd() && this.peek().type === type) {
                return this.advance();
            }
        }
        return null;
    }

    private lookahead(
        skipCondition: (token: Token) => boolean,
        targetCondition: (token: Token) => boolean,
    ): boolean {
        let offset = 0;
        while (this.current + offset < this.tokens.length) {
            const token = this.tokens[this.current + offset];

            if (targetCondition(token)) return true;
            if (!skipCondition(token)) return false;

            offset++;
        }
        return false;
    }

    private isBlankToken(token: Token): boolean {
        return (
            token.type === TokenType.NEWLINE ||
            (token.type === TokenType.TEXT && /^[ \t]*$/.test(token.literal))
        );
    }

    isTargetingBlock(): boolean {
        return this.lookahead(
            (t) => this.isBlankToken(t),
            (t) => t.type === TokenType.BLOCK_OPEN,
        );
    }

    skipWhitespaceTokens(): void {
        while (!this.isAtEnd() && this.isBlankToken(this.peek())) {
            this.advance();
        }
    }
}
