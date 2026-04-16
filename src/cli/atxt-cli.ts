import * as fs from "node:fs";
import * as readline from "node:readline";
import * as path from "node:path";
import * as Atxt from "@atxt";
import { Mutator } from "@/core/atxt/compiler/mutator";
import type { MutationIntent } from "@/core/atxt/types/mutationIntent";
import type { IRDelta } from "@/core/atxt/types/mutationDelta";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const filePath = process.argv[2];
if (!filePath) {
    console.error("Uso: tsx src/cli/atxt-cli.ts <arquivo.atxt>");
    process.exit(1);
}

let source: string;
try {
    source = fs.readFileSync(filePath, "utf-8");
} catch {
    console.error(`Erro ao ler: ${filePath}`);
    process.exit(1);
}

const { ir: initialIr, errors: initialErrors } = Atxt.compileToIR(source);
if (initialErrors.length > 0) {
    console.warn(`⚠  Compilado com ${initialErrors.length} erro(s):`);
    for (const e of initialErrors) {
        console.warn(`   [${e.type}] ${e.line}:${e.column}  ${e.message}`);
    }
}

let doc = initialIr;
console.log(`\n✓  ${path.basename(filePath)}  —  ${doc.nodeMap.size} nós no IR`);
printHelp();

// ── REPL ─────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\natxt> ",
});
rl.prompt();

rl.on("line", (raw) => {
    const line = raw.trim();
    if (!line) {
        rl.prompt();
        return;
    }

    const [cmd, ...rest] = line.split(/\s+/);

    switch (cmd) {
        case "list":
            cmdList();
            break;
        case "set":
            cmdSet(rest);
            break;
        case "insert":
            cmdInsert(rest);
            break;
        case "delete":
            cmdDelete(rest);
            break;
        case "block":
            cmdBlock(rest);
            break;
        case "serial":
            cmdSerialize();
            break;
        case "reload":
            cmdReload();
            break;
        case "help":
            printHelp();
            break;
        case "quit":
        case "exit":
            process.exit(0);
        default:
            console.log(`Comando desconhecido: '${cmd}'. Digite 'help'.`);
    }

    rl.prompt();
});

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdList(): void {
    const visit = (node: Atxt.IR.Node, depth: number) => {
        const pad = "  ".repeat(depth);
        const shortId = node.id.slice(0, 8);

        if (node.type === Atxt.IR.NodeType.Block) {
            const block = node as Atxt.IR.Block;
            const kind = block.props.get("kind") ?? "block";
            const propSummary =
                block.props.size > 0
                    ? `  {${[...block.props.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}}`
                    : "";
            console.log(`${pad}[BLOCK] ${shortId}…  kind=${kind}${propSummary}`);
            for (const child of block.children) visit(child, depth + 1);
        } else if (node.type === Atxt.IR.NodeType.Text) {
            const text = node as Atxt.IR.Text;
            const content = JSON.stringify(text.content);
            const propSummary =
                text.props.size > 0
                    ? `  {${[...text.props.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}}`
                    : "";
            console.log(`${pad}[TEXT ] ${shortId}…  ${content}${propSummary}`);
        } else {
            console.log(`${pad}[NL   ] ${node.id.slice(0, 8)}…`);
        }
    };
    visit(doc.root, 0);
}

// set <startId> <sOff> <endId> <eOff> <prop> <valor>
function cmdSet(args: string[]): void {
    if (args.length < 6) {
        console.log("Uso: set <startId> <sOff> <endId> <eOff> <prop> <valor>");
        return;
    }
    const [sId, sOff, eId, eOff, prop, value] = args;
    const startNodeId = resolveId(sId);
    const endNodeId = resolveId(eId);
    if (!startNodeId || !endNodeId) return;

    applyAndPrint({
        type: "MUTATE_RANGE",
        startNodeId,
        startOffset: parseInt(sOff, 10),
        endNodeId,
        endOffset: parseInt(eOff, 10),
        payload: { action: "SET_PROPERTIES", props: new Map([[prop, value]]) },
    });
}

// insert <nodeId> <offset> <texto com \n literal>
function cmdInsert(args: string[]): void {
    if (args.length < 3) {
        console.log("Uso: insert <nodeId> <offset> <texto>");
        return;
    }
    const [nodeId, offsetStr, ...textParts] = args;
    const id = resolveId(nodeId);
    if (!id) return;

    const literal = textParts.join(" ").replace(/\\n/g, "\n");
    const offset = parseInt(offsetStr, 10);

    applyAndPrint({
        type: "MUTATE_RANGE",
        startNodeId: id,
        startOffset: offset,
        endNodeId: id,
        endOffset: offset,
        payload: { action: "INSERT_TEXT", literal },
    });
}

