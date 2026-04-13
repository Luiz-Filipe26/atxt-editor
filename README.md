# ATXT — Annotated Text

[**Open ATXT Studio (Live Demo)**](https://luiz-filipe26.github.io/atxt-editor/)

ATXT is a document protocol with a live reference implementation available directly in the browser. Its canonical form is a plain-text file that compiles to HTML, PDF, and DOCX through pluggable output generators.

It occupies the space between Markdown (too limited for rich documents) and DOCX (opaque, binary, undiffable). An `.atxt` file is human-readable, Git-diffable, and expressive enough to produce corporate-grade documents.

→ [Language Specification](./SPEC.md)

---

## The problem

Word documents are binary ZIP archives. Tracking changes in a `.docx` with Git produces noise, not signal. Markdown is diffable but cannot express the formatting requirements of a contract, a report, or a technical manual.

ATXT is the answer to: _what if a rich document were also plain text?_

---

## Syntax overview

ATXT uses `[[ ]]` annotations to declare properties. Properties apply to the next line, an inline span, or a delimited block `{ }`.

```atxt
[[DEFINE class: heading; size: 26; weight: bold; align: center]]
[[DEFINE class: warning-block; fill: #fff8f0; padding: 24; border: 2px solid #e0a060; radius: 6]]

[[SET font: Georgia, serif; size: 15; line-height: 1.8; align: justify]]

[[class: heading]]
SOFTWARE DEVELOPMENT SERVICES AGREEMENT

This Agreement is entered into as of March 12, 2026, by and between
Meridian Software Studio LLC ("Service Provider") and Calloway Enterprises
Inc. ("Client"). The parties agree as follows.

[[class: warning-block]] {
    [[+weight: bold]]LIMITATION OF LIABILITY[[-weight]]

    In no event shall either party be liable for indirect or consequential
    damages. Total liability shall not exceed the [[+weight: bold]]Contract Price[[-weight]].
}
```

Shorthand sugar for common cases:

```atxt
# Heading 1
## Heading 2
> Blockquote
- List item
**bold**  _italic_  ~~strikethrough~~
```

---

## Compiler pipeline

```
Source .atxt → Lexer → Parser → Lowerer → IR → Generator
```

| Stage         | Responsibility                                                |
| ------------- | ------------------------------------------------------------- |
| **Lexer**     | Tokenizes raw text. Manages annotation mode stack.            |
| **Parser**    | Builds the AST. Resolves annotation targets. Expands symbols. |
| **Lowerer**  | Resolves classes and properties. Produces the IR.             |
| **Generator** | Consumes the IR. Produces the target format.                  |

Generators are pluggable. The same IR produces HTML today; DOCX and PDF generators are planned.

---

## The `.atz` package

An `.atz` file is a ZIP archive containing a `main.atxt` document alongside its assets (images, data sources, transform pipelines). The `.atxt` source remains plain text inside the package and is independently versionable with Git.

---

## Interactive Playground

The ATXT Studio is a reference implementation of the compiler pipeline running entirely client-side.

[**Open ATXT Studio (Live Demo)**](https://luiz-filipe26.github.io/atxt-editor/)

This lightweight static application serves as a visual debugger for the full compilation stack:
- **Compiler Transparency:** Real-time inspection of Lexer Tokens, AST, and IR via browser Developer Tools (Console).
- **Visual Source Mapping:** Double-click any rendered element to resolve its exact line and column in the source editor.
- **Real-time Rendering:** Side-by-side preview with sub-100ms compilation debounce.
- **Canonical Export:** Serialization of the current IR into a normalized `.atxt` file.
- **Local Persistence:** Automatic draft caching via `localStorage`.

---

## Local Development

To compile `.atxt` files locally or contribute to the core compiler, you can set up the development environment. The project uses **Vite** and **TypeScript**.

```bash
npm install
npm run dev
```

## Status

Active development. See the [Language Specification](./SPEC.md) for the formal definition of the language, compiler pipeline, property system, and IR invariants.

---

## Design principles

- **Turing-incomplete by design.** ATXT describes documents. It does not execute programs.
- **Output-agnostic.** The source is independent of the rendering target.
- **Diffable.** Every meaningful change produces a clean, minimal diff.
- **Extensible without compiler changes.** Custom classes and symbols are defined in the document itself.
