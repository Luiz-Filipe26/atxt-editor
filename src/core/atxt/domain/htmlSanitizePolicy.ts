import type { Config } from "dompurify";

const allowedTags =
    "div/p/span/pre/h1/h2/h3/h4/h5/blockquote/ul/ol/li/aside/section/article/header/footer/style/br";

export const HTML_SANITIZE_POLICY: Config = {
    ALLOWED_TAGS: allowedTags.split("/"),
    ALLOWED_ATTR: ["class", "data-id", "style"],
    FORCE_BODY: false,
};
