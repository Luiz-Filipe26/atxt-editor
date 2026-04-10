import * as IR from "../types/ir";
import { sortedMapEntries } from "../utils/mapUtils";

const INDENT_SIZE = 4;
const INDENT_UNIT = " ".repeat(INDENT_SIZE);

export function serialize(document: IR.IRDocument): string {
    const lines: string[] = [];

    const definitions = serializeClassDefinitions(document.classDefinitions);
    if (definitions.length > 0) lines.push(...definitions, "");

    serializeChildren(document.root.children, lines, 0);

    return lines.join("\n");
}

function serializeClassDefinitions(classDefinitions: Map<string, IR.ResolvedProps>): string[] {
    return sortedMapEntries(classDefinitions).map(([name, props]) => {
        const propList = sortedMapEntries(props)
            .map(([key, value]) => `${key}: ${value}`)
            .join("; ");
        return `[[DEFINE class: ${name}; ${propList}]]`;
    });
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
    const prefix = indent(depth);

    lines.push(annotation ? `${prefix}${annotation} {` : `${prefix}{`);
    serializeChildren(block.children, lines, depth + 1);
    lines.push(`${prefix}}`);
}

function buildBlockAnnotation(block: IR.Block): string | null {
    const parts: string[] = [];

    if (block.classes.length > 0) {
        parts.push(`class: ${block.classes.join(" ")}`);
    }

    for (const [key, value] of sortedMapEntries(block.ownProps)) {
        parts.push(`${key}: ${value}`);
    }

    if (parts.length === 0) return null;
    return `[[${parts.join("; ")}]]`;
}

function serializeTextRun(nodes: IR.Node[], lines: string[], baseIndent: string): void {
    let prevProps: IR.ResolvedProps | null = null;
    let lineBuffer = baseIndent;

    const flushLine = () => {
        lines.push(lineBuffer === baseIndent ? "" : lineBuffer);
        lineBuffer = baseIndent;
        prevProps = null;
    };

    for (const node of nodes) {
        if (node.type === "NEWLINE") {
            flushLine();
            continue;
        }
        /* v8 ignore next -- @preserve */
        if (node.type !== "TEXT") continue;
        const toggles = buildToggles(prevProps, node.props);
        if (toggles) lineBuffer += toggles;
        lineBuffer += node.content;
        prevProps = node.props;
    }

    if (lineBuffer !== baseIndent) lines.push(lineBuffer);
}

function buildToggles(prev: IR.ResolvedProps | null, next: IR.ResolvedProps): string | null {
    const added: string[] = [];
    const removed: string[] = [];

    for (const [key, value] of sortedMapEntries(next)) {
        if (prev?.get(key) !== value) added.push(`+${key}: ${value}`);
    }

    if (prev) {
        for (const [key] of sortedMapEntries(prev)) {
            if (!next.has(key)) removed.push(`-${key}`);
        }
    }

    const parts = [...added, ...removed];
    if (parts.length === 0) return null;
    return `[[${parts.join("; ")}]]`;
}

function indent(depth: number): string {
    return INDENT_UNIT.repeat(depth);
}
