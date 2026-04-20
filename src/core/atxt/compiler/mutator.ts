import * as IR from "../types/ir";
import { getPropertyDefinition, PropertyScope } from "../domain/propertyDefinitions";
import { buildTextNode, buildNewlineNode } from "./irBuilders";
import {
    type MutationIntent,
    type MutateRangePropsIntent,
    type MutateRangeInsertIntent,
    type MutateRangeDeleteIntent,
    type MutateBlockPropsIntent,
    type MutateBlockDeleteIntent,
    type MutateRangeIntent,
    MutationType,
} from "../types/mutationIntent";
import { type IRDelta, type CreatedNodeEntry, type CollectedDelta } from "../types/mutationDelta";
import { DeltaTracker } from "./deltaTracker";
import type { Range } from "../types/location";

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
        const raw = this.collectDeltas(intent);

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

    private collectDeltas(intent: MutationIntent): CollectedDelta {
        switch (intent.type) {
            case MutationType.MutateRangeProps:
                this.handleRangeProps(intent);
                break;
            case MutationType.MutateRangeInsert:
                this.handleRangeInsert(intent);
                break;
            case MutationType.MutateRangeDelete:
                this.handleRangeDelete(intent);
                break;
            case MutationType.MutateBlockProps:
                this.handleBlockProps(intent);
                break;
            case MutationType.MutateBlockDelete:
                this.handleBlockDelete(intent);
                break;
            default:
                intent satisfies never;
        }
        return this.tracker.collect();
    }

    // ── Block Operations ─────────────────────────────────────────────────────

    private handleBlockProps(intent: MutateBlockPropsIntent): void {
        const node = this.doc.nodeMap.get(intent.targetId);
        if (node?.type !== IR.NodeType.Block) return;
        this.applyBlockProperties(node, intent.props);
    }

    private handleBlockDelete(intent: MutateBlockDeleteIntent): void {
        const node = this.doc.nodeMap.get(intent.targetId);
        if (node?.type !== IR.NodeType.Block) return;
        const parent = this.parentMap.get(intent.targetId);
        const idx = parent?.children.indexOf(node) ?? -1;
        if (parent && idx !== -1) {
            this.swapNodes(parent, { index: idx, count: 1 }, []);
        }
    }

    private applyBlockProperties(block: IR.Block, props: IR.ResolvedProps): void {
        const blockProps = this.filterByScope(props, PropertyScope.Block);
        for (const [key, value] of blockProps) block.props.set(key, value);
        this.tracker.recordUpdate(block.id, { newProps: new Map(block.props) });
    }

    // ── Range Operations ─────────────────────────────────────────────────────

    private handleRangeProps(intent: MutateRangePropsIntent): void {
        const parent = this.resolveSharedParent(intent);
        if (!parent) return;
        const ctx = this.resolveRangeContext(intent, parent);
        if (!ctx) return;

        const inlineProps = this.filterByScope(intent.props, PropertyScope.Inline);

        if (ctx.startNode === ctx.endNode) {
            this.sliceAndApplyProps(
                { node: ctx.startNode, parent, index: ctx.startIdx },
                { start: intent.startOffset, end: intent.endOffset },
                inlineProps,
            );
        } else {
            this.applyMultiNodeProps(ctx, intent, inlineProps);
        }

        this.normalize(parent);
    }

    private handleRangeInsert(intent: MutateRangeInsertIntent): void {
        const parent = this.resolveSharedParent(intent);
        if (!parent) return;
        this.replaceRange(intent, parent, intent.literal);
        this.normalize(parent);
    }

    private handleRangeDelete(intent: MutateRangeDeleteIntent): void {
        if (this.isInvalidTextRange(intent)) return;
        const parent = this.resolveSharedParent(intent);
        if (!parent) return;
        this.replaceRange(intent, parent, "");
        this.normalize(parent);
    }

    private replaceRange(intent: MutateRangeIntent, parent: IR.Block, literal: string): void {
        const ctx = this.resolveRangeContext(intent, parent);
        if (!ctx) return;

        const mergedLiteral = this.buildMergedLiteral(intent, ctx, literal);
        const newNodes =
            mergedLiteral.length > 0
                ? this.buildNodesFromLiteral(mergedLiteral, ctx.startNode.props)
                : [];

        this.swapNodes(
            parent,
            { index: ctx.startIdx, count: ctx.endIdx - ctx.startIdx + 1 },
            newNodes,
        );
    }

    private isInvalidTextRange(intent: MutateRangeDeleteIntent): boolean {
        return intent.startNodeId === intent.endNodeId && intent.startOffset === intent.endOffset;
    }

    private applyMultiNodeProps(
        ctx: RangeContext,
        intent: MutateRangePropsIntent,
        props: IR.ResolvedProps,
    ): void {
        const { parent, startNode, endNode, startIdx, endIdx } = ctx;

        // Process right-to-left: each splice only affects positions ≥ current index,
        // leaving lower indices stable for subsequent operations.

        // 1. End node: apply props to [0, endOffset)
        this.sliceAndApplyProps(
            { node: endNode, parent, index: endIdx },
            { start: 0, end: intent.endOffset },
            props,
        );

        // 2. Middle nodes: apply props in-place (indices remain stable while we process rightward)
        for (let i = startIdx + 1; i < endIdx; i++) {
            this.applyPropsInPlace(parent.children[i], props);
        }

        // 3. Start node: apply props to [startOffset, end)
        this.sliceAndApplyProps(
            { node: startNode, parent, index: startIdx },
            { start: intent.startOffset, end: startNode.content.length },
            props,
        );
    }

    // ── Slicing ───────────────────────────────────────────────────────────────

    private sliceAndApplyProps(target: NodeTarget, range: Range, props: IR.ResolvedProps): void {
        const { node, parent, index } = target;

        if (range.start === 0 && range.end === node.content.length) {
            this.applyPropsInPlace(node, props);
            return;
        }

        const replacements = this.buildReplacements(node, range, props);
        this.swapNodes(parent, { index, count: 1 }, replacements);
    }

    private buildReplacements(node: IR.Text, range: Range, props: IR.ResolvedProps): IR.Node[] {
        const before = node.content.slice(0, range.start);
        const target = node.content.slice(range.start, range.end);
        const after = node.content.slice(range.end);

        const mergedProps = this.mergeProps(node.props, props);
        const result: IR.Node[] = [];

        if (before) result.push(buildTextNode(this.nextId(), node.props, before));
        if (target) result.push(buildTextNode(this.nextId(), mergedProps, target));
        if (after) result.push(buildTextNode(this.nextId(), node.props, after));

        return result;
    }

    private applyPropsInPlace(node: IR.Node, props: IR.ResolvedProps): void {
        if (node.type !== IR.NodeType.Text) return;
        node.props = this.mergeProps(node.props, props);
        this.tracker.recordUpdate(node.id, { newProps: new Map(node.props) });
    }

    // ── Normalization ─────────────────────────────────────────────────────────

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
        if (!this.propsEqual(curr.props, next.props)) return false;

        curr.content += next.content;
        this.swapNodes(parent, { index: index + 1, count: 1 }, []);
        this.tracker.recordUpdate(curr.id, { newContent: curr.content });
        return true;
    }

    // ── Utilities & Plumbing ──────────────────────────────────────────────────

    private swapNodes(
        parent: IR.Block,
        splice: { index: number; count: number },
        newNodes: IR.Node[],
    ): void {
        const removed = parent.children.splice(splice.index, splice.count, ...newNodes);
        for (const n of removed) this.unregister(n);
        for (const n of newNodes) this.register(n, parent);
    }

    private resolveSharedParent(intent: MutateRangeIntent): IR.Block | null {
        const parent = this.parentMap.get(intent.startNodeId);
        if (!parent || parent !== this.parentMap.get(intent.endNodeId)) return null;
        return parent;
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

        for (let i = 0; i < pieces.length; i++) {
            if (pieces[i]) result.push(buildTextNode(this.nextId(), props, pieces[i]));
            if (i < pieces.length - 1) result.push(buildNewlineNode(this.nextId()));
        }

        return result;
    }

    private buildParentMap(): Map<string, IR.Block> {
        const map = new Map<string, IR.Block>();
        const visit = (block: IR.Block) => {
            for (const child of block.children) {
                map.set(child.id, block);
                if (child.type === IR.NodeType.Block) visit(child);
            }
        };
        visit(this.doc.root);
        return map;
    }

    private getTextNode(id: string): IR.Text | null {
        const node = this.doc.nodeMap.get(id);
        return node?.type === IR.NodeType.Text ? node : null;
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

    private register(node: IR.Node, parent: IR.Block): void {
        this.doc.nodeMap.set(node.id, node);
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
