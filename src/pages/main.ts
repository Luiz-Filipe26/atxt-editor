import { AtxtDocument } from "@/core/atxt/components/atxtDocument";
import atxtExample from "./assets/example.atxt?raw";
import * as Atxt from "@atxt";

const STORAGE_KEY = "atxt_saved_content";
const GO_TO_SOURCE_FOCUS_DELAY = 100;
const COMPILE_DEBOUNCE_TIME = 100;

const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const outputEl = document.querySelector("atxt-document") as AtxtDocument;

let currentNodeMap: Map<string, Atxt.IR.IRNodeEntry> = new Map();

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

        outputEl.renderIr(irDocument);
        currentNodeMap = irDocument.nodeMap;
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

const inputMirror = document.createElement("div");
inputMirror.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    visibility: hidden;
`;
document.body.appendChild(inputMirror);
const resizeObserver = new ResizeObserver(() => {
    const style = getComputedStyle(inputEl);
    inputMirror.style.width = `${inputEl.clientWidth}px`;
    inputMirror.style.font = style.font;
    inputMirror.style.padding = style.padding;
    inputMirror.style.lineHeight = style.lineHeight;
});

resizeObserver.observe(inputEl);

outputEl.addEventListener("click", (e) => {
    if (!e.ctrlKey) return;
    const target = e.composedPath()[0];
    if (!(target instanceof Element)) return;
    const mappedEl = target.closest("[data-id]");
    if (!(mappedEl instanceof HTMLElement)) return;
    const id = mappedEl.dataset.id!;
    const entry = currentNodeMap.get(id);
    if (!entry) return;
    let column = entry.column;
    if (entry.node.type === Atxt.IR.NodeType.Text) {
        const textNode = target.childNodes[0];
        if (textNode instanceof Text) {
            column += getCharOffsetAtPoint(textNode, e.clientX, e.clientY);
        }
    }
    jumpToEditorPosition(entry.line, column);
});

function getCharOffsetAtPoint(textNode: Text, clientX: number, clientY: number): number {
    const range = document.createRange();
    const length = textNode.textContent?.length ?? 0;
    for (let i = 0; i < length; i++) {
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return 0;
        if (clientY <= rect.bottom && clientX <= rect.right) return i;
    }
    return length;
}

function jumpToEditorPosition(targetLine: number, targetColumn: number) {
    const charIndex = calculateCharIndex(inputEl.value, targetLine, targetColumn);
    setTimeout(() => {
        inputEl.focus({ preventScroll: true });
        inputEl.setSelectionRange(charIndex, charIndex);
        inputEl.scrollTop = getScrollTopForChar(charIndex);
        inputEl.classList.remove("caret-active");
        inputEl.offsetWidth; // use getter to force reflow and restart animation
        inputEl.classList.add("caret-active");
    }, GO_TO_SOURCE_FOCUS_DELAY);
}

function getScrollTopForChar(charIndex: number): number {
    const before = document.createElement("span");
    before.textContent = inputEl.value.substring(0, charIndex);
    const cursor = document.createElement("span");
    cursor.textContent = "|";

    inputMirror.replaceChildren(before, cursor);

    const scrollTop = cursor.offsetTop - inputEl.clientHeight / 2;
    return Math.max(0, scrollTop);
}

function calculateCharIndex(text: string, line: number, column: number): number {
    let lineStartIndex = 0;
    for (let i = 1; i < line; i++) {
        lineStartIndex = text.indexOf("\n", lineStartIndex) + 1;
        if (lineStartIndex === 0) break;
    }
    return lineStartIndex + column - 1;
}
