import DOMPurify from "isomorphic-dompurify";
import * as IR from "../types/ir";
import { getHtmlTag } from "../domain/htmlTagMapping";
import { sortedMapEntries } from "../utils/mapUtils";
import { HTML_SANITIZE_POLICY } from "../domain/htmlSanitizePolicy";
import { getIndent, isHidden, PropKey } from "../domain/annotationProperties";
import { getCssMapping, validateForCssProperty } from "../domain/cssDefinitions";
import { CompilerErrorType, type CompilerError } from "../types/errors";

export interface HtmlGeneratingResult {
    html: string;
    errors: CompilerError[];
}

export class HtmlGenerator {
    private classCache = new Map<string, string>();
    private cssRules: string[] = [];
    private classCounter = 0;
    private generatorErrors: CompilerError[] = [];
    private readonly currentIr: IR.IRDocument;

    private constructor(currentIr: IR.IRDocument) {
        this.currentIr = currentIr;
    }

    public static generate(ir: IR.IRDocument): HtmlGeneratingResult {
        const generator = new HtmlGenerator(ir);
        return generator.generate(ir);
    }

    private generate(ir: IR.IRDocument): HtmlGeneratingResult {
        const html = this.renderNode(ir.root);
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

        return {
            html: DOMPurify.sanitize(raw, HTML_SANITIZE_POLICY),
            errors: this.generatorErrors,
        };
    }

    private renderNode(node: IR.Node): string {
        if (node.type === IR.NodeType.Newline) return "<br>";
        if (isHidden(node.props)) return "";

        const className = node.props.size > 0 ? this.resolveClass(node.props, node.id) : "";
        const classAttribute = className ? ` class="${className}"` : "";
        const dataAttribute = ` data-id="${node.id}"`;

        if (node.type === IR.NodeType.Block) {
            return this.renderBlockNode(node, classAttribute, dataAttribute);
        }

        return `<span${classAttribute}${dataAttribute}>${node.content}</span>`;
    }

    private resolveClass(props: IR.ResolvedProps, nodeId: string): string {
        const cssProps = this.filterCssProps(props);
        if (cssProps.size === 0) return "";

        const signature = JSON.stringify(Object.fromEntries(sortedMapEntries(cssProps)));
        const cached = this.classCache.get(signature);
        if (cached) return cached;

        const newClassName = this.generateClassName();

        const cssRule = this.buildCssRule(newClassName, cssProps, nodeId);

        this.classCache.set(signature, newClassName);
        this.cssRules.push(cssRule);

        return newClassName;
    }

    private buildCssRule(className: string, props: IR.ResolvedProps, nodeId: string): string {
        let cssBody = "";

        for (const [key, value] of sortedMapEntries(props)) {
            const mapping = getCssMapping(key)!;
            const validation = validateForCssProperty(key, value);

            if (validation.error !== null) {
                this.pushError(`Property '${key}': ${validation.error}`, nodeId);
                continue;
            }

            cssBody += `  ${mapping.cssProperty}: ${validation.transformedValue};\n`;
        }

        return `.${className} {\n${cssBody}}`;
    }

    private renderBlockNode(node: IR.Block, classAttr: string, dataAttr: string): string {
        if (node.children.length === 0) return "";
        const tag = getHtmlTag(node.props.get(PropKey.Kind));
        const indent = getIndent(node.props);
        const childrenHtml =
            indent > 0
                ? this.renderChildrenWithIndent(node.children, indent)
                : node.children.map((c) => this.renderNode(c)).join("");

        return `<${tag}${classAttr}${dataAttr}>${childrenHtml}</${tag}>`;
    }

    private renderChildrenWithIndent(children: IR.Node[], indent: number): string {
        const spaces = " ".repeat(indent);
        let result = "";
        let atLineStart = true;
        for (const child of children) {
            if (child.type === IR.NodeType.Newline) {
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

    private filterCssProps(props: IR.ResolvedProps): IR.ResolvedProps {
        const result = new Map<string, string>();
        for (const [key, value] of props) {
            if (getCssMapping(key) !== null) result.set(key, value);
        }
        return result;
    }

    private generateClassName(): string {
        return `atxt-cls-${(this.classCounter++).toString(36)}`;
    }

    private pushError(message: string, nodeId: string) {
        /* v8 ignore next -- @preserve */
        const { line, column } = this.currentIr.nodeMap.get(nodeId) ?? { line: 0, column: 0 };
        this.generatorErrors.push({
            type: CompilerErrorType.HtmlGenerator,
            message: message,
            line,
            column,
        });
    }
}
