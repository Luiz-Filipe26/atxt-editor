import DOMPurify from "isomorphic-dompurify";
import * as IR from "../types/ir";
import { formatCssUnit, getCssMapping } from "../domain/cssPropertyMapping";
import { getHtmlTag } from "../domain/htmlTagMapping";
import { sortedMapEntries } from "../utils/mapUtils";
import { HTML_SANITIZE_POLICY } from "../domain/htmlSanitizePolicy";

export class Generator {
    private classCache = new Map<string, string>();
    private cssRules: string[] = [];
    private classCounter = 0;

    private constructor() { }

    public static generate(root: IR.Block): string {
        return new Generator().generate(root);
    }

    private generate(root: IR.Block): string {
        const html = this.renderNode(root);
        const dynamicCss = this.cssRules.join("\n");

        const baseCss =
            `.atxt-document-root {\n` +
            `    white-space: pre-wrap;\n` +
            `    word-break: break-word;\n` +
            `}`;

        const raw =
            `<div class="atxt-document-root">\n` +
            `<style>\n` +
            `${baseCss}\n` +
            `${dynamicCss}\n` +
            `</style>\n` +
            html +
            `</div>`;

        return DOMPurify.sanitize(raw, HTML_SANITIZE_POLICY);
    }

    private renderNode(node: IR.Node): string {
        if (node.type === "NEWLINE") return "<br>";

        if (node.props.get("hidden")?.toLowerCase() === "true") return "";

        const className = node.props.size > 0 ? this.resolveClass(node.props) : "";
        const classAttribute = className ? ` class="${className}"` : "";
        const dataAttribute = ` data-id="${node.id}"`;

        if (node.type === "BLOCK") return this.renderBlockNode(node, classAttribute, dataAttribute);

        return `<span${classAttribute}${dataAttribute}>${node.content}</span>`;
    }

    private renderBlockNode(node: IR.Block, classAttribute: string, dataAttribute: string): string {
        if (node.children.length === 0) return "";

        const tag = getHtmlTag(node.props.get("kind"));
        const indent = parseInt(node.props.get("indent") ?? "0", 10);
        const childrenHtml =
            indent > 0
                ? this.renderChildrenWithIndent(node.children, indent)
                : node.children.map((c) => this.renderNode(c)).join("");

        return `<${tag}${classAttribute}${dataAttribute}>${childrenHtml}</${tag}>`;
    }

    private renderChildrenWithIndent(children: IR.Node[], indent: number): string {
        const spaces = " ".repeat(indent);
        let result = "";
        let atLineStart = true;

        for (const child of children) {
            if (child.type === "NEWLINE") {
                result += this.renderNode(child);
                atLineStart = true;
            } else {
                if (atLineStart) result += spaces;
                atLineStart = false;
                result += this.renderNode(child);
            }
        }

        return result;
    }

    private resolveClass(props: IR.ResolvedProps): string {
        const cssProps = this.filterCssProps(props);
        if (cssProps.size === 0) return "";

        const signature = JSON.stringify(Object.fromEntries(sortedMapEntries(cssProps)));

        const cached = this.classCache.get(signature);
        if (cached) return cached;

        const newClassName = `atxt-cls-${this.classCounter.toString(36)}`;
        this.classCounter++;
        this.classCache.set(signature, newClassName);
        this.cssRules.push(this.buildCssRule(newClassName, cssProps));

        return newClassName;
    }

    private filterCssProps(props: IR.ResolvedProps): IR.ResolvedProps {
        const result = new Map<string, string>();
        for (const [key, value] of props) {
            if (getCssMapping(key) !== null) result.set(key, value);
        }
        return result;
    }

    private buildCssRule(className: string, props: IR.ResolvedProps): string {
        let cssBody = "";

        for (const [key, value] of sortedMapEntries(props)) {
            const mapping = getCssMapping(key)!;
            const formattedValue = formatCssUnit(value, mapping.unit);
            cssBody += `  ${mapping.cssProperty}: ${formattedValue};\n`;
        }

        return `.${className} {\n${cssBody}}`;
    }
}
