import { PROPERTY_REGISTRY } from "../domain/propertyDefinitions";
import type { AnnotationNode, PropertyNode } from "../types/ast";

export class StyleResolver {
    private registry = PROPERTY_REGISTRY;
    private classRegistry: Record<string, Record<string, string>> = {};
    private pushError: (message: string, line: number, column: number) => void;

    constructor(
        errorCallback: (message: string, line: number, column: number) => void,
    ) {
        this.pushError = errorCallback;
    }

    public reset(): void {
        this.classRegistry = {};
    }

    public defineClass(annotation: AnnotationNode): void {
        const classProp = annotation.properties.find((p) => p.key === "class");

        if (!classProp) {
            this.pushError(
                "DEFINE directive requires a 'class' property.",
                annotation.line,
                annotation.column,
            );
            return;
        }

        const className = classProp.value;
        const composeProp = annotation.properties.find((p) => p.key === "compose");
        const bag: Record<string, string> = {};

        this.inheritComposedClasses(bag, composeProp);
        this.assignExplicitProperties(bag, annotation.properties);

        this.classRegistry[className] = bag;
    }

    public resolveProperties(properties: PropertyNode[]): Record<string, any> {
        const result: Record<string, any> = {};

        this.applyClassProperties(result, properties);
        this.applyInlineProperties(result, properties);

        return result;
    }

    private inheritComposedClasses(
        bag: Record<string, string>,
        composeProp?: PropertyNode,
    ): void {
        if (!composeProp) return;

        const classesToCompose = composeProp.value.split(/\s+/).filter(Boolean);
        for (const cls of classesToCompose) {
            if (this.classRegistry[cls]) {
                Object.assign(bag, this.classRegistry[cls]);
            } else {
                this.pushError(
                    `Warning: Base class '${cls}' not found in compose.`,
                    composeProp.line,
                    composeProp.column,
                );
            }
        }
    }

    private assignExplicitProperties(
        bag: Record<string, string>,
        properties: PropertyNode[],
    ): void {
        for (const prop of properties) {
            if (prop.key === "class" || prop.key === "compose") continue;

            const propertyDef = this.registry[prop.key];
            if (propertyDef && propertyDef.validate(prop.value)) {
                bag[prop.key] = prop.value;
            } else {
                this.pushError(
                    `Warning: Invalid or unknown property '${prop.key}' ignored in DEFINE.`,
                    prop.line,
                    prop.column,
                );
            }
        }
    }

    private applyClassProperties(
        bag: Record<string, any>,
        properties: PropertyNode[],
    ): void {
        const classProp = properties.find((p) => p.key === "class" && !p.toggle);
        if (!classProp) return;

        const classes = classProp.value.split(/\s+/).filter(Boolean);
        for (const cls of classes) {
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

    private applyInlineProperties(
        bag: Record<string, any>,
        properties: PropertyNode[],
    ): void {
        for (const prop of properties) {
            const isAlreadyHandled = prop.key === "class" || prop.toggle === "minus";
            if (isAlreadyHandled) continue;

            const propertyDef = this.registry[prop.key];
            if (!propertyDef) {
                this.pushError(
                    `Warning: Unknown property '${prop.key}'.`,
                    prop.line,
                    prop.column,
                );
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
}
