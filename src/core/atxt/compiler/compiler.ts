import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Lowerer } from "./lowerer";
import type * as IR from "../types/ir";
import type { CompilerError } from "../types/errors";
import { HtmlGenerator, type HtmlGeneratingResult } from "./htmlGenerator";

export interface CompileResult {
    ir: IR.IRDocument;
    errors: CompilerError[];
}

export function compileToIR(source: string): CompileResult {
    const { tokens, errors: lexerErrors } = Lexer.tokenize(source);
    const { document: ast, errors: parserErrors } = Parser.parse(tokens);
    const { document: irDocument, errors: loweringErrors } = Lowerer.lower(ast);

    return {
        ir: irDocument,
        errors: [...lexerErrors, ...parserErrors, ...loweringErrors],
    };
}

export function compileToHTML(source: string) : HtmlGeneratingResult {
    return HtmlGenerator.generate(compileToIR(source).ir);
}
