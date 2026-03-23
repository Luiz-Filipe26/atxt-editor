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

const isPositiveNumber = (val: string) => /^\d+(\.\d+)?$/.test(val) && parseFloat(val) > 0;

const isNonNegativeInteger = (val: string) => /^\d+$/.test(val);

const isCssColor = (val: string): boolean => {
    const v = val.trim();
    if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return true;
    if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(v)) return true;
    if (/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/.test(v)) return true;
    if (/^hsl\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*\)$/.test(v)) return true;
    if (/^hsla\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*,\s*[\d.]+\s*\)$/.test(v)) return true;
    if (/^[a-zA-Z]+$/.test(v)) return true; // named colors e.g. red, cornflowerblue
    return false;
};

const isCssBorder = (val: string): boolean => /^[a-zA-Z0-9#%.\-\s]+$/.test(val.trim());

const isFontFamily = (val: string): boolean => /^[a-zA-Z0-9\s,'\-]+$/.test(val.trim());

const PROPERTY_REGISTRY: Record<string, PropertyDefinition> = {
    hidden: {
        scope: "block",
        container: false,
        validate: (v) => ["true", "false"].includes(v.toLowerCase()),
    },
    kind: { scope: "block", container: false, validate: (v) => getKindDefinition(v) !== null },
    fill: { scope: "block", container: true, validate: isCssColor },
    radius: { scope: "block", container: true, validate: isNumber },
    indent: { scope: "block", container: false, validate: isNonNegativeInteger },
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
    border: { scope: "block", container: true, validate: isCssBorder },
    width: { scope: "block", container: true, validate: isNumber },
    height: { scope: "block", container: true, validate: isNumber },
    align: {
        scope: "block",
        container: false,
        validate: (val) => ["left", "right", "center", "justify"].includes(val),
    },

    color: { scope: "inline", container: false, validate: isCssColor },
    font: { scope: "inline", container: false, validate: isFontFamily },
    size: { scope: "inline", container: false, validate: isPositiveNumber },
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
    "line-height": {
        scope: "inline",
        container: false,
        validate: (val) => val === "normal" || isPositiveNumber(val),
    },
    decoration: {
        scope: "inline",
        container: false,
        validate: (val) => ["none", "underline", "line-through", "overline"].includes(val),
    },
};

export function getPropertyDefinition(key: string): PropertyDefinition | null {
    return PROPERTY_REGISTRY[key] ?? null;
}
