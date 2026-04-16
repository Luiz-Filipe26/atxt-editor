import * as IR from "../types/ir"
import {
    type UpdatedNodeEntry,
    type PendingNodeEntry,
} from "../types/mutationDelta";

/**
 * Gerencia a contabilidade de mutações atômicas na árvore IR.
 * Resolve conflitos de ciclo de vida (ex: nó criado e deletado na mesma transação).
 */
export class DeltaTracker {
    private deleted = new Set<string>();
    private created = new Map<string, PendingNodeEntry>();
    private updated = new Map<string, UpdatedNodeEntry>();

    public recordDelete(id: string): void {
        if (this.created.has(id)) {
            this.created.delete(id);
        } else {
            this.updated.delete(id);
            this.deleted.add(id);
        }
    }

    public recordCreate(entry: PendingNodeEntry): void {
        this.created.set(entry.node.id, entry);
    }

    public recordUpdate(
        id: string,
        updates: { newContent?: string; newProps?: IR.ResolvedProps },
    ): void {
        if (this.deleted.has(id) || this.created.has(id)) return;

        const existing = this.updated.get(id) ?? { id };
        if (updates.newContent !== undefined) existing.newContent = updates.newContent;
        if (updates.newProps !== undefined) existing.newProps = updates.newProps;

        this.updated.set(id, existing);
    }

    public collect() {
        return {
            deletedNodes: [...this.deleted],
            pendingNodes: [...this.created.values()],
            updatedNodes: [...this.updated.values()],
        };
    }
}
