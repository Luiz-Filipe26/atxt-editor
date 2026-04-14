export type CssUnit = "px-fallback" | "multi-px-fallback" | null;

export interface CssPropertyMapping {
    cssProperty: string;
    unit: CssUnit;
}

export type TargetValidationResult =
    | { error: string; transformedValue: null }
    | { error: null; transformedValue: string };

type TargetValidatorFn = (value: string) => TargetValidationResult;

const CSS_INJECTION_PATTERN = /expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:/i;
const FONT_EXPLOIT_PATTERN = /[();]|url\s*\(/i;
const IS_NUMERIC = /^-?\d+(\.\d+)?$/;

const CSS_REGISTRY: Record<string, CssPropertyMapping> = {
    fill: { cssProperty: "background-color", unit: null },
    radius: { cssProperty: "border-radius", unit: "px-fallback" },
    padding: { cssProperty: "padding", unit: "multi-px-fallback" },
    margin: { cssProperty: "margin", unit: "multi-px-fallback" },
    border: { cssProperty: "border", unit: null },
    width: { cssProperty: "width", unit: "px-fallback" },
    height: { cssProperty: "height", unit: "px-fallback" },
    align: { cssProperty: "text-align", unit: null },
    color: { cssProperty: "color", unit: null },
    font: { cssProperty: "font-family", unit: null },
    size: { cssProperty: "font-size", unit: "px-fallback" },
    weight: { cssProperty: "font-weight", unit: null },
    style: { cssProperty: "font-style", unit: null },
    "line-height": { cssProperty: "line-height", unit: null },
    decoration: { cssProperty: "text-decoration", unit: null },
};

const HTML_STYLE_VALIDATORS: Record<string, TargetValidatorFn> = {
    font: (val) => {
        if (FONT_EXPLOIT_PATTERN.test(val)) {
            return {
                error: "URL or Expression vectors are strictly forbidden in HTML font rendering.",
                transformedValue: null,
            };
        }
        return { error: null, transformedValue: val.replace(/"/g, "'") };
    },
};

export function getCssMapping(key: string): CssPropertyMapping | null {
    return CSS_REGISTRY[key] ?? null;
}

function formatCssUnit(value: string, unit: NonNullable<CssUnit>): string {
    switch (unit) {
        case "px-fallback":
            return IS_NUMERIC.test(value) ? `${value}px` : value;
        case "multi-px-fallback":
            return value
                .split(" ")
                .map((v) => (IS_NUMERIC.test(v) && v !== "0" ? `${v}px` : v))
                .join(" ");
    }
}

export function validateForCssProperty(key: string, value: string): TargetValidationResult {
    if (CSS_INJECTION_PATTERN.test(value))
        return { error: "Global HTML/CSS injection pattern detected.", transformedValue: null };

    let safeValue = value;

    const validator = HTML_STYLE_VALIDATORS[key];
    if (validator) {
        const validationResult = validator(value);
        if (validationResult.error !== null) return validationResult;
        safeValue = validationResult.transformedValue;
    }

    const mapping = CSS_REGISTRY[key];
    if (mapping && mapping.unit) safeValue = formatCssUnit(safeValue, mapping.unit);

    return { error: null, transformedValue: safeValue };
}
