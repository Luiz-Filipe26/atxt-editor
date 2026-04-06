import { TokenType, type Token } from "../types/tokens";

export class TokenStream {
    private readonly tokens: Token[];
    public current = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    public peek(): Token {
        return this.tokens[this.current];
    }

    public previous(): Token {
        return this.tokens[this.current - 1];
    }

    public isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    public advance(): Token {
        /* v8 ignore next -- @preserve */
        if (this.isAtEnd()) {
            throw new Error("Invariant violation: advance() called past EOF.");
        }
        this.current++;
        return this.previous();
    }

    public match(...types: TokenType[]): Token | null {
        for (const type of types) {
            if (!this.isAtEnd() && this.peek().type === type) {
                return this.advance();
            }
        }
        return null;
    }

    public skipWhitespaceTokens(): void {
        while (!this.isAtEnd() && this.isBlankToken(this.peek())) {
            this.advance();
        }
    }

    private isBlankToken(token: Token): boolean {
        return (
            token.type === TokenType.NEWLINE ||
            (token.type === TokenType.TEXT && /^[ \t]*$/.test(token.literal))
        );
    }
}
