export const TokenType = {
    TEXT: "TEXT",
    NEWLINE: "NEWLINE",
    ANNOTATION_OPEN: "ANNOTATION_OPEN",
    ANNOTATION_CLOSE: "ANNOTATION_CLOSE",
    BLOCK_OPEN: "BLOCK_OPEN",
    BLOCK_CLOSE: "BLOCK_CLOSE",
    IDENTIFIER: "IDENTIFIER",
    COLON: "COLON",
    SEMICOLON: "SEMICOLON",
    VALUE: "VALUE",
    EOF: "EOF",
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface SourceLocation {
    line: number;
    column: number;
}

export interface Token extends SourceLocation {
    type: TokenType;
    literal: string;
}
