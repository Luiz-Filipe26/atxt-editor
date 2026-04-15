import * as Atxt from "@atxt";
import { dom } from "./domProvider";
import { downloadBlob, debounce } from "./utils";
import * as FileManager from "./fileManager";
import { runCompiler } from "./compilerRunner";
import { initSourceMap, updateNodeMap } from "./sourceMap";
import { toggleErrorPanel, renderErrors } from "./errorPanelManager";

const COMPILE_DEBOUNCE_MS = 100;

let currentZoom = 1.0;
function updateZoom(delta: number) {
    currentZoom = Math.min(Math.max(0.2, currentZoom + delta), 5.0);
    dom.output.style.setProperty("--atxt-doc-zoom", currentZoom.toString());
    dom.zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
}

function compileCurrentSource(source: string) {
    runCompiler(source, (ir, errors) => {
        if (ir) {
            dom.output.renderIr(ir);
            updateNodeMap(ir.nodeMap);
        }
        renderErrors(errors, dom);
    });
}

function handleExportRaw() {
    const file = FileManager.getCurrentFile();
    const name = file ? file.name : "documento";
    downloadBlob(dom.input.value, `${name}.atxt`);
}

function handleSerialize() {
    const file = FileManager.getCurrentFile();
    const name = file ? file.name : "documento";
    const { ir, errors } = Atxt.compileToIR(dom.input.value);
    if (errors.length > 0) {
        alert("Não é possível serializar um documento com erros de compilação.");
        return;
    }
    downloadBlob(Atxt.serialize(ir), `${name}.canonical.atxt`);
}

function main() {
    initSourceMap(dom);

    dom.errorHeader.addEventListener("click", () => {
        toggleErrorPanel(dom);
    });

    const updateInputAndOutput = (content: string | null) => {
        if (content === null) return;
        dom.input.value = content;
        compileCurrentSource(content);
    };

    const onStoreChange = (store: FileManager.FileStore) => {
        FileManager.renderFileSelect(dom.fileSelect, store);
    };

    const initialContent = FileManager.bootFileManager(onStoreChange);
    updateInputAndOutput(initialContent);

    const handleInput = debounce(() => {
        FileManager.saveCurrentFile(dom.input.value);
        compileCurrentSource(dom.input.value);
    }, COMPILE_DEBOUNCE_MS);

    dom.input.addEventListener("input", handleInput);

    dom.zoomInBtn.addEventListener("click", () => updateZoom(0.1));
    dom.zoomOutBtn.addEventListener("click", () => updateZoom(-0.1));

    dom.fileSelect.addEventListener("change", () => {
        const content = FileManager.loadFile(dom.fileSelect.value, dom.input.value);
        updateInputAndOutput(content);
    });

    dom.btnNewFile.addEventListener("click", () => {
        const content = FileManager.createFile(dom.input.value);
        updateInputAndOutput(content);
    });

    dom.btnDeleteFile.addEventListener("click", () => {
        const content = FileManager.deleteCurrentFile();
        updateInputAndOutput(content);
    });

    dom.btnRenameFile.addEventListener("click", () => {
        FileManager.renameCurrentFile();
    });

    dom.btnExportRaw.addEventListener("click", handleExportRaw);
    dom.btnSerialize.addEventListener("click", handleSerialize);
}

main();
