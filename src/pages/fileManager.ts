import atxtExample from "./assets/example.atxt?raw";

const FILES_KEY = "atxt_files";
const CURRENT_KEY = "atxt_current";

export interface AtxtFile {
    id: string;
    name: string;
    content: string;
}

export type FileStore = Record<string, AtxtFile>;

export type OnStoreChangeFn = (store: FileStore) => void;

let currentFile: AtxtFile | null = null;
let notifyStoreChange: OnStoreChangeFn = () => { };

export function getCurrentFile(): AtxtFile | null {
    return currentFile;
}

export function bootFileManager(onStoreChange: OnStoreChangeFn): string {
    const store = loadStore();

    if (Object.keys(store).length === 0) {
        const id = generateId();
        store[id] = { id, name: "exemplo", content: atxtExample.replace(/\n$/, "") };
        saveStore(store);
        localStorage.setItem(CURRENT_KEY, id);
    }

    const savedCurrent = localStorage.getItem(CURRENT_KEY);
    const validCurrent = savedCurrent && store[savedCurrent] ? savedCurrent : Object.keys(store)[0];

    currentFile = store[validCurrent];

    notifyStoreChange = onStoreChange;
    notifyStoreChange(store);

    return currentFile.content;
}

export function loadFile(nextId: string, currentContent: string): string | null {
    if (!currentFile || nextId === currentFile.id) return null;

    const store = loadStore();
    saveCurrent(currentContent, store);

    if (!store[nextId]) return null;

    currentFile = store[nextId];
    localStorage.setItem(CURRENT_KEY, nextId);
    return currentFile.content;
}

export function createFile(currentContent: string): string | null {
    const name = prompt("Nome do arquivo:", "novo")?.trim();
    if (!name) return null;

    const store = loadStore();
    saveCurrent(currentContent, store);

    const id = generateId();
    const newFile: AtxtFile = { id, name, content: "" };
    store[id] = newFile;
    saveStore(store);

    currentFile = newFile;
    localStorage.setItem(CURRENT_KEY, id);

    notifyStoreChange(store);
    return currentFile.content;
}

export function renameCurrentFile(): void {
    if (!currentFile) return;

    const name = prompt("Novo nome:", currentFile.name)?.trim();
    if (!name || name === currentFile.name) return;

    currentFile.name = name;

    const store = loadStore();
    store[currentFile.id].name = name;
    saveStore(store);

    notifyStoreChange(store);
}

export function deleteCurrentFile(): string | null {
    if (!currentFile) return null;
    if (!confirm(`Deletar "${currentFile.name}"?`)) return null;

    const store = loadStore();
    delete store[currentFile.id];

    const remaining = Object.values(store);
    if (remaining.length === 0) {
        const id = generateId();
        store[id] = { id, name: "novo", content: "" };
        remaining.push(store[id]);
    }

    saveStore(store);

    currentFile = remaining[0];
    localStorage.setItem(CURRENT_KEY, currentFile.id);

    notifyStoreChange(store);
    return currentFile.content;
}

function loadStore(): FileStore {
    try {
        return JSON.parse(localStorage.getItem(FILES_KEY) || "{}");
    } catch {
        return {};
    }
}

export function saveCurrentFile(content: string): void {
    if (!currentFile) return;
    currentFile.content = content;
    const store = loadStore();
    store[currentFile.id] = currentFile;
    saveStore(store);
}

function saveCurrent(content: string, store: FileStore): void {
    if (!currentFile) return;
    currentFile.content = content;
    store[currentFile.id] = currentFile;
    saveStore(store);
}

function saveStore(store: FileStore): void {
    localStorage.setItem(FILES_KEY, JSON.stringify(store));
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function renderFileSelect(selectEl: HTMLSelectElement, store: FileStore): void {
    selectEl.innerHTML = "";
    const selectedId = currentFile?.id;

    for (const [id, file] of Object.entries(store)) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = file.name;
        if (id === selectedId) opt.selected = true;
        selectEl.appendChild(opt);
    }
}
