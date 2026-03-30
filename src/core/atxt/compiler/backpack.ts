import type { ResolvedProps } from "../types/ir";

export class Backpack {
    private stacks: Map<string, string[]> = new Map();

    constructor(props: ResolvedProps = new Map()) {
        for (const [k, v] of props) {
            this.stacks.set(k, [v]);
        }
    }

    push(key: string, value: string): void {
        const stack = this.stacks.get(key) ?? [];
        this.stacks.set(key, [...stack, value]);
    }

    pushMany(props: ResolvedProps): void {
        for (const [k, v] of props) {
            this.push(k, v);
        }
    }

    pop(key: string): void {
        const stack = this.stacks.get(key);
        if (!stack) return;
        stack.pop();
        if (stack.length === 0) this.stacks.delete(key);
    }

    popMany(props: ResolvedProps): void {
        for (const k of props.keys()) {
            this.pop(k);
        }
    }

    snapshot(): ResolvedProps {
        const result: ResolvedProps = new Map();
        for (const [k, stack] of this.stacks) {
            result.set(k, stack[stack.length - 1]);
        }
        return result;
    }
}
