import type * as IR from "./ir";
export const MutationAction = {
    SetProperties: "SET_PROPERTIES",
    InsertText: "INSERT_TEXT",
    Delete: "DELETE",
} as const;
export type MutationAction = (typeof MutationAction)[keyof typeof MutationAction];
export const MutationType = {
    MutateRange: "MUTATE_RANGE",
    MutateBlock: "MUTATE_BLOCK",
} as const;
export type MutationType = (typeof MutationType)[keyof typeof MutationType];
export interface SetPropertiesPayload {
    action: typeof MutationAction.SetProperties;
    props: IR.ResolvedProps;
}
export interface InsertTextPayload {
    action: typeof MutationAction.InsertText;
    literal: string;
}
export interface DeletePayload {
    action: typeof MutationAction.Delete;
}
export type RangePayload = SetPropertiesPayload | InsertTextPayload | DeletePayload;
export type BlockPayload = SetPropertiesPayload | DeletePayload;
export interface MutateRangeIntent {
    type: typeof MutationType.MutateRange;
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
    payload: RangePayload;
}
export interface MutateBlockIntent {
    type: typeof MutationType.MutateBlock;
    targetId: string;
    payload: BlockPayload;
}
export type MutationIntent = MutateRangeIntent | MutateBlockIntent;