// delete <startId> <sOff> <endId> <eOff>
function cmdDelete(args: string[]): void {
    if (args.length < 4) {
        console.log("Uso: delete <startId> <sOff> <endId> <eOff>");
        return;
    }
    const [sId, sOff, eId, eOff] = args;
    const startNodeId = resolveId(sId);
    const endNodeId = resolveId(eId);
    if (!startNodeId || !endNodeId) return;

    applyAndPrint({
        type: "MUTATE_RANGE",
        startNodeId,
        startOffset: parseInt(sOff, 10),
        endNodeId,
        endOffset: parseInt(eOff, 10),
        payload: { action: "DELETE" },
    });
}

// block <blockId> set <prop> <valor>
// block <blockId> delete
function cmdBlock(args: string[]): void {
    if (args.length < 2) {
        console.log("Uso: block <blockId> set <prop> <valor>");
        console.log("     block <blockId> delete");
        return;
    }
    const [blockId, action, prop, value] = args;
    const id = resolveId(blockId);
    if (!id) return;

    if (action === "delete") {
        applyAndPrint({ type: "MUTATE_BLOCK", targetId: id, payload: { action: "DELETE" } });
    } else if (action === "set" && prop && value) {
        applyAndPrint({
            type: "MUTATE_BLOCK",
            targetId: id,
            payload: { action: "SET_PROPERTIES", props: new Map([[prop, value]]) },
        });
    } else {
        console.log("Ação inválida. Use 'set <prop> <valor>' ou 'delete'.");
    }
}

function cmdSerialize(): void {
    const canonical = Atxt.serialize(doc);
    const bar = "─".repeat(56);
    console.log(`\n${bar}\n${canonical}\n${bar}`);
}

function cmdReload(): void {
    try {
        source = fs.readFileSync(filePath, "utf-8");
        const result = Atxt.compileToIR(source);
        doc = result.ir;
        console.log(`✓  Recarregado. ${doc.nodeMap.size} nós.`);
    } catch {
        console.error("Erro ao recarregar o arquivo.");
    }
}

// ── Plumbing ─────────────────────────────────────────────────────────────────

function applyAndPrint(intent: MutationIntent): void {
    const delta = Mutator.mutate(doc, intent);
    printDelta(delta);
}

function printDelta(delta: IRDelta): void {
    const bar = "─".repeat(56);
    console.log(`\n${bar}`);

    if (!delta.deletedNodes.length && !delta.createdNodes.length && !delta.updatedNodes.length) {
        console.log("  (sem alterações)");
    }

    if (delta.deletedNodes.length) {
        console.log(
            `  Deletados   (${delta.deletedNodes.length}): ${delta.deletedNodes.map(short).join("  ")}`,
        );
    }

    if (delta.createdNodes.length) {
        console.log(`  Criados     (${delta.createdNodes.length}):`);
        for (const c of delta.createdNodes) {
            const preview =
                c.node.type === Atxt.IR.NodeType.Text
                    ? JSON.stringify((c.node as Atxt.IR.Text).content)
                    : `[${c.node.type}]`;
            console.log(`    idx=${c.index}  parent=${short(c.parentId)}  ${preview}`);
        }
    }

    if (delta.updatedNodes.length) {
        console.log(`  Atualizados (${delta.updatedNodes.length}):`);
        for (const u of delta.updatedNodes) {
            const parts: string[] = [short(u.id)];
            if (u.newContent !== undefined) parts.push(`content=${JSON.stringify(u.newContent)}`);
            if (u.newProps) parts.push(`props={${[...u.newProps.keys()].join(",")}}`);
            console.log(`    ${parts.join("  ")}`);
        }
    }

    console.log(bar);
}

function resolveId(prefix: string): string | null {
    if (doc.nodeMap.has(prefix)) return prefix;
    const matches = [...doc.nodeMap.keys()].filter((id) => id.startsWith(prefix));
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) {
        console.error(`ID não encontrado: ${prefix}`);
        return null;
    }
    console.error(`Prefixo ambíguo: '${prefix}' (${matches.length} matches)`);
    return null;
}

function short(id: string): string {
    return id.slice(0, 8) + "…";
}

function printHelp(): void {
    console.log(`
  list                                         lista os nós da árvore IR
  set  <sId> <sOff> <eId> <eOff> <prop> <v>   aplica propriedade inline no range
  insert <nodeId> <offset> <texto>             insere texto (\\\\n → IR.Newline)
  delete <sId> <sOff> <eId> <eOff>            deleta conteúdo no range
  block  <blockId> set <prop> <valor>          aplica propriedade de bloco
  block  <blockId> delete                      remove bloco da árvore
  serial                                       imprime o .atxt canônico atual
  reload                                       recarrega o arquivo do disco
  help                                         exibe esta ajuda
  quit / exit                                  sai

  IDs aceitam prefixos (mínimo 4 chars) desde que não sejam ambíguos.`);
}
