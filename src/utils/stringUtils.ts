export function dedent(
    strings: TemplateStringsArray,
    ...values: any[]
): string {
    const baseMatch = strings[0].match(/\n([ \t]+)/);
    const baseIndent = baseMatch ? baseMatch[1] : "";
    const baseRegex = new RegExp(`^${baseIndent}`, "gm");
    let result = "";
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];

        if (i < values.length) {
            const lastNewline = result.lastIndexOf("\n");
            const insertionIndent =
                lastNewline >= 0
                    ? result.slice(lastNewline + 1).match(/^([ \t]*)/)![1]
                    : "";

            const valueStr = String(values[i]);
            const indented = valueStr
                .split("\n")
                .map((line, idx) => (idx === 0 ? line : insertionIndent + line))
                .join("\n");

            result += indented;
        }
    }

    return result.replace(baseRegex, "").trim();
}
