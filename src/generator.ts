import type { IRBlock, IRNode, IRText } from "./hydrator";

const CSS_MAPPER: Record<string, string> = {
    fill: "background-color",
    radius: "border-radius",
    padding: "padding",
    margin: "margin",
    border: "border",
    width: "width",
    height: "height",
    align: "text-align",
    color: "color",
    font: "font-family",
    size: "font-size",
    weight: "font-weight",
    style: "font-style",
    "line-height": "line-height",
    decoration: "text-decoration",
};

export class Generator {
    private classCache = new Map<string, string>();
    private cssRules: string[] = [];
    private classCounter = 0;

    public generate(root: IRBlock): string {
        // <- Agora retorna só string
        this.classCache.clear();
        this.cssRules = [];
        this.classCounter = 0;

        const html = this.renderNode(root);
        const dynamicCss = this.cssRules.join("\n");

        const baseCss = `
.atxt-document-root {
    white-space: pre-wrap;
    word-break: break-word;
}`;

        return `
<div class="atxt-document-root">
    <style>
${baseCss}
${dynamicCss}
    </style>
${html}
</div>`;
    }

    private renderNode(node: IRNode): string {
        let className = "";
        const propKeys = Object.keys(node.props);

        if (propKeys.length > 0) {
            className = this.resolveClass(node.props);
        }

        const classAttribute = className ? ` class="${className}"` : "";

        if (node.type === "BLOCK") {
            const block = node as IRBlock;
            const childrenHtml = block.children
                .map((child: IRNode) => this.renderNode(child))
                .join("");

            if (!className) return childrenHtml;

            const tag = this.requiresBlockTag(node.props) ? "div" : "span";
            return `<${tag}${classAttribute}>${childrenHtml}</${tag}>`;
        }

        if (node.type === "TEXT") {
            const textNode = node as IRText;
            if (!className) {
                return textNode.content;
            }

            const tag = this.requiresBlockTag(node.props) ? "div" : "span";
            return `<${tag}${classAttribute}>${textNode.content}</${tag}>`;
        }

        return "";
    }

    private requiresBlockTag(props: Record<string, any>): boolean {
        const blockProperties = ["align", "margin", "width", "height"];
        return Object.keys(props).some((key) => blockProperties.includes(key));
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
            if (CSS_MAPPER[key]) {
                const formattedValue = this.formatCssValue(key, String(value));
                cssBody += `  ${CSS_MAPPER[key]}: ${formattedValue};\n`;
                continue;
            }
        }

        return `.${className} {\n${cssBody}}`;
    }

    private formatCssValue(key: string, value: string): string {
        const needsPx = ["size", "radius", "width", "height"];
        const multiPx = ["margin", "padding"];

        if (needsPx.includes(key)) {
            return /^-?\d+$/.test(value) ? `${value}px` : value;
        }

        if (multiPx.includes(key)) {
            return value
                .split(" ")
                .map((v) => {
                    return /^-?\d+$/.test(v) && v !== "0" ? `${v}px` : v;
                })
                .join(" ");
        }

        return value;
    }
}
