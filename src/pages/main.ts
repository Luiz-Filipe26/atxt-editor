import { AtxtDocument } from "@/core/atxt/components/atxtDocument";
import atxtExample from "./assets/example.atxt?raw";
import * as Atxt from "@atxt";

// ─── Constants ────────────────────────────────────────────────────────────────

const FILES_KEY = "atxt_files";
const CURRENT_KEY = "atxt_current";
const GO_TO_SOURCE_FOCUS_DELAY = 100;
const COMPILE_DEBOUNCE_MS = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AtxtFile {
    name: string;
    content: string;
}

type FileStore = Record<string, AtxtFile>;

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const outputEl = document.querySelector("atxt-document") as AtxtDocument;
const fileSelectEl = document.getElementById("file-select") as HTMLSelectElement;
const errorPanel = document.getElementById("error-panel") as HTMLDivElement;
const errorBadge = document.getElementById("error-badge") as HTMLSpanElement;
const errorList = document.getElementById("error-list") as HTMLDivElement;
const errorHeader = document.getElementById("error-panel-header") as HTMLDivElement;
const zoomInBtn = document.getElementById('btn-zoom-in') as HTMLButtonElement;
const zoomOutBtn = document.getElementById('btn-zoom-out') as HTMLButtonElement;
const zoomLabel = document.getElementById('zoom-level') as HTMLSpanElement;

// ─── Runtime state ────────────────────────────────────────────────────────────

let currentNodeMap: Map<string, Atxt.IR.IRNodeEntry> = new Map();
let currentFileId: string | null = null;

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadStore(): FileStore {
    try {
        return JSON.parse(localStorage.getItem(FILES_KEY) || "{}");
    } catch {
        return {};
    }
}

function saveStore(store: FileStore): void {
    localStorage.setItem(FILES_KEY, JSON.stringify(store));
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── File manager ─────────────────────────────────────────────────────────────

function initFileManager(): void {
    const store = loadStore();
    // Create default file if store is empty
    if (Object.keys(store).length === 0) {
        const id = generateId();
        store[id] = { name: "exemplo", content: atxtExample.replace(/\n$/, "") };
        saveStore(store);
        localStorage.setItem(CURRENT_KEY, id);
    }

    const savedCurrent = localStorage.getItem(CURRENT_KEY);
    const validCurrent = savedCurrent && store[savedCurrent] ? savedCurrent : Object.keys(store)[0];

    renderFileSelect(store, validCurrent);
    loadFile(validCurrent);
}

function renderFileSelect(store: FileStore, selectedId: string): void {
    fileSelectEl.innerHTML = "";
    for (const [id, file] of Object.entries(store)) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = file.name;
        if (id === selectedId) opt.selected = true;
        fileSelectEl.appendChild(opt);
    }
}

function saveCurrentFile(): void {
    if (!currentFileId) return;
    const store = loadStore();
    if (!store[currentFileId]) return;
    store[currentFileId].content = inputEl.value;
    saveStore(store);
}

function loadFile(id: string): void {
    const store = loadStore();
    const file = store[id];
    if (!file) return;

    currentFileId = id;
    localStorage.setItem(CURRENT_KEY, id);
    inputEl.value = file.content;
    runCompiler(file.content);
}

function createFile(): void {
    const name = prompt("Nome do arquivo:", "novo")?.trim();
    if (!name) return;

    saveCurrentFile();

    const store = loadStore();
    const id = generateId();
    store[id] = { name, content: "" };
    saveStore(store);

    renderFileSelect(store, id);
    loadFile(id);
}

function renameCurrentFile(): void {
    if (!currentFileId) return;
    const store = loadStore();
    const file = store[currentFileId];
    if (!file) return;

    const name = prompt("Novo nome:", file.name)?.trim();
    if (!name || name === file.name) return;

    file.name = name;
    saveStore(store);
    renderFileSelect(store, currentFileId);
}

function deleteCurrentFile(): void {
    if (!currentFileId) return;
    const store = loadStore();
    const file = store[currentFileId];
    if (!file) return;
    if (!confirm(`Deletar "${file.name}"?`)) return;

    delete store[currentFileId];

    const remaining = Object.keys(store);
    if (remaining.length === 0) {
        const id = generateId();
        store[id] = { name: "novo", content: "" };
        remaining.push(id);
    }

    saveStore(store);

    const nextId = remaining[0];
    renderFileSelect(store, nextId);
    loadFile(nextId);
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

function runCompiler(source: string): void {
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

        outputEl.renderIr(irDocument);
        currentNodeMap = irDocument.nodeMap;
        renderErrors(allErrors);
    } catch (e) {
        console.error("❌ Critical failure in pipeline:", e);
    }

    console.groupEnd();
}

// ─── Zoom sysmtem ────────────────────────────────────────────────────────────

