import DOMPurify from "isomorphic-dompurify";
import * as IR from "../types/ir";
import { formatCssUnit, getCssMapping } from "../domain/cssPropertyMapping";
import { getHtmlTag } from "../domain/htmlTagMapping";

export class Generator {
    private classCache = new Map<string, string>();
    private cssRules: string[] = [];
    private classCounter = 0;

    generate(root: IR.Block): string {
        this.classCache.clear();
        this.cssRules = [];
        this.classCounter = 0;

        const html = this.renderNode(root);
        const dynamicCss = this.cssRules.join("\n");

        const baseCss =
            `.atxt-document-root {\n` +
            `    white-space: pre-wrap;\n` +
            `    word-break: break-word;\n` +
            `}`;

        const raw =
            `<div class="atxt-document-root">\n` +
            `<style>\n${baseCss}\n` +
            `${dynamicCss}\n` +
            `</style>\n` +
            html +
            `</div>`;

        return DOMPurify.sanitize(raw, {
            ALLOWED_TAGS:
                "div/p/span/pre/h1/h2/h3/h4/h5/blockquote/ul/ol/li/aside/section/article/header/footer/style/br".split(
                    "/",
                ),
            ALLOWED_ATTR: ["class", "data-id", "style"],
            FORCE_BODY: false,
        });
    }

    private renderNode(node: IR.Node): string {
        if (node.type === "NEWLINE") return "<br>";

        if (node.type === "BLOCK" && node.props.get("hidden")?.toLowerCase() === "true") {
            return "";
        }

        const className = node.props.size > 0 ? this.resolveClass(node.props) : "";
        const classAttribute = className ? ` class="${className}"` : "";
        const dataAttribute = ` data-id="${node.id}"`;

        if (node.type === "BLOCK") {
            return this.renderBlockNode(node, classAttribute, dataAttribute);
        }

        return `<span${classAttribute}${dataAttribute}>${node.content}</span>`;
    }

    private renderBlockNode(node: IR.Block, classAttribute: string, dataAttribute: string): string {
        if (node.children.length === 0) return "";

        const tag = getHtmlTag(node.props.get("kind"));
        const childrenHtml = this.renderChildrenWithIndent(node.children, node.props.get("indent"));
        return `<${tag}${classAttribute}${dataAttribute}>${childrenHtml}</${tag}>`;
    }

    private renderChildrenWithIndent(children: IR.Node[], indentProp?: string): string {
        const indent = indentProp ? parseInt(indentProp, 10) : 0;
        if (indent === 0) return children.map((c) => this.renderNode(c)).join("");

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
        const propsForCss = new Map<string, string>();
        for (const [key, value] of props) {
            if (getCssMapping(key) !== null) propsForCss.set(key, value);
        }

        if (propsForCss.size === 0) return "";

        const signature = JSON.stringify(
            Object.fromEntries([...propsForCss.entries()].sort(([a], [b]) => a.localeCompare(b))),
        );

        if (this.classCache.has(signature)) {
            return this.classCache.get(signature)!;
        }

        const newClassName = `atxt-cls-${this.classCounter.toString(36)}`;
        this.classCounter++;
        this.classCache.set(signature, newClassName);
        this.cssRules.push(this.buildCssRule(newClassName, propsForCss));

        return newClassName;
    }

    private buildCssRule(className: string, props: IR.ResolvedProps): string {
        let cssBody = "";

        for (const [key, value] of props) {
            const mapping = getCssMapping(key)!;
            const formattedValue = formatCssUnit(value, mapping.unit);
            cssBody += `  ${mapping.cssProperty}: ${formattedValue};\n`;
        }

        return `.${className} {\n${cssBody}}`;
    }
}
