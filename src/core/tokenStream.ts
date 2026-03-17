import { TokenType, type Token } from "../types/tokens";

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
        /* v8 ignore next 1 -- @preserve */
        if (this.isAtEnd()) {
            throw new Error("Invariant violation: advance() called past EOF.");
        }
        this.current++;
        return this.previous();
    }

    match(...types: TokenType[]): Token | null {
        for (const type of types) {
            if (!this.isAtEnd() && this.peek().type === type) {
                return this.advance();
            }
        }
        return null;
    }

    private isBlankToken(token: Token): boolean {
        return (
            token.type === TokenType.NEWLINE ||
            (token.type === TokenType.TEXT && /^[ \t]*$/.test(token.literal))
        );
    }

    isTargetingBlock(): boolean {
        for (let offset = this.current; offset < this.tokens.length; offset++) {
            const token = this.tokens[offset];
            if (token.type === TokenType.BLOCK_OPEN) return true;
            if (!this.isBlankToken(token)) return false;
        }
        /* v8 ignore next 1 -- @preserve */
        throw new Error("Invariant violation: token stream has no EOF token.");
    }

    skipWhitespaceTokens(): void {
        while (!this.isAtEnd() && this.isBlankToken(this.peek())) {
            this.advance();
        }
    }
}
