export class Scanner {
    private readonly source: string;
    public current = 0;
    public line = 1;
    public column = 1;

    public markStart = 0;
    public markLine = 1;
    public markColumn = 1;

    constructor(source: string) {
        this.source = source;
    }

    isAtEnd(): boolean {
        return this.current >= this.source.length;
    }

    advance(): string {
        const char = this.source[this.current++];
        if (char === "\n") {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return char;
    }

    peek(): string {
        return this.isAtEnd() ? "\0" : this.source[this.current];
    }

    check(literal: string): boolean {
        if (this.current + literal.length > this.source.length) return false;
        return this.source.substring(this.current, this.current + literal.length) === literal;
    }

    match(expected: string): boolean {
        if (this.isAtEnd() || this.source[this.current] !== expected) return false;
        this.advance();
        return true;
    }

    mark() {
        this.markStart = this.current;
        this.markLine = this.line;
        this.markColumn = this.column;
    }

    getMarkedSubstring(): string {
        return this.source.substring(this.markStart, this.current);
    }
}
