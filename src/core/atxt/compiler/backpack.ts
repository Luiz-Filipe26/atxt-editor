import type { ResolvedProps } from "../types/ir";

export class Backpack {
    private stacks: Record<string, string[]> = {};

    constructor(props: ResolvedProps = {}) {
        for (const [k, v] of Object.entries(props)) {
            this.stacks[k] = [v];
        }
    }

    push(key: string, value: string): void {
        this.stacks[key] = [...(this.stacks[key] ?? []), value];
    }

    pushMany(props: ResolvedProps): void {
        for (const [k, v] of Object.entries(props)) {
            this.push(k, v);
        }
    }

    pop(key: string): void {
        this.stacks[key]?.pop();
        if (this.stacks[key]?.length === 0) delete this.stacks[key];
    }

    popMany(props: ResolvedProps): void {
        for (const k of Object.keys(props)) {
            this.pop(k);
        }
    }

    snapshot(): ResolvedProps {
        return Object.fromEntries(
            Object.entries(this.stacks)
                .filter(([, stack]) => stack.length > 0)
                .map(([k, stack]) => [k, stack[stack.length - 1]]),
        );
    }
}
