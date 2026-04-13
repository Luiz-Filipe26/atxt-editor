export const CompilerErrorType = {
    Lexer: "LEXER",
    Parser: "PARSER",
    Lowerer: "LOWERER",
} as const;

export type CompilerErrorType = (typeof CompilerErrorType)[keyof typeof CompilerErrorType];

export interface CompilerError {
    type: CompilerErrorType;
    message: string;
    line: number;
    column: number;
}
