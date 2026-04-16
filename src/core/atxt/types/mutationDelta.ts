import * as IR from "./ir"

export interface CreatedNodeEntry {
    node: IR.Node;
    parentId: string;
    index: number;
}
export type PendingNodeEntry = Omit<CreatedNodeEntry, "index">;
export interface UpdatedNodeEntry {
    id: string;
    newContent?: string;
    newProps?: IR.ResolvedProps;
}
export interface IRDelta {
    deletedNodes: string[];
    createdNodes: CreatedNodeEntry[];
    updatedNodes: UpdatedNodeEntry[];
}
