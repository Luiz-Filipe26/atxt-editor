import { getPropertyDefinition } from "../domain/propertyDefinitions";
import * as IR from "../types/ir";
import * as AST from "../types/ast";

export interface ResolvedResult {
    props: IR.ResolvedProps;
    classes: string[];
    directProps: IR.ResolvedProps;
}

export class PropertyResolver {
    private classRegistry: Record<string, IR.ResolvedProps> = {};
    private pushError: (message: string, line: number, column: number) => void;

    constructor(errorCallback: (message: string, line: number, column: number) => void) {
        this.pushError = errorCallback;
    }

    public reset(): void {
        this.classRegistry = {};
    }

    public getClassDefinitions(): Record<string, IR.ResolvedProps> {
        return { ...this.classRegistry };
    }

    public defineClass(annotation: AST.AnnotationNode): void {
        const classProp = annotation.properties.find((p) => p.key === "class");

        if (!classProp) {
            this.pushErrorAt("DEFINE directive requires a 'class' property.", annotation);
            return;
        }

        const className = classProp.value;
        const composeProp = annotation.properties.find((p) => p.key === "compose");
        const bag: IR.ResolvedProps = {};

        this.inheritComposedClasses(bag, composeProp);
        this.assignExplicitProperties(bag, annotation.properties);

        this.classRegistry[className] = bag;
    }

    public resolveClassByName(name: string): IR.ResolvedProps | null {
        return this.classRegistry[name] ?? null;
    }

    public resolveProperties(properties: AST.PropertyNode[]): ResolvedResult {
        const classProps: IR.ResolvedProps = {};
        const directProps: IR.ResolvedProps = {};
        const classes: string[] = [];

        this.applyClassProperties(classProps, properties, classes);
        this.applyInlineProperties(directProps, properties);

        const props: IR.ResolvedProps = { ...classProps, ...directProps };

        return { props, classes, directProps };
    }

    public routePropertiesByScope(props: IR.ResolvedProps): {
        blockProps: IR.ResolvedProps;
        inlineProps: IR.ResolvedProps;
    } {
        const blockProps: IR.ResolvedProps = {};
        const inlineProps: IR.ResolvedProps = {};

        for (const [key, value] of Object.entries(props)) {
            const propDef = getPropertyDefinition(key);
            if (!propDef) continue;
            if (propDef.scope === "block") blockProps[key] = value;
            else inlineProps[key] = value;
        }

        return { blockProps, inlineProps };
    }

    private inheritComposedClasses(bag: IR.ResolvedProps, composeProp?: AST.PropertyNode): void {
        if (!composeProp) return;

        const classesToCompose = composeProp.value.split(/\s+/).filter(Boolean);
        for (const cls of classesToCompose) {
            if (this.classRegistry[cls]) {
                Object.assign(bag, this.classRegistry[cls]);
            } else {
                this.pushErrorAt(`Warning: Base class '${cls}' not found in compose.`, composeProp);
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
            bag[prop.key] = prop.value;
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
            if (this.classRegistry[cls]) {
                Object.assign(bag, this.classRegistry[cls]);
            } else {
                this.pushError(
                    `Warning: Class '${cls}' not found.`,
                    classProp.line,
                    classProp.column,
                );
            }
        }
    }

    private applyInlineProperties(bag: IR.ResolvedProps, properties: AST.PropertyNode[]): void {
        for (const prop of properties) {
            const isAlreadyHandled = prop.key === "class" || prop.toggle === "minus";
            if (isAlreadyHandled) continue;

            const propertyDef = getPropertyDefinition(prop.key);
            if (!propertyDef) {
                this.pushError(`Warning: Unknown property '${prop.key}'.`, prop.line, prop.column);
                continue;
            }

            if (!propertyDef.validate(prop.value)) {
                this.pushError(
                    `Warning: Invalid value '${prop.value}' for property '${prop.key}'.`,
                    prop.line,
                    prop.column,
                );
                continue;
            }

            bag[prop.key] = prop.value;
        }
    }

    private pushErrorAt(message: string, node: AST.ASTNode) {
        this.pushError(message, node.line, node.column);
    }
}
