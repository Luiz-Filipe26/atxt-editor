import type * as IR from "./ir";

export const MutationType = {
    MutateRangeProps: "MUTATE_RANGE_SET",
    MutateRangeInsert: "MUTATE_RANGE_INSERT",
    MutateRangeDelete: "MUTATE_RANGE_DELETE",
    MutateBlockProps: "MUTATE_BLOCK_SET",
    MutateBlockDelete: "MUTATE_BLOCK_DELETE",
} as const;

export type MutationType = (typeof MutationType)[keyof typeof MutationType];

interface MutateRangeBase {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
}

export interface MutateRangePropsIntent extends MutateRangeBase {
    type: typeof MutationType.MutateRangeProps;
    props: IR.ResolvedProps;
}

export interface MutateRangeInsertIntent extends MutateRangeBase {
    type: typeof MutationType.MutateRangeInsert;
    literal: string;
}

export interface MutateRangeDeleteIntent extends MutateRangeBase {
    type: typeof MutationType.MutateRangeDelete;
}

export type MutateRangeIntent =
    | MutateRangePropsIntent
    | MutateRangeInsertIntent
    | MutateRangeDeleteIntent;

export interface MutateBlockPropsIntent {
    type: typeof MutationType.MutateBlockProps;
    targetId: string;
    props: IR.ResolvedProps;
}

export interface MutateBlockDeleteIntent {
    type: typeof MutationType.MutateBlockDelete;
    targetId: string;
}

export type MutateBlockIntent = MutateBlockPropsIntent | MutateBlockDeleteIntent;

export type MutationIntent = MutateRangeIntent | MutateBlockIntent;
