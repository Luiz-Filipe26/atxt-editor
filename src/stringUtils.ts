export function dedent(strings: TemplateStringsArray, ...values: any[]): string {
    const fullString = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "");
    const match = strings[0].match(/\n([ \t]+)/);
    const baseIndent = match ? match[1] : "";
    if (!baseIndent) return fullString.trim();
    const regex = new RegExp(`^${baseIndent}`, "gm");
    return fullString.replace(regex, "").trim();
}
