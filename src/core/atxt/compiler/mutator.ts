import * as IR from "../types/ir";
import { getPropertyDefinition, PropertyScope } from "../domain/propertyDefinitions";
import { buildTextNode, buildNewlineNode } from "./irBuilders";
import {
    type MutationIntent,
    type MutateRangeIntent,
    type MutateBlockIntent,
    MutationType,
    MutationAction,
} from "../types/mutationIntent";
import { type IRDelta, type CreatedNodeEntry } from "../types/mutationDelta";
import type { SourceLocation } from "../types/location";
import { DeltaTracker } from "./deltaTracker";

interface NodeTarget {
    node: IR.Text;
    parent: IR.Block;
    index: number;
}

interface RangeContext {
    parent: IR.Block;
    startNode: IR.Text;
    endNode: IR.Text;
    startIdx: number;
    endIdx: number;
}

export class Mutator {
    private readonly doc: IR.IRDocument;
    private readonly parentMap: Map<string, IR.Block>;
    private readonly tracker: DeltaTracker;

    private constructor(doc: IR.IRDocument) {
        this.doc = doc;
        this.parentMap = this.buildParentMap();
        this.tracker = new DeltaTracker();
    }

    public static mutate(doc: IR.IRDocument, intent: MutationIntent): IRDelta {
        return new Mutator(doc).mutate(intent);
    }

    private mutate(intent: MutationIntent): IRDelta {
        if (intent.type === MutationType.MutateRange) {
            this.handleMutateRange(intent);
        } else if (intent.type === MutationType.MutateBlock) {
            this.handleMutateBlock(intent);
        }

        const raw = this.tracker.collect();

        const createdNodes: CreatedNodeEntry[] = raw.pendingNodes.map((p) => {
            const parent = this.parentMap.get(p.parentId);
            const index = parent ? parent.children.indexOf(p.node) : -1;
            return { ...p, index };
        });

        return {
            deletedNodes: raw.deletedNodes,
            updatedNodes: raw.updatedNodes,
            createdNodes,
        };
    }

    // ── Operações de Bloco ───────────────────────────────────────────────────

    private handleMutateBlock(intent: MutateBlockIntent): void {
        const entry = this.doc.nodeMap.get(intent.targetId);
        if (entry?.node.type !== IR.NodeType.Block) return;
        const block = entry.node as IR.Block;

        if (intent.payload.action === MutationAction.SetProperties) {
            this.applyBlockProperties(block, intent.payload.props);
        } else if (intent.payload.action === MutationAction.Delete) {
            this.deleteBlock(intent.targetId, block);
        }
    }

    private applyBlockProperties(block: IR.Block, props: IR.ResolvedProps): void {
        const blockProps = this.filterByScope(props, PropertyScope.Block);
        for (const [key, value] of blockProps) block.props.set(key, value);
        this.tracker.recordUpdate(block.id, { newProps: new Map(block.props) });
    }

    private deleteBlock(targetId: string, block: IR.Block): void {
        const parent = this.parentMap.get(targetId);
        const idx = parent?.children.indexOf(block) ?? -1;
        if (parent && idx !== -1) {
            this.swapNodes(parent, { index: idx, count: 1 }, [], this.locOf(targetId));
        }
    }

    // ── Operações de Range ───────────────────────────────────────────────────

    private handleMutateRange(intent: MutateRangeIntent): void {
        const parent = this.parentMap.get(intent.startNodeId);
        if (!parent || parent !== this.parentMap.get(intent.endNodeId)) return;

        switch (intent.payload.action) {
            case MutationAction.SetProperties:
                this.handleSetProperties(intent, parent);
                break;
            case MutationAction.InsertText:
                this.handleReplaceText(intent, parent, intent.payload.literal);
                break;
            case MutationAction.Delete:
                this.handleReplaceText(intent, parent, "");
                break;
        }

        this.normalize(parent);
    }

