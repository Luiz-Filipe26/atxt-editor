import DOMPurify from "isomorphic-dompurify";
import * as IR from "../types/ir";
import { formatCssUnit, getCssMapping } from "../domain/cssPropertyMapping";
import { getHtmlTag } from "../domain/htmlTagMapping";
import { dedent } from "../utils/stringUtils";

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

        const baseCss = dedent`
            .atxt-document-root {
                white-space: pre-wrap;
                word-break: break-word;
            }
        `;

        const raw = dedent`
            <div class="atxt-document-root">
                <style>
                    ${baseCss}
                    ${dynamicCss}
                </style>
                ${html}
            </div>
        `;

        return DOMPurify.sanitize(raw, {
            ALLOWED_TAGS: [
                "div",
                "p",
                "span",
                "pre",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "blockquote",
                "ul",
                "ol",
                "li",
                "aside",
                "section",
                "article",
                "header",
                "footer",
                "style",
            ],
            ALLOWED_ATTR: ["class", "data-id", "style"],
            FORCE_BODY: false,
        });
    }

    private renderNode(node: IR.Node): string {
        if (node.type === "BLOCK" && node.props["hidden"]?.toLowerCase() === "true") {
            return "";
        }

        const className = Object.keys(node.props).length > 0 ? this.resolveClass(node.props) : "";
        const classAttribute = className ? ` class="${className}"` : "";
        const dataAttribute = ` data-id="${node.id}"`;

        switch (node.type) {
            case "BLOCK":
                return this.renderBlockNode(node, classAttribute, dataAttribute);
            case "TEXT":
                return `<span${classAttribute}${dataAttribute}>${node.content}</span>`;
        }
    }

    private renderBlockNode(node: IR.Block, classAttribute: string, dataAttribute: string): string {
        if (node.children.length === 0) {
            return "";
        }

        const tag = getHtmlTag(node.props["kind"]);
        const childrenHtml = node.children.map((child) => this.renderNode(child)).join("");
        return `<${tag}${classAttribute}${dataAttribute}>${childrenHtml}</${tag}>`;
    }

    private resolveClass(props: IR.ResolvedProps): string {
        const propsForCss = Object.fromEntries(
            Object.entries(props).filter(([key]) => getCssMapping(key) !== null),
        );

        if (Object.keys(propsForCss).length === 0) return "";

        const signature = JSON.stringify(
            Object.fromEntries(
                Object.keys(propsForCss)
                    .sort()
                    .map((k) => [k, propsForCss[k]]),
            ),
        );

        if (this.classCache.has(signature)) {
            return this.classCache.get(signature)!;
        }

        const newClassName = `atxt-editor-${this.classCounter.toString(36)}`;
        this.classCounter++;
        this.classCache.set(signature, newClassName);
        this.cssRules.push(this.buildCssRule(newClassName, propsForCss));

        return newClassName;
    }

    private buildCssRule(className: string, props: IR.ResolvedProps): string {
        let cssBody = "";

        for (const [key, value] of Object.entries(props)) {
            const mapping = getCssMapping(key)!;
            const formattedValue = formatCssUnit(value, mapping.unit);
            cssBody += `  ${mapping.cssProperty}: ${formattedValue};\n`;
        }

        return `.${className} {\n${cssBody}}`;
    }
}
