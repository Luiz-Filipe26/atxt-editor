import { compileToIR } from "../compiler/compiler";
import { HtmlGenerator } from "../compiler/htmlGenerator";
import type { IRDocument } from "../types/ir";

export class AtxtDocument extends HTMLElement {
    private readonly shadowRoot_: ShadowRoot;
    private currentIr: IRDocument | null = null;

    constructor() {
        super();
        this.shadowRoot_ = this.attachShadow({ mode: "open" });
    }

    public render(source: string): IRDocument {
        const { ir } = compileToIR(source);
        this.shadowRoot_.innerHTML = HtmlGenerator.generate(ir.root);
        this.currentIr = ir;
        return ir;
    }

    public renderIr(ir: IRDocument): void {
        this.shadowRoot_.innerHTML = HtmlGenerator.generate(ir.root);
        this.currentIr = ir;
    }

    public get ir(): IRDocument | null {
        return this.currentIr;
    }
}

customElements.define("atxt-document", AtxtDocument);