    private handleReplaceText(intent: MutateRangeIntent, parent: IR.Block, literal: string): void {
        const ctx = this.resolveRangeContext(intent, parent);
        if (!ctx) return;

        const mergedLiteral = this.buildMergedLiteral(intent, ctx, literal);
        let newNodes: IR.Node[] = [];

        if (mergedLiteral.length > 0) {
            // Nodes criados aqui ainda não estão registrados, não têm loc vinculada neles.
            newNodes = this.buildNodesFromLiteral(mergedLiteral, ctx.startNode.props);
        }

        this.swapNodes(
            parent,
            { index: ctx.startIdx, count: ctx.endIdx - ctx.startIdx + 1 },
            newNodes,
            this.locOf(ctx.startNode.id), // Passa a origem explicitamente!
        );
    }

    private handleSetProperties(intent: MutateRangeIntent, parent: IR.Block): void {
        if (intent.payload.action !== MutationAction.SetProperties) return;
        const ctx = this.resolveRangeContext(intent, parent);
        if (!ctx) return;

        const inlineProps = this.filterByScope(intent.payload.props, PropertyScope.Inline);

        if (ctx.startNode === ctx.endNode) {
            this.sliceAndApplyProps(
                { node: ctx.startNode, parent, index: ctx.startIdx },
                { start: intent.startOffset, end: intent.endOffset },
                inlineProps,
            );
        } else {
            this.applyMultiNodeProps(ctx, intent, inlineProps);
        }
    }

    private applyMultiNodeProps(
        ctx: RangeContext,
        intent: MutateRangeIntent,
        props: IR.ResolvedProps,
    ): void {
        const { parent, startNode, endNode, startIdx, endIdx } = ctx;

        /**
         * IMPORTANTE: Processamos do fim para o início (Reverse Order).
         * Isso garante que o fatiamento (slicing) dos nós à esquerda não altere
         * os índices dos nós à direita que ainda precisam ser processados.
         */

        // 1. Fim
        this.sliceAndApplyProps(
            { node: endNode, parent, index: endIdx },
            { start: 0, end: intent.endOffset },
            props,
        );

        // 2. Meio (nós inteiros permanecem com índices estáveis enquanto processamos à direita)
        for (let i = startIdx + 1; i < endIdx; i++) {
            this.applyPropsInPlace(parent.children[i], props);
        }

        // 3. Início
        this.sliceAndApplyProps(
            { node: startNode, parent, index: startIdx },
            { start: intent.startOffset, end: startNode.content.length },
            props,
        );
    }

    // ── Lógica Core de Fatiamento (Slicing) ──────────────────────────────────

    private sliceAndApplyProps(
        target: NodeTarget,
        range: { start: number; end: number },
        props: IR.ResolvedProps,
    ): void {
        const { node, parent, index } = target;

        if (range.start === 0 && range.end === node.content.length) {
            this.applyPropsInPlace(node, props);
            return;
        }

        const replacements = this.buildReplacements(node, range, props);
        this.swapNodes(parent, { index, count: 1 }, replacements, this.locOf(node.id));
    }

    private buildReplacements(
        node: IR.Text,
        range: { start: number; end: number },
        props: IR.ResolvedProps,
    ): IR.Node[] {
        const before = node.content.slice(0, range.start);
        const targetText = node.content.slice(range.start, range.end);
        const after = node.content.slice(range.end);

        const mergedProps = this.mergeProps(node.props, props);
        const repl: IR.Node[] = [];

        if (before) repl.push(buildTextNode(this.nextId(), node.props, before));
        if (targetText) repl.push(buildTextNode(this.nextId(), mergedProps, targetText));
        if (after) repl.push(buildTextNode(this.nextId(), node.props, after));

        return repl;
    }

    private applyPropsInPlace(node: IR.Node, props: IR.ResolvedProps): void {
        if (node.type !== IR.NodeType.Text) return;
        const textNode = node as IR.Text;
        textNode.props = this.mergeProps(textNode.props, props);
        this.tracker.recordUpdate(textNode.id, { newProps: new Map(textNode.props) });
    }

    // ── Normalização ─────────────────────────────────────────────────────────

    private normalize(block: IR.Block): void {
        let i = 0;
        while (i < block.children.length - 1) {
            if (this.tryMergeAdjacentTexts(block, i)) continue;
            i++;
        }
    }