let currentZoom = 1.0;
function updateZoom(delta: number) {
    currentZoom = Math.min(Math.max(0.2, currentZoom + delta), 5.0);
    outputEl.style.setProperty('--atxt-doc-zoom', currentZoom.toString());
    zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
}

zoomInBtn.addEventListener('click', () => updateZoom(0.1));
zoomOutBtn.addEventListener('click', () => updateZoom(-0.1));

// ─── Error panel ─────────────────────────────────────────────────────────────

function renderErrors(errors: Atxt.CompilerError[]): void {
    const count = errors.length;

    errorBadge.textContent = String(count);
    errorBadge.classList.toggle("no-errors", count === 0);

    if (count === 0) {
        errorList.innerHTML = `<div class="no-errors-msg">Nenhum erro.</div>`;
        if (!errorPanel.classList.contains("collapsed")) {
            errorPanel.classList.add("collapsed");
        }
        return;
    }

    errorList.innerHTML = errors
        .map((e) => {
            const tag = e.type.replace(Atxt.CompilerErrorType.HtmlGenerator, "").toLowerCase();
            const loc = `${e.line}:${e.column}`;
            return `<div class="error-item">
            <span class="error-tag ${tag}">${tag}</span>
            <span class="error-location">${loc}</span>
            <span class="error-message">${escapeHtml(e.message)}</span>
        </div>`;
        })
        .join("");
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

errorHeader.addEventListener("click", () => {
    errorPanel.classList.toggle("collapsed");
});

// ─── Debounce ─────────────────────────────────────────────────────────────────

const debounce = <T extends (...args: any[]) => void>(fn: T, ms = 300) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), ms);
    };
};

// ─── Input handling ───────────────────────────────────────────────────────────

const handleInput = debounce(() => {
    saveCurrentFile();
    runCompiler(inputEl.value);
}, COMPILE_DEBOUNCE_MS);

inputEl.addEventListener("input", handleInput);

// ─── File select ──────────────────────────────────────────────────────────────

fileSelectEl.addEventListener("change", () => {
    const nextId = fileSelectEl.value;
    if (nextId === currentFileId) return;
    saveCurrentFile();
    loadFile(nextId);
});

document.getElementById("btn-new-file")!.addEventListener("click", createFile);
document.getElementById("btn-rename-file")!.addEventListener("click", renameCurrentFile);
document.getElementById("btn-delete-file")!.addEventListener("click", deleteCurrentFile);

// ─── Export buttons ───────────────────────────────────────────────────────────

function downloadBlob(content: string, filename: string): void {
    const blob = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: blob, download: filename });
    a.click();
    URL.revokeObjectURL(blob);
}

document.getElementById("btn-export-raw")!.addEventListener("click", () => {
    const store = loadStore();
    const name = currentFileId ? (store[currentFileId]?.name ?? "documento") : "documento";
    downloadBlob(inputEl.value, `${name}.atxt`);
});

document.getElementById("btn-serialize")!.addEventListener("click", () => {
    const { ir, errors } = Atxt.compileToIR(inputEl.value);
    if (errors.length > 0) console.warn("Serializing IR with errors:", errors);
    const store = loadStore();
    const name = currentFileId ? (store[currentFileId]?.name ?? "documento") : "documento";
    downloadBlob(Atxt.serialize(ir), `${name}.canonical.atxt`);
});

// ─── Source mapping (Ctrl+Click) ──────────────────────────────────────────────

const inputMirror = document.createElement("div");
inputMirror.style.cssText = `
    position: absolute; top: -9999px; left: -9999px;
    white-space: pre-wrap; word-wrap: break-word;
    overflow-wrap: break-word; visibility: hidden;
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

function jumpToEditorPosition(targetLine: number, targetColumn: number): void {
    const charIndex = calculateCharIndex(inputEl.value, targetLine, targetColumn);
    setTimeout(() => {
        inputEl.focus({ preventScroll: true });
        inputEl.setSelectionRange(charIndex, charIndex);
        inputEl.scrollTop = getScrollTopForChar(charIndex);
        inputEl.classList.remove("caret-active");
        inputEl.offsetWidth;
        inputEl.classList.add("caret-active");
    }, GO_TO_SOURCE_FOCUS_DELAY);
}

function getScrollTopForChar(charIndex: number): number {
    const before = document.createElement("span");
    before.textContent = inputEl.value.substring(0, charIndex);
    const cursor = document.createElement("span");
    cursor.textContent = "|";
    inputMirror.replaceChildren(before, cursor);
    return Math.max(0, cursor.offsetTop - inputEl.clientHeight / 2);
}

function calculateCharIndex(text: string, line: number, column: number): number {
    let lineStartIndex = 0;
    for (let i = 1; i < line; i++) {
        lineStartIndex = text.indexOf("\n", lineStartIndex) + 1;
        if (lineStartIndex === 0) break;
    }
    return lineStartIndex + column - 1;
}

(function main() {
    initFileManager();
})();
