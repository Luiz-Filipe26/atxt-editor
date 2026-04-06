import type { ResolvedProps } from "../types/ir";

type PropName = string;
type PropValueStack = string[];

export class PropertyContext {
    private propToValueStack: Map<PropName, PropValueStack> = new Map();

    constructor(props: ResolvedProps = new Map()) {
        for (const [key, value] of props) {
            this.propToValueStack.set(key, [value]);
        }
    }

    public push(key: PropName, value: string): void {
        const stack = this.propToValueStack.get(key);
        if (stack) stack.push(value);
        else this.propToValueStack.set(key, [value]);
    }

    public pushMany(props: ResolvedProps): void {
        for (const [key, value] of props) {
            this.push(key, value);
        }
    }

    public pop(key: PropName): void {
        const stack = this.propToValueStack.get(key);
        if (!stack) return;
        stack.pop();
        if (stack.length === 0) this.propToValueStack.delete(key);
    }

    public popMany(props: ResolvedProps): void {
        for (const key of props.keys()) {
            this.pop(key);
        }
    }

    public snapshot(): ResolvedProps {
        const result: ResolvedProps = new Map();
        for (const [key, stack] of this.propToValueStack) {
            result.set(key, stack[stack.length - 1]);
        }
        return result;
    }

    public snapshotWith(overrides: ResolvedProps): ResolvedProps {
        const result = this.snapshot();
        for (const [key, value] of overrides) {
            result.set(key, value);
        }
        return result;
    }

    public pushClass(className: string, classProps: ResolvedProps): void {
        this.push("class", className);
        this.pushMany(classProps);
    }

    public popClass(classProps: ResolvedProps): void {
        this.popMany(classProps);
        this.pop("class");
    }

    public peek(key: string): string | undefined {
        const stack = this.propToValueStack.get(key);
        return stack ? stack[stack.length - 1] : undefined;
    }
}