    private tryMergeAdjacentTexts(parent: IR.Block, index: number): boolean {
        const curr = parent.children[index];
        const next = parent.children[index + 1];

        if (curr.type !== IR.NodeType.Text || next.type !== IR.NodeType.Text) return false;

        const tCurr = curr as IR.Text;
        const tNext = next as IR.Text;
        if (!this.propsEqual(tCurr.props, tNext.props)) return false;

        tCurr.content += tNext.content;

        // Remove tNext passando a loc original de tCurr
        this.swapNodes(parent, { index: index + 1, count: 1 }, [], this.locOf(tCurr.id));
        this.tracker.recordUpdate(tCurr.id, { newContent: tCurr.content });
        return true;
    }

    // ── Utilitários & Plumbing ───────────────────────────────────────────────

    private swapNodes(
        parent: IR.Block,
        splice: { index: number; count: number },
        newNodes: IR.Node[],
        loc: SourceLocation,
    ): void {
        const removed = parent.children.splice(splice.index, splice.count, ...newNodes);
        for (const n of removed) this.unregister(n);

        // Agora sim a SourceLocation correta é propagada
        newNodes.forEach((n) => this.register(n, parent, loc));
    }

    private resolveRangeContext(intent: MutateRangeIntent, parent: IR.Block): RangeContext | null {
        const startNode = this.getTextNode(intent.startNodeId);
        const endNode = this.getTextNode(intent.endNodeId);
        if (!startNode || !endNode) return null;

        const startIdx = parent.children.indexOf(startNode);
        const endIdx = parent.children.indexOf(endNode);
        if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return null;

        return { parent, startNode, endNode, startIdx, endIdx };
    }

    private buildMergedLiteral(
        intent: MutateRangeIntent,
        ctx: RangeContext,
        insert: string,
    ): string {
        const prefix = ctx.startNode.content.slice(0, intent.startOffset);
        const suffix = ctx.endNode.content.slice(intent.endOffset);
        return prefix + insert + suffix;
    }

    private buildNodesFromLiteral(literal: string, props: IR.ResolvedProps): IR.Node[] {
        const pieces = literal.split("\n");
        const result: IR.Node[] = [];

        pieces.forEach((piece, i) => {
            if (piece) result.push(buildTextNode(this.nextId(), props, piece));
            if (i < pieces.length - 1) result.push(buildNewlineNode(this.nextId()));
        });

        // locMap registration removido daqui. O swapNodes assume isso agora!
        return result;
    }

    private buildParentMap(): Map<string, IR.Block> {
        const map = new Map<string, IR.Block>();
        const visit = (block: IR.Block) => {
            for (const child of block.children) {
                map.set(child.id, block);
                if (child.type === IR.NodeType.Block) visit(child as IR.Block);
            }
        };
        visit(this.doc.root);
        return map;
    }

    private getTextNode(id: string): IR.Text | null {
        const entry = this.doc.nodeMap.get(id);
        return entry?.node.type === IR.NodeType.Text ? (entry.node as IR.Text) : null;
    }

    private filterByScope(props: IR.ResolvedProps, scope: PropertyScope): IR.ResolvedProps {
        const result: IR.ResolvedProps = new Map();
        for (const [key, value] of props) {
            if (getPropertyDefinition(key)?.scope === scope) result.set(key, value);
        }
        return result;
    }

    private mergeProps(base: IR.ResolvedProps, incoming: IR.ResolvedProps): IR.ResolvedProps {
        return new Map([...base, ...incoming]);
    }

    private propsEqual(a: IR.ResolvedProps, b: IR.ResolvedProps): boolean {
        if (a.size !== b.size) return false;
        for (const [key, value] of a) {
            if (b.get(key) !== value) return false;
        }
        return true;
    }

    private locOf(nodeId: string): SourceLocation {
        const entry = this.doc.nodeMap.get(nodeId);
        return entry ? { line: entry.line, column: entry.column } : { line: 0, column: 0 };
    }

    // Recebe o loc explícito em vez de adivinhar no escuro
    private register(node: IR.Node, parent: IR.Block, loc: SourceLocation): void {
        this.doc.nodeMap.set(node.id, { ...loc, node });
        this.parentMap.set(node.id, parent);
        this.tracker.recordCreate({ node, parentId: parent.id });
    }

    private unregister(node: IR.Node): void {
        this.doc.nodeMap.delete(node.id);
        this.parentMap.delete(node.id);
        this.tracker.recordDelete(node.id);
    }

    private nextId(): string {
        return crypto.randomUUID();
    }
}
