import type * as IR from "../types/ir";

type ValidatorFn = (value: string) => boolean;

export interface PropertyDefinition {
    scope: "block" | "inline";
    container: boolean;
    validate: ValidatorFn;
}

export interface KindDefinition {
    leafCompatible: boolean;
}

const CLASS_REGISTRY: Record<string, IR.ResolvedProps> = {
    h1: { kind: "heading1", size: "32", weight: "bold" },
    h2: { kind: "heading2", size: "24", weight: "bold" },
    h3: { kind: "heading3", size: "18", weight: "bold" },
    h4: { kind: "heading4", size: "16", weight: "bold" },
    h5: { kind: "heading5", size: "14", weight: "bold" },
    bold: { weight: "bold" },
    italic: { style: "italic" },
    strikethrough: { decoration: "line-through" },
    blockquote: { kind: "quote", color: "gray", indent: "4" },
    "list-item": { kind: "item", indent: "2" },
    "list-ordered": { kind: "item", indent: "2" },
};

export function getClassDefinition(name: string): IR.ResolvedProps | null {
    return CLASS_REGISTRY[name] ?? null;
}

const KIND_REGISTRY: Record<string, KindDefinition> = {
    paragraph: { leafCompatible: true },
    heading1: { leafCompatible: true },
    heading2: { leafCompatible: true },
    heading3: { leafCompatible: true },
    heading4: { leafCompatible: true },
    heading5: { leafCompatible: true },
    code: { leafCompatible: true },
    item: { leafCompatible: true },
    quote: { leafCompatible: false },
    list: { leafCompatible: false },
    "ordered-list": { leafCompatible: false },
    aside: { leafCompatible: false },
    section: { leafCompatible: false },
    article: { leafCompatible: false },
    header: { leafCompatible: false },
    footer: { leafCompatible: false },
};

export function getKindDefinition(kind: string): KindDefinition | null {
    return KIND_REGISTRY[kind] ?? null;
}

const isNumber = (val: string) => /^-?\d+$/.test(val);

const PROPERTY_REGISTRY: Record<string, PropertyDefinition> = {
    hidden: {
        scope: "block",
        container: false,
        validate: (v) => ["true", "false"].includes(v.toLowerCase()),
    },
    kind: { scope: "block", container: false, validate: (v) => getKindDefinition(v) !== null },
    fill: { scope: "block", container: true, validate: (val) => val.trim().length > 0 },
    radius: { scope: "block", container: true, validate: isNumber },
    indent: { scope: "block", container: false, validate: isNumber },
    padding: {
        scope: "block",
        container: true,
        validate: (val) => val.trim().split(/\s+/).every(isNumber),
    },
    margin: {
        scope: "block",
        container: true,
        validate: (val) => val.trim().split(/\s+/).every(isNumber),
    },
    border: { scope: "block", container: true, validate: (val) => val.trim().length > 0 },
    width: { scope: "block", container: true, validate: isNumber },
    height: { scope: "block", container: true, validate: isNumber },
    align: {
        scope: "block",
        container: false,
        validate: (val) => ["left", "right", "center", "justify"].includes(val),
    },

    color: { scope: "inline", container: false, validate: (val) => val.trim().length > 0 },
    font: { scope: "inline", container: false, validate: (val) => val.trim().length > 0 },
    size: { scope: "inline", container: false, validate: isNumber },
    weight: {
        scope: "inline",
        container: false,
        validate: (val) => {
            const allowedWords = ["normal", "bold", "bolder", "lighter"];
            if (allowedWords.includes(val)) return true;
            if (!/^\d+$/.test(val)) return false;
            const num = parseInt(val, 10);
            return num >= 1 && num <= 1000;
        },
    },
    style: {
        scope: "inline",
        container: false,
        validate: (val) => ["normal", "italic", "oblique"].includes(val),
    },
    "line-height": { scope: "inline", container: false, validate: (val) => val.trim().length > 0 },
    decoration: {
        scope: "inline",
        container: false,
        validate: (val) => ["none", "underline", "line-through", "overline"].includes(val),
    },
};

export function getPropertyDefinition(key: string): PropertyDefinition | null {
    return PROPERTY_REGISTRY[key] ?? null;
}
