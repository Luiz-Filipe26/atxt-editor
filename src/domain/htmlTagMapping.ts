const KIND_TAG_REGISTRY: Record<string, string> = {
    paragraph: "p",
    heading1: "h1",
    heading2: "h2",
    heading3: "h3",
    heading4: "h4",
    heading5: "h5",
    code: "pre",
    item: "li",
    quote: "blockquote",
    list: "ul",
    "ordered-list": "ol",
    aside: "aside",
    section: "section",
    article: "article",
    header: "header",
    footer: "footer",
};

export function getHtmlTag(kind: string): string {
    return KIND_TAG_REGISTRY[kind] ?? "div";
}
