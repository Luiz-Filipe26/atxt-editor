import * as Atxt from "@atxt";
import { escapeHtml } from "./utils";

export interface ErrorPanelElements {
    errorPanel: HTMLDivElement;
    errorBadge: HTMLSpanElement;
    errorList: HTMLDivElement;
}

const TAG_LABELS: Record<Atxt.CompilerErrorType, string> = {
    [Atxt.CompilerErrorType.Lexer]: "lexer",
    [Atxt.CompilerErrorType.Parser]: "parser",
    [Atxt.CompilerErrorType.Lowerer]: "lowerer",
    [Atxt.CompilerErrorType.HtmlGenerator]: "html",
};

export function toggleErrorPanel(elements: ErrorPanelElements): void {
    elements.errorPanel.classList.toggle("collapsed");
}

export function renderErrors(errors: Atxt.CompilerError[], elements: ErrorPanelElements): void {
    const count = errors.length;

    elements.errorBadge.textContent = `${count}`;
    elements.errorBadge.classList.toggle("no-errors", count === 0);

    if (count === 0) {
        elements.errorList.innerHTML = `<div class="no-errors-msg">Nenhum erro.</div>`;
        if (!elements.errorPanel.classList.contains("collapsed")) {
            elements.errorPanel.classList.add("collapsed");
        }
        return;
    }

    elements.errorList.innerHTML = errors
        .map((e) => {
            const tag: string = TAG_LABELS[e.type];
            const loc = `${e.line}:${e.column}`;
            return `<div class="error-item">
                <span class="error-tag ${tag}">${tag}</span>
                <span class="error-location">${loc}</span>
                <span class="error-message">${escapeHtml(e.message)}</span>
            </div>`;
        })
        .join("");
}
