import * as IR from "../types/ir";

const INDENT_SIZE = 4;
const INDENT_UNIT = " ".repeat(INDENT_SIZE);

export function serialize(doc: IR.IRDocument): string {
    const lines: string[] = [];

    const definitions = serializeClassDefinitions(doc.classDefinitions);
    if (definitions.length > 0) lines.push(...definitions, "");

    serializeChildren(doc.root.children, lines, 0);

    return lines.join("\n");
}

function serializeClassDefinitions(classDefinitions: Record<string, IR.ResolvedProps>): string[] {
    return sortedEntries(classDefinitions).map(([name, props]) => {
        const propList = sortedEntries(props)
            .map(([k, v]) => `${k}: ${v}`)
            .join("; ");
        return `[[DEFINE class: ${name}; ${propList}]]`;
    });
}

function sortedEntries<T>(record: Record<string, T>): [string, T][] {
    return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}

function serializeChildren(nodes: IR.Node[], lines: string[], depth: number): void {
    let run: (IR.Text | IR.Newline)[] = [];

    const flushRun = () => {
        if (run.length > 0) {
            serializeTextRun(run, lines, indent(depth));
            run = [];
        }
    };

    for (const node of nodes) {
        if (node.type === "TEXT" || node.type === "NEWLINE") {
            run.push(node);
        } else {
            flushRun();
            serializeBlock(node, lines, depth);
        }
    }

    flushRun();
}

function serializeBlock(block: IR.Block, lines: string[], depth: number): void {
    if (block.children.length === 0) return;

    const annotation = buildBlockAnnotation(block);
    const isLeaf = block.children.every((c) => c.type === "TEXT" || c.type === "NEWLINE");

    const header = annotation ? `${indent(depth)}${annotation} {` : `${indent(depth)}{`;
    lines.push(header);
    serializeBlockContent(block.children, isLeaf, lines, depth + 1);
    lines.push(`${indent(depth)}}`);
}

function serializeBlockContent(
    children: IR.Node[],
    isLeaf: boolean,
    lines: string[],
    depth: number,
): void {
    if (isLeaf) {
        serializeTextRun(children as (IR.Text | IR.Newline)[], lines, indent(depth));
    } else {
        serializeChildren(children, lines, depth);
    }
}

function buildBlockAnnotation(block: IR.Block): string | null {
    const parts: string[] = [];

    if (block.classes.length > 0) {
        parts.push(`class: ${block.classes.join(" ")}`);
    }

    for (const [k, v] of sortedEntries(block.ownProps)) {
        parts.push(`${k}: ${v}`);
    }

    if (parts.length === 0) return null;
    return `[[${parts.join("; ")}]]`;
}

function serializeTextRun(
    nodes: (IR.Text | IR.Newline)[],
    lines: string[],
    baseIndent: string,
): void {
    let prevProps: IR.ResolvedProps = {};
    let lineBuffer = baseIndent;

    const flushLine = () => {
        lines.push(lineBuffer === baseIndent ? "" : lineBuffer);
        lineBuffer = baseIndent;
        prevProps = {};
    };

    for (const node of nodes) {
        if (node.type === "NEWLINE") {
            flushLine();
            continue;
        }
        const toggles = buildToggles(prevProps, node.props);
        if (toggles) lineBuffer += toggles;
        lineBuffer += node.content;
        prevProps = node.props;
    }

    if (lineBuffer !== baseIndent) lines.push(lineBuffer);
}

function buildToggles(prev: IR.ResolvedProps, next: IR.ResolvedProps): string | null {
    const added: string[] = [];
    const removed: string[] = [];

    for (const [k, v] of sortedEntries(next)) {
        if (prev[k] !== v) added.push(`+${k}: ${v}`);
    }

    for (const [k] of sortedEntries(prev)) {
        if (!(k in next)) removed.push(`-${k}`);
    }

    const parts = [...added, ...removed];
    if (parts.length === 0) return null;
    return `[[${parts.join("; ")}]]`;
}

function indent(depth: number): string {
    return INDENT_UNIT.repeat(depth);
}
