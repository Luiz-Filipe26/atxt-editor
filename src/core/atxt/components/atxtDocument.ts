import { compileToIR } from "../compiler/compiler";
import { HtmlGenerator } from "../compiler/htmlGenerator";
import type { IRDocument } from "../types/ir";

export class AtxtDocument extends HTMLElement {
    private readonly shadowRoot_: ShadowRoot;
    private currentIr: IRDocument | null = null;

    private static readonly BASE_STYLE = `
        <style>
            :host {
                display: block;
                height: 100%;
                overflow-y: auto;
                overflow-x: auto; 
                box-sizing: border-box;
            }

            .document-body {
                width: var(--atxt-doc-width, 84ch);
                margin: var(--atxt-doc-margin, 0 auto);
                padding: var(--atxt-doc-padding, 40px 20px);
                box-sizing: border-box;

                background: #fff;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);

                transform: scale(var(--atxt-doc-zoom, 1));
                transform-origin: top center;
                transition: transform 0.2s ease-out;
            }
        </style>
    `;

    constructor() {
        super();
        this.shadowRoot_ = this.attachShadow({ mode: "open" });
    }

    public render(source: string): IRDocument {
        const ir = compileToIR(source).ir;
        this.renderIr(ir);
        return ir;
    }

    public renderIr(ir: IRDocument): void {
        const generatedHtml = HtmlGenerator.generate(ir).html;

        this.shadowRoot_.innerHTML = `
            ${AtxtDocument.BASE_STYLE}
            <div class="document-body">
                ${generatedHtml}
            </div>
        `;

        this.currentIr = ir;
    }

    public get ir(): IRDocument | null {
        return this.currentIr;
    }
}

customElements.define("atxt-document", AtxtDocument);
