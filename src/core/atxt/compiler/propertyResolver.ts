import { getPropertyDefinition } from "../domain/propertyDefinitions";
import * as IR from "../types/ir";
import * as AST from "../types/ast";

export interface ResolvedResult {
    props: IR.ResolvedProps;
    classes: string[];
    directProps: IR.ResolvedProps;
}

export class PropertyResolver {
    private classRegistry: Map<string, IR.ResolvedProps> = new Map();
    private pushError: (message: string, line: number, column: number) => void;

    constructor(errorCallback: (message: string, line: number, column: number) => void) {
        this.pushError = errorCallback;
    }

    public reset(): void {
        this.classRegistry = new Map();
    }

    public getClassDefinitions(): Map<string, IR.ResolvedProps> {
        return new Map(this.classRegistry);
    }

    public defineClass(annotation: AST.AnnotationNode): void {
        const classProp = annotation.properties.find((p) => p.key === "class");

        if (!classProp) {
            this.pushErrorAt("DEFINE directive requires a 'class' property.", annotation);
            return;
        }

        const className = classProp.value;
        const composeProp = annotation.properties.find((p) => p.key === "compose");
        const bag: IR.ResolvedProps = new Map();

        this.inheritComposedClasses(bag, composeProp);
        this.assignExplicitProperties(bag, annotation.properties);

        this.classRegistry.set(className, bag);
    }

    public resolveClassByName(name: string): IR.ResolvedProps | null {
        return this.classRegistry.get(name) ?? null;
    }

    public resolveProperties(properties: AST.PropertyNode[]): ResolvedResult {
        const classProps: IR.ResolvedProps = new Map();
        const directProps: IR.ResolvedProps = new Map();
        const classes: string[] = [];

        this.applyClassProperties(classProps, properties, classes);
        this.applyInlineProperties(directProps, properties);

        const props: IR.ResolvedProps = new Map([...classProps, ...directProps]);

        return { props, classes, directProps };
    }

    public routePropertiesByScope(props: IR.ResolvedProps): {
        blockProps: IR.ResolvedProps;
        inlineProps: IR.ResolvedProps;
    } {
        const blockProps: IR.ResolvedProps = new Map();
        const inlineProps: IR.ResolvedProps = new Map();

        for (const [key, value] of props) {
            const propDef = getPropertyDefinition(key);
            if (!propDef) continue;
            if (propDef.scope === "block") blockProps.set(key, value);
            else inlineProps.set(key, value);
        }

        return { blockProps, inlineProps };
    }

    private inheritComposedClasses(bag: IR.ResolvedProps, composeProp?: AST.PropertyNode): void {
        if (!composeProp) return;

        const classesToCompose = composeProp.value.split(/\s+/).filter(Boolean);
        for (const cls of classesToCompose) {
            const classProps = this.classRegistry.get(cls);
            if (!classProps) {
                this.pushErrorAt(`Warning: Base class '${cls}' not found in compose.`, composeProp);
                continue;
            }
            for (const [k, v] of classProps) {
                bag.set(k, v);
            }
        }
    }

    private assignExplicitProperties(bag: IR.ResolvedProps, properties: AST.PropertyNode[]): void {
        for (const prop of properties) {
            if (prop.key === "class" || prop.key === "compose") continue;

            const propertyDef = getPropertyDefinition(prop.key);
            if (!propertyDef || !propertyDef.validate(prop.value)) {
                this.pushErrorAt(
                    `Warning: Invalid or unknown property '${prop.key}' ignored in DEFINE.`,
                    prop,
                );
                continue;
            }
            bag.set(prop.key, prop.value);
        }
    }

    private applyClassProperties(
        bag: IR.ResolvedProps,
        properties: AST.PropertyNode[],
        classes: string[],
    ): void {
        const classProp = properties.find((p) => p.key === "class" && !p.toggle);
        if (!classProp) return;

        const classNames = classProp.value.split(/\s+/).filter(Boolean);
        for (const cls of classNames) {
            classes.push(cls);
            const classProps = this.classRegistry.get(cls);
            if (!classProps) {
                this.pushErrorAt(`Warning: Class '${cls}' not found.`, classProp);
                continue;
            }
            for (const [k, v] of classProps) {
                bag.set(k, v);
            }
        }
    }

    private applyInlineProperties(bag: IR.ResolvedProps, properties: AST.PropertyNode[]): void {
        for (const prop of properties) {
            const isAlreadyHandled = prop.key === "class" || prop.toggle === "minus";
            if (isAlreadyHandled) continue;

            const propertyDef = getPropertyDefinition(prop.key);
            if (!propertyDef) {
                this.pushErrorAt(`Warning: Unknown property '${prop.key}'.`, prop);
                continue;
            }

            if (!propertyDef.validate(prop.value)) {
                this.pushErrorAt(
                    `Warning: Invalid value '${prop.value}' for property '${prop.key}'.`,
                    prop,
                );
                continue;
            }

            bag.set(prop.key, prop.value);
        }
    }

    private pushErrorAt(message: string, source: { line: number; column: number }) {
        this.pushError(message, source.line, source.column);
    }
}
