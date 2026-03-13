import type { IRBlock, IRNode, IRText } from "./hydrator";
import { getCssMapping, type CssUnit } from "../domain/cssPropertyMapping";
import { dedent } from "../utils/stringUtils";

export class Generator {
    private classCache = new Map<string, string>();
    private cssRules: string[] = [];
    private classCounter = 0;

    public generate(root: IRBlock): string {
        this.classCache.clear();
        this.cssRules = [];
        this.classCounter = 0;

        const html = this.renderNode(root);
        const dynamicCss = this.cssRules.join("\n");

        const baseCss = dedent`
            .atxt-document-root {
                white-space: pre-wrap;
                word-break: break-word;
            }
        `;

        return dedent`
            <div class="atxt-document-root">
                <style>
                    ${baseCss}
                    ${dynamicCss}
                </style>
                ${html}
            </div>
        `;
    }

    private renderNode(node: IRNode): string {
        if (
            node.type === "BLOCK" &&
            node.props["hidden"]?.toLowerCase() === "true"
        ) {
            return "";
        }

        let className = "";
        const propKeys = Object.keys(node.props);

        if (propKeys.length > 0) {
            className = this.resolveClass(node.props);
        }

        const classAttribute = className ? ` class="${className}"` : "";

        let dataAttributes = "";
        if (node.line !== undefined && node.column !== undefined) {
            dataAttributes = ` data-line="${node.line}" data-column="${node.column}"`;
        }

        if (node.type === "BLOCK") {
            const block = node as IRBlock;
            const childrenHtml = block.children
                .map((child: IRNode) => this.renderNode(child))
                .join("");

            return `<div${classAttribute}${dataAttributes}>${childrenHtml}</div>`;
        }

        if (node.type === "TEXT") {
            const textNode = node as IRText;
            return `<span${classAttribute}${dataAttributes}>${textNode.content}</span>`;
        }

        return "";
    }

    private resolveClass(props: Record<string, any>): string {
        const signature = JSON.stringify(
            Object.keys(props)
                .sort()
                .reduce((obj: Record<string, any>, key) => {
                    obj[key] = props[key];
                    return obj;
                }, {}),
        );

        if (this.classCache.has(signature)) {
            return this.classCache.get(signature)!;
        }

        const newClassName = `atxt-editor-${this.classCounter.toString(36)}`;
        this.classCounter++;

        this.classCache.set(signature, newClassName);
        this.cssRules.push(this.buildCssRule(newClassName, props));

        return newClassName;
    }

    private buildCssRule(className: string, props: Record<string, any>): string {
        let cssBody = "";

        for (const [key, value] of Object.entries(props)) {
            const mapping = getCssMapping(key);
            if (!mapping) continue;

            const formattedValue = this.formatCssValue(String(value), mapping.unit);
            cssBody += `  ${mapping.cssProperty}: ${formattedValue};\n`;
        }

        return `.${className} {\n${cssBody}}`;
    }

    private formatCssValue(value: string, unit: CssUnit): string {
        if (unit === "px-fallback") {
            return /^-?\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
        }

        if (unit === "multi-px-fallback") {
            return value
                .split(" ")
                .map((v) => (/^-?\d+(\.\d+)?$/.test(v) && v !== "0" ? `${v}px` : v))
                .join(" ");
        }

        return value;
    }
}
