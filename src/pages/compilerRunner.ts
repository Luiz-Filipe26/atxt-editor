import * as Atxt from "@atxt";

export function runCompiler(
    source: string,
    onResult: (ir: Atxt.IR.IRDocument | null, errors: Atxt.CompilerError[]) => void,
): void {
    console.clear();
    console.group("🚀 Starting ATXT Compilation");

    try {
        const { tokens, errors: lexerErrors } = Atxt.Lexer.tokenize(source);
        console.groupCollapsed("1. Lexer Output");
        console.log("Tokens:", tokens);
        if (lexerErrors.length) console.error("Lexer Errors:", lexerErrors);
        console.groupEnd();

        const { document: ast, errors: parserErrors } = Atxt.Parser.parse(tokens);
        console.groupCollapsed("2. Parser Output (AST)");
        console.log("AST:", ast);
        if (parserErrors.length) console.error("Parser Errors:", parserErrors);
        console.groupEnd();

        const { document: irDocument, errors: loweringErrors } = Atxt.Lowerer.lower(ast);
        console.groupCollapsed("3. Lowerer Output (IR)");
        console.log("IR Document:", irDocument);
        if (loweringErrors.length) console.error("Lowerer Errors:", loweringErrors);
        console.groupEnd();

        const { html: finalHtml, errors: htmlErrors } = Atxt.HtmlGenerator.generate(irDocument);
        console.groupCollapsed("4. HtmlGenerator Output");
        console.log("HTML Output:", finalHtml);
        if (htmlErrors.length) console.error("HtmlGenerator Errors:", htmlErrors);
        console.groupEnd();

        const allErrors = [...lexerErrors, ...parserErrors, ...loweringErrors, ...htmlErrors];

        if (allErrors.length > 0) {
            console.warn(`⚠️ Total errors found: ${allErrors.length}`, allErrors);
        } else {
            console.log("✅ Compilation finished with no errors.");
        }

        onResult(irDocument, allErrors);
    } catch (e) {
        console.error("❌ Critical failure in pipeline:", e);
        onResult(null, [
            {
                type: Atxt.CompilerErrorType.HtmlGenerator,
                message: "Critical compiler failure: " + String(e),
                line: 1,
                column: 1,
            } as Atxt.CompilerError,
        ]);
    }

    console.groupEnd();
}
