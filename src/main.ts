import atxtExample from "./example.atxt?raw";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Hydrator } from "./hydrator";
import { Generator } from "./generator";

const STORAGE_KEY = "atxt_saved_content";

const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const outputEl = document.getElementById("output") as HTMLDivElement;

function runCompiler(source: string) {
    console.clear();
    console.group("🚀 Iniciando Compilação ATXT");

    try {
        const lexer = new Lexer(source);
        const { tokens, errors: lexerErrors } = lexer.tokenize();
        console.groupCollapsed("1. Lexer Output"); // Deixei colapsado para não poluir o console
        console.log("Tokens:", tokens);
        if (lexerErrors.length) console.error("Lexer Errors:", lexerErrors);
        console.groupEnd();

        const parser = new Parser(tokens);
        const { document: ast, errors: parserErrors } = parser.parse();
        console.groupCollapsed("2. Parser Output (AST)");
        console.log("AST:", ast);
        if (parserErrors.length) console.error("Parser Errors:", parserErrors);
        console.groupEnd();

        const hydrator = new Hydrator();
        const { document: irAST, errors: hydratorErrors } = hydrator.hydrate(ast);
        console.groupCollapsed("3. Hydrator Output (IR)");
        console.log("IR AST:", irAST);
        if (hydratorErrors.length)
            console.error("Hydrator Errors:", hydratorErrors);
        console.groupEnd();

        const generator = new Generator();
        const finalHtml = generator.generate(irAST);
        console.groupCollapsed("4. Generator Output");
        console.log(finalHtml);
        console.groupEnd();

        const allErrors = [...lexerErrors, ...parserErrors, ...hydratorErrors];
        if (allErrors.length > 0) {
            console.warn(
                `⚠️ Total de erros encontrados: ${allErrors.length}`,
                allErrors,
            );
        } else {
            console.log("✅ Compilação concluída sem erros.");
        }

        outputEl.innerHTML = finalHtml;
    } catch (e) {
        console.error("❌ Falha crítica na esteira:", e);
    }

    console.groupEnd();
}

const debounce = <T extends (...args: any[]) => void>(fn: T, ms = 300) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), ms);
    };
};

const handleInput = debounce(() => {
    const value = inputEl.value;
    localStorage.setItem(STORAGE_KEY, value);
    runCompiler(value);
});

const initialContent = localStorage.getItem(STORAGE_KEY) || atxtExample;
inputEl.value = initialContent;
inputEl.addEventListener("input", handleInput);

runCompiler(initialContent);
