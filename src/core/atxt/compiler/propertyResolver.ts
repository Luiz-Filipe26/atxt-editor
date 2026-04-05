import { getPropertyDefinition } from "../domain/propertyDefinitions";
import * as IR from "../types/ir";
import * as AST from "../types/ast";
import type { SourceLocation } from "../types/location";

export interface ResolvedResult {
    props: IR.ResolvedProps;
    classes: string[];
    ownProps: IR.ResolvedProps;
}

type ErrorCallback = (message: string, source: SourceLocation) => void;

export class PropertyResolver {
    private classRegistry: Map<string, IR.ResolvedProps> = new Map();
    private readonly pushError: ErrorCallback;

    constructor(errorCallback: ErrorCallback) {
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
            this.pushError("DEFINE directive requires a 'class' property.", annotation);
            return;
        }

        const className = classProp.value;
        const mergeProp = annotation.properties.find((p) => p.key === "merge");
        const props: IR.ResolvedProps = new Map();

        this.applyMerge(props, mergeProp);
        this.applyDefinedProperties(props, annotation.properties);

        this.classRegistry.set(className, props);
    }

    public resolveClass(name: string): IR.ResolvedProps | null {
        return this.classRegistry.get(name) ?? null;
    }

    public resolveProperties(properties: AST.PropertyNode[]): ResolvedResult {
        const classProps: IR.ResolvedProps = new Map();
        const ownProps: IR.ResolvedProps = new Map();
        const classes: string[] = [];

        this.applyClassProperties(classProps, properties, classes);
        this.applyOwnProperties(ownProps, properties);

        const props: IR.ResolvedProps = new Map([...classProps, ...ownProps]);

        return { props, classes, ownProps };
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

    private applyMerge(props: IR.ResolvedProps, mergeProp?: AST.PropertyNode): void {
        if (!mergeProp) return;

        const classesToMerge = mergeProp.value.split(/\s+/).filter(Boolean);
        for (const cls of classesToMerge) {
            const classProps = this.classRegistry.get(cls);
            if (!classProps) {
                this.pushError(`Warning: Base class '${cls}' not found in merge.`, mergeProp);
                continue;
            }
            for (const [key, value] of classProps) {
                props.set(key, value);
            }
        }
    }

    private applyDefinedProperties(props: IR.ResolvedProps, properties: AST.PropertyNode[]): void {
        for (const prop of properties) {
            if (prop.key === "class" || prop.key === "merge") continue;

            const propertyDef = getPropertyDefinition(prop.key);
            if (!propertyDef || !propertyDef.validate(prop.value)) {
                this.pushError(
                    `Warning: Invalid or unknown property '${prop.key}' ignored in DEFINE.`,
                    prop,
                );
                continue;
            }
            props.set(prop.key, prop.value);
        }
    }

    private applyClassProperties(
        props: IR.ResolvedProps,
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
                this.pushError(`Warning: Class '${cls}' not found.`, classProp);
                continue;
            }
            for (const [k, v] of classProps) {
                props.set(k, v);
            }
        }
    }

    private applyOwnProperties(props: IR.ResolvedProps, properties: AST.PropertyNode[]): void {
        for (const prop of properties) {
            const isAlreadyHandled = prop.key === "class" || prop.toggle === "minus";
            if (isAlreadyHandled) continue;

            const propertyDef = getPropertyDefinition(prop.key);
            if (!propertyDef) {
                this.pushError(`Warning: Unknown property '${prop.key}'.`, prop);
                continue;
            }

            if (!propertyDef.validate(prop.value)) {
                this.pushError(
                    `Warning: Invalid value '${prop.value}' for property '${prop.key}'.`,
                    prop,
                );
                continue;
            }

            props.set(prop.key, prop.value);
        }
    }
}
