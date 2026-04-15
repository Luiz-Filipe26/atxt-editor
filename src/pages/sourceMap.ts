import * as Atxt from "@atxt";
import { AtxtDocument } from "@/core/atxt/components/atxtDocument";

const GO_TO_SOURCE_FOCUS_DELAY = 100;

interface SourceMapElements {
    input: HTMLTextAreaElement;
    output: AtxtDocument;
}

let currentNodeMap: Map<string, Atxt.IR.IRNodeEntry> = new Map();

export function updateNodeMap(newMap: Map<string, Atxt.IR.IRNodeEntry>) {
    currentNodeMap = newMap;
}

export function initSourceMap(elements: SourceMapElements) {
    const { input, output } = elements;
    const inputMirror = document.createElement("div");
    inputMirror.style.cssText = `
        position: absolute; top: -9999px; left: -9999px;
        white-space: pre-wrap; word-wrap: break-word;
        overflow-wrap: break-word; visibility: hidden;
    `;
    document.body.appendChild(inputMirror);

    const resizeObserver = new ResizeObserver(() => {
        const style = getComputedStyle(input);
        inputMirror.style.width = `${input.clientWidth}px`;
        inputMirror.style.font = style.font;
        inputMirror.style.padding = style.padding;
        inputMirror.style.lineHeight = style.lineHeight;
    });
    resizeObserver.observe(input);

    output.addEventListener("click", (e) => {
        handleOutputClick(e, input, inputMirror);
    });
}

function handleOutputClick(
    event: MouseEvent,
    inputEl: HTMLTextAreaElement,
    inputMirror: HTMLDivElement,
) {
    if (!event.ctrlKey) return;
    const target = event.composedPath()[0];
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
            column += getCharOffsetAtPoint(textNode, event.clientX, event.clientY);
        }
    }

    jumpToEditorPosition(entry.line, column, inputEl, inputMirror);
}

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

function jumpToEditorPosition(
    targetLine: number,
    targetColumn: number,
    inputEl: HTMLTextAreaElement,
    inputMirror: HTMLDivElement,
): void {
    const charIndex = calculateCharIndex(inputEl.value, targetLine, targetColumn);

    setTimeout(() => {
        inputEl.focus({ preventScroll: true });
        inputEl.setSelectionRange(charIndex, charIndex);
        inputEl.scrollTop = getScrollTopForChar(charIndex, inputEl, inputMirror);
        inputEl.classList.remove("caret-active");
        inputEl.offsetWidth;
        inputEl.classList.add("caret-active");
    }, GO_TO_SOURCE_FOCUS_DELAY);
}

function getScrollTopForChar(
    charIndex: number,
    inputEl: HTMLTextAreaElement,
    inputMirror: HTMLDivElement,
): number {
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
