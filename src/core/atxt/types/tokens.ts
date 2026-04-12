import type { SourceLocation } from "./location";

export const TokenType = {
    Text: "TEXT",
    Newline: "NEWLINE",
    AnnotationOpen: "ANNOTATION_OPEN",
    AnnotationClose: "ANNOTATION_CLOSE",
    BlockOpen: "BLOCK_OPEN",
    BlockClose: "BLOCK_CLOSE",
    Identifier: "IDENTIFIER",
    Colon: "COLON",
    Semicolon: "SEMICOLON",
    Value: "VALUE",
    Eof: "EOF",
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface Token extends SourceLocation {
    type: TokenType;
    literal: string;
}
