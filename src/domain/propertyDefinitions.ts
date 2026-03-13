type ValidatorFn = (value: string) => boolean;

export interface PropertyDefinition {
    scope: "block" | "inline";
    validate: ValidatorFn;
}

const isNumber = (val: string) => /^-?\d+$/.test(val);

export const PROPERTY_REGISTRY: Record<string, PropertyDefinition> = {
    hidden: {
        scope: "block",
        validate: (v) => ["true", "false"].includes(v.toLowerCase()),
    },
    fill: { scope: "block", validate: (val) => val.trim().length > 0 },
    radius: { scope: "block", validate: isNumber },
    indent: { scope: "block", validate: isNumber },
    padding: {
        scope: "block",
        validate: (val) => val.trim().split(/\s+/).every(isNumber),
    },
    margin: {
        scope: "block",
        validate: (val) => val.trim().split(/\s+/).every(isNumber),
    },
    border: { scope: "block", validate: (val) => val.trim().length > 0 },
    width: { scope: "block", validate: isNumber },
    height: { scope: "block", validate: isNumber },
    align: {
        scope: "block",
        validate: (val) => ["left", "right", "center", "justify"].includes(val),
    },

    color: { scope: "inline", validate: (val) => val.trim().length > 0 },
    font: { scope: "inline", validate: (val) => val.trim().length > 0 },
    size: { scope: "inline", validate: isNumber },
    weight: {
        scope: "inline",
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
        validate: (val) => ["normal", "italic", "oblique"].includes(val),
    },
    "line-height": { scope: "inline", validate: (val) => val.trim().length > 0 },
    decoration: {
        scope: "inline",
        validate: (val) =>
            ["none", "underline", "line-through", "overline"].includes(val),
    },
};
