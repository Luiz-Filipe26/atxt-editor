import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Hydrator } from "./hydrator";
import type * as IR from "../types/ir";
import type { CompilerError } from "../types/errors";

const lexer = new Lexer();
const parser = new Parser();
const hydrator = new Hydrator();

export function compileToIR(source: string): {
    ir: IR.IRDocument;
    errors: CompilerError[];
} {
    const { tokens, errors: lexerErrors } = lexer.tokenize(source);
    const { document: ast, errors: parserErrors } = parser.parse(tokens);
    const { document: irDocument, errors: hydratorErrors } = hydrator.hydrate(ast);

    return {
        ir: irDocument,
        errors: [...lexerErrors, ...parserErrors, ...hydratorErrors],
    };
}
