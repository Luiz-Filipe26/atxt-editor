import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Hydrator } from "./hydrator";
import type * as IR from "../types/ir";
import type { CompilerError } from "../types/errors";
import { Generator } from "./generator";

export interface compileResult {
    ir: IR.IRDocument;
    errors: CompilerError[];
}

export function compileToIR(source: string): compileResult {
    const { tokens, errors: lexerErrors } = Lexer.tokenize(source);
    const { document: ast, errors: parserErrors } = Parser.parse(tokens);
    const { document: irDocument, errors: hydratorErrors } = Hydrator.hydrate(ast);

    return {
        ir: irDocument,
        errors: [...lexerErrors, ...parserErrors, ...hydratorErrors],
    };
}

export function compileToHTML(source: string) {
    return Generator.generate(compileToIR(source).ir.root);
}
