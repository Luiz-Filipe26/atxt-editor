import atxtExample from "./example.atxt?raw";
import { Lexer } from "./core/lexer";
import { Parser } from "./core/parser";
import { Hydrator } from "./core/hydrator";
import { Generator } from "./core/generator";

const STORAGE_KEY = "atxt_saved_content";

const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const outputEl = document.getElementById("output") as HTMLDivElement;

function runCompiler(source: string) {
    console.clear();
    console.group("🚀 Starting ATXT Compilation");

    try {
        const lexer = new Lexer(source);
        const { tokens, errors: lexerErrors } = lexer.tokenize();
        console.groupCollapsed("1. Lexer Output");
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
            console.warn(`⚠️ Total errors found: ${allErrors.length}`, allErrors);
        } else {
            console.log("✅ Compilation finished with no errors.");
        }

        outputEl.innerHTML = finalHtml;
    } catch (e) {
        console.error("❌ Critical failure in pipeline:", e);
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

outputEl.addEventListener("dblclick", (e) => {
    const target = e.target as HTMLElement;
    const mappedEl = target.closest("[data-line]");
    if (!mappedEl) return;

    const clickedOnText = window.getSelection()?.type === "Range";
    if (!clickedOnText) {
        const rect = mappedEl.getBoundingClientRect();
        const distanceToTop = e.clientY - rect.top;
        const THRESHOLD_PX = 60;
        if (distanceToTop > THRESHOLD_PX) {
            return;
        }
    }

    const line = parseInt(mappedEl.getAttribute("data-line") || "1", 10);
    const column = parseInt(mappedEl.getAttribute("data-column") || "1", 10);

    jumpToEditorPosition(line, column);
});

function jumpToEditorPosition(targetLine: number, targetColumn: number) {
    const { lineStartIndex, charIndex, lineEndIndex } = calculateSelectionIndices(
        inputEl.value,
        targetLine,
        targetColumn,
    );

    inputEl.focus();
    inputEl.setSelectionRange(lineStartIndex, lineEndIndex);

    inputEl.blur();
    inputEl.focus();
    inputEl.setSelectionRange(lineStartIndex, lineEndIndex);

    setTimeout(() => {
        if (document.activeElement === inputEl) {
            inputEl.setSelectionRange(charIndex, charIndex);
        }
    }, 400);
}

function calculateSelectionIndices(text: string, line: number, column: number) {
    let lineStartIndex = 0;
    for (let i = 1; i < line; i++) {
        lineStartIndex = text.indexOf("\n", lineStartIndex) + 1;
        if (lineStartIndex === 0) break;
    }
    const charIndex = lineStartIndex + column - 1;
    let lineEndIndex = text.indexOf("\n", lineStartIndex);
    if (lineEndIndex === -1) {
        lineEndIndex = text.length;
    }
    return { lineStartIndex, charIndex, lineEndIndex };
}
