type ValidatorFn = (value: string) => any | null;

interface PropertyDefinition {
    validate: ValidatorFn;
}

const extractNumber = (val: string) => {
    return /^-?\d+$/.test(val) ? val : null;
};

export const PROPERTY_REGISTRY: Record<string, PropertyDefinition> = {
    fill: {
        validate: (val) => val,
    },
    radius: {
        validate: extractNumber,
    },
    padding: {
        validate: (val) => {
            const parts = val.split(" ");
            const allNumbers = parts.every((p) => extractNumber(p) !== null);
            return allNumbers ? val : null;
        },
    },
    margin: {
        validate: (val) => {
            const parts = val.split(" ");
            const allNumbers = parts.every((p) => extractNumber(p) !== null);
            return allNumbers ? val : null;
        },
    },
    border: {
        validate: (val) => val,
    },
    width: {
        validate: extractNumber,
    },
    height: {
        validate: extractNumber,
    },

    align: {
        validate: (val) => {
            const allowed = ["left", "right", "center", "justify"];
            return allowed.includes(val) ? val : null;
        },
    },
    color: {
        validate: (val) => val,
    },
    font: {
        validate: (val) => val,
    },
    size: {
        validate: extractNumber,
    },
    weight: {
        validate: (val) => {
            const allowedWords = ["normal", "bold", "bolder", "lighter"];
            if (allowedWords.includes(val)) return val;

            const num = parseInt(val, 10);
            if (!isNaN(num) && num >= 1 && num <= 1000) return val;

            return null;
        },
    },
    style: {
        validate: (val) => {
            const allowed = ["normal", "italic", "oblique"];
            return allowed.includes(val) ? val : null;
        },
    },
    "line-height": {
        validate: (val) => val,
    },
    decoration: {
        validate: (val) => {
            const allowed = ["none", "underline", "line-through", "overline"];
            return allowed.includes(val) ? val : null;
        },
    },

    bouncingText: {
        validate: (val) => {
            return val === "true" || val === "" ? true : null;
        },
    },
};
