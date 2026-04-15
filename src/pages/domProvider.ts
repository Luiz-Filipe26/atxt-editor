import { AtxtDocument } from "@/core/atxt/components/atxtDocument";

function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Elemento ausente no HTML: ${id}`);
    return element as T;
}

function queryElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Seletor ausente no HTML: ${selector}`);
    return element as T;
}

export const dom = {
    input: getElement<HTMLTextAreaElement>("input"),
    output: queryElement<AtxtDocument>("atxt-document"),
    fileSelect: getElement<HTMLSelectElement>("file-select"),
    
    // Error Panel
    errorPanel: getElement<HTMLDivElement>("error-panel"),
    errorBadge: getElement<HTMLSpanElement>("error-badge"),
    errorList: getElement<HTMLDivElement>("error-list"),
    errorHeader: getElement<HTMLDivElement>("error-panel-header"),
    
    // Zoom
    zoomInBtn: getElement<HTMLButtonElement>("btn-zoom-in"),
    zoomOutBtn: getElement<HTMLButtonElement>("btn-zoom-out"),
    zoomLabel: getElement<HTMLSpanElement>("zoom-level"),
    
    // File Controls
    btnNewFile: getElement<HTMLButtonElement>("btn-new-file"),
    btnRenameFile: getElement<HTMLButtonElement>("btn-rename-file"),
    btnDeleteFile: getElement<HTMLButtonElement>("btn-delete-file"),
    
    // Export Controls
    btnExportRaw: getElement<HTMLButtonElement>("btn-export-raw"),
    btnSerialize: getElement<HTMLButtonElement>("btn-serialize"),
};
