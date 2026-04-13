import atxtExample from "./assets/example.atxt?raw";
import * as Atxt from "@atxt";

const STORAGE_KEY = "atxt_saved_content";
const GO_TO_SOURCE_FOCUS_DELAY = 100;
const COMPILE_DEBOUNCE_TIME = 100;

const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const outputEl = document.getElementById("output") as HTMLDivElement;

let currentNodeMap: Map<string, Atxt.IR.Node> = new Map();

function runCompiler(source: string) {
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

        const finalHtml = Atxt.HtmlGenerator.generate(irDocument.root);
        console.groupCollapsed("4. HtmlGenerator Output");
        console.log(finalHtml);
        console.groupEnd();

        const allErrors = [...lexerErrors, ...parserErrors, ...loweringErrors];
        if (allErrors.length > 0) {
            console.warn(`⚠️ Total errors found: ${allErrors.length}`, allErrors);
        } else {
            console.log("✅ Compilation finished with no errors.");
        }

        currentNodeMap = irDocument.nodeMap;
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
}, COMPILE_DEBOUNCE_TIME);

const initialContent = (localStorage.getItem(STORAGE_KEY) || atxtExample).replace(/\n$/, "");
inputEl.value = initialContent;
inputEl.addEventListener("input", handleInput);

runCompiler(initialContent);

let pendingOffset = 0;

document.getElementById("btn-serialize")!.addEventListener("click", () => {
    const { ir, errors } = Atxt.compileToIR(inputEl.value);
    if (errors.length > 0) console.warn("Serializing IR with errors:", errors);
    const canonical = Atxt.serialize(ir);
    const blob = new Blob([canonical], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.atxt";
    a.click();
    URL.revokeObjectURL(url);
});

outputEl.addEventListener("mousedown", (e) => {
    if ("caretPositionFromPoint" in document) {
        const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
        pendingOffset = pos?.offset ?? 0;
    } else if ("caretRangeFromPoint" in document) {
        const range = (
            document as {
                caretRangeFromPoint: (x: number, y: number) => Range | null;
            }
        ).caretRangeFromPoint(e.clientX, e.clientY);
        pendingOffset = range?.startOffset ?? 0;
    }
});

outputEl.addEventListener("dblclick", (e) => {
    if (!(e.target instanceof Element)) return;
    const mappedEl = e.target.closest("[data-id]");
    if (!(mappedEl instanceof HTMLElement)) return;

    const id = mappedEl.dataset.id!;
    const irNode = currentNodeMap.get(id);
    if (!irNode || irNode.line === undefined || irNode.column === undefined) return;

    let column = irNode.column;
    if (irNode.type === Atxt.IR.NodeType.Text) column += pendingOffset;

    jumpToEditorPosition(irNode.line, column);
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
        if (document.activeElement === inputEl) inputEl.setSelectionRange(charIndex, charIndex);
    }, GO_TO_SOURCE_FOCUS_DELAY);
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
