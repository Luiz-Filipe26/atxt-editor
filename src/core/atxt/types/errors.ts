export interface CompilerError {
    type: "LEXER" | "PARSER" | "HYDRATOR";
    message: string;
    line: number;
    column: number;
}
