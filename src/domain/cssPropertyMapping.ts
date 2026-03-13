export type CssUnit = "px-fallback" | "multi-px-fallback" | null;

export interface CssPropertyMapping {
    cssProperty: string;
    unit: CssUnit;
}

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

export function getCssMapping(key: string): CssPropertyMapping | null {
    return CSS_REGISTRY[key] ?? null;
}
