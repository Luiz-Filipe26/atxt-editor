export function downloadBlob(content: string, filename: string): void {
    const blob = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: blob, download: filename });
    a.click();
    URL.revokeObjectURL(blob);
}

type AnyFunction = (...args: any[]) => void;
export function debounce<T extends AnyFunction>(fn: T, ms = 300) {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), ms);
    };
}

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
