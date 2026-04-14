# ATXT Language Specification — v1.0

> **Status:** Working Draft  
> **Format:** Annotated Text (`.atxt`)  
> **Package:** Annotated Text Zip (`.atz`)

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [Notation](#2-notation)
3. [Lexical Grammar](#3-lexical-grammar)
4. [Syntactic Grammar](#4-syntactic-grammar)
5. [Directives](#5-directives)
6. [Property System](#6-property-system)
7. [Class System](#7-class-system)
8. [Toggle System](#8-toggle-system)
9. [Symbol System](#9-symbol-system)
10. [Compiler Pipeline](#10-compiler-pipeline)
11. [Intermediate Representation](#11-intermediate-representation)
12. [Whitespace and Escape Rules](#12-whitespace-and-escape-rules)
13. [Error Model](#13-error-model)
14. [The `.atz` Package Format](#14-the-atz-package-format)
15. [Template System](#15-template-system)
16. [Serializer](#16-serializer)

---

## 1. Philosophy

ATXT is a document protocol, not a document format. Its canonical form is a plain-text file editable by hand, by a WYSIWYG editor, or by automated tooling — without any of these modes corrupting the output of the others.

Five properties hold simultaneously:

1. **Human-readable** — the source file is intelligible without tooling.
2. **Diffable** — every meaningful change produces a clean, minimal diff.
3. **Semantically rich** — supports the full expressive range of a corporate document.
4. **WYSIWYG-compatible** — a visual editor serializes back to canonical ATXT.
5. **Output-agnostic** — the same source compiles to HTML, PDF, and DOCX via pluggable Generators.

ATXT is **Turing-incomplete by design**. It describes documents; it does not execute programs. There are no macros, no runtime evaluation, and no dynamic state beyond what is declared in the source text.

The Template System (§15) extends ATXT with placeholder resolution and computed text injection without violating this guarantee. See §15.1 for the architectural rationale.

---

## 2. Notation

This specification uses a subset of EBNF:

| Notation | Meaning |
|---|---|
| `=` | Definition |
| `;` | End of rule |
| `\|` | Alternation |
| `[ x ]` | Optional |
| `{ x }` | Zero or more repetitions |
| `( x )` | Grouping |
| `"x"` | Terminal string |
| `'x'` | Terminal string (alternate) |
| `? desc ?` | Natural-language description |

---

## 3. Lexical Grammar

### 3.1 Character Set

ATXT source files are UTF-8 encoded. All Unicode scalar values are valid in text content. The following ASCII characters have structural significance at the lexer level:

```
[  ]  {  }  \  "  '  +  -  :  ;  newline  space  tab
```

Symbol sequences such as `**`, `_`, `~~`, `#`, `>`, `-`, and `+` carry no structural significance to the Lexer. They are emitted as plain `TEXT` tokens and expanded into AST nodes by the `SymbolParser` after lexing (see §9).

### 3.2 Tokens

```ebnf
token
  = ANNOTATION_OPEN
  | ANNOTATION_CLOSE
  | BLOCK_OPEN
  | BLOCK_CLOSE
  | IDENTIFIER
  | TOGGLE_PLUS
  | TOGGLE_MINUS
  | COLON
  | SEMICOLON
  | VALUE
  | TEXT
  | NEWLINE
  | EOF
  ;

ANNOTATION_OPEN  = "[[" ;
ANNOTATION_CLOSE = "]]" ;
BLOCK_OPEN       = "{" ;
BLOCK_CLOSE      = "}" ;
TOGGLE_PLUS      = "+" ;
TOGGLE_MINUS     = "-" ;
COLON            = ":" ;
SEMICOLON        = ";" ;
NEWLINE          = "\n" ;
```

`IDENTIFIER` carries a property key name. `VALUE` carries a property value string. `TEXT` carries raw document text (including any symbol sequences, which are handled post-lexing).

### 3.3 Lexer Modes

The Lexer operates in three exclusive modes managed via a mode stack:

| Mode | Transitions |
|---|---|
| `NORMAL` | `[[` → push `ANNOTATION_KEY` |
| `ANNOTATION_KEY` | `:` → replace with `ANNOTATION_VALUE`; `]]` → pop |
| `ANNOTATION_VALUE` | `;` → replace with `ANNOTATION_KEY`; `]]` → pop |

A single `]` inside an annotation that is not followed by a second `]` is a lexer error.

### 3.4 Property Key

Inside an annotation, a property key is lexed as a sequence of tokens. The optional toggle prefix is emitted as a distinct `TOGGLE_PLUS` or `TOGGLE_MINUS` token before the `IDENTIFIER` token carrying the key name:

```ebnf
prop_key_tokens
  = [ TOGGLE_PLUS | TOGGLE_MINUS ] IDENTIFIER ;

key_name
  = key_char { key_char } ;

key_char
  = ? ASCII letter (a–z, A–Z) ? | ? ASCII digit (0–9) ? | "-" | "_" ;
```

Property key names are restricted to ASCII. A key prefixed with `+` is a toggle-add; a key prefixed with `-` is a toggle-remove; an unprefixed key is a direct assignment.

### 3.5 Property Value

```ebnf
prop_value
  = quoted_string | unquoted_value ;

quoted_string
  = ( '"' { ? any character except '"' and unescaped newline ? } '"' )
  | ( "'" { ? any character except "'" and unescaped newline ? } "'" ) ;

unquoted_value
  = { ? any character except ']', ';', '"', "'", and newline ? } ;
```

Leading and trailing whitespace is stripped from unquoted values. Both single and double quotes are accepted for quoted strings.

### 3.6 Whitespace at Line Start

Leading whitespace (spaces and tabs) at the start of a line is stripped before tokenization. To preserve intentional leading space, prefix with the escape character: `\ ` (backslash followed by space) at the start of a line produces a single literal space and suppresses further stripping.

---

## 4. Syntactic Grammar

### 4.1 Document

```ebnf
document
  = { statement } EOF ;

statement
  = annotation_statement
  | block_statement
  | text_line
  | NEWLINE
  ;
```

### 4.2 Annotation Statement

```ebnf
annotation_statement
  = annotation [ annotation_target ] ;

annotation
  = ANNOTATION_OPEN property_list ANNOTATION_CLOSE ;

property_list
  = property { SEMICOLON property } [ SEMICOLON ] ;

property
  = [ TOGGLE_PLUS | TOGGLE_MINUS ] IDENTIFIER [ COLON VALUE ] ;

annotation_target
  = block_statement
  | text_line
  ;
```

**Target resolution rule:** If tokens of non-whitespace text follow the annotation on the same line, those tokens form the target (inline target). If no such tokens exist, the parser skips whitespace and newlines and captures the next non-empty line or block as the target.

Annotations whose property list contains only toggle properties (all keys prefixed with `+` or `-`) have no target. They apply to the propertyContext of the enclosing scope.

### 4.3 Block Statement

```ebnf
block_statement
  = BLOCK_OPEN [ NEWLINE ] { statement } BLOCK_CLOSE ;
```

Blocks may be nested arbitrarily. A block opened with `{` must be closed with `}`. An unclosed block is a parser error. The single optional `NEWLINE` immediately after `{` is consumed by the parser and does not produce a `NewlineNode` in the AST.

#### Anonymous scope blocks

A `{ }` that is not the target of an annotation is an **anonymous scope block**. Its purpose is to limit the scope of `SET` directives and toggle annotations — when the block closes, all propertyContext state accumulated inside it is discarded.

```atxt
{
    [[SET color: gray]]
    This text is gray.
}
This text is unaffected — the SET did not escape the block.
```

An anonymous scope block carries no semantic information beyond scope delimitation. It produces an `IR.Block` in the IR with no properties, no classes, and no ownProps. The Serializer preserves it as a bare `{ }` — it is never flattened or discarded, because it may be structurally significant to selectors and to the WYSIWYG editor.

### 4.4 Text Line

```ebnf
text_line
  = text_segment { text_segment } NEWLINE ;

text_segment
  = inline_symbol_span
  | raw_text
  ;

raw_text
  = { ? any token except NEWLINE, BLOCK_OPEN, BLOCK_CLOSE, ANNOTATION_OPEN ? } ;
```

Symbol expansion within `text_segment` is performed by the `SymbolParser` after the Parser has handed off the `TEXT` token (see §9).

#### NEWLINE invariant

The Parser enforces a strict invariant: **a NEWLINE token reaches the AST as a `NewlineNode` only when it is content** — that is, when it terminates a line of text or separates paragraphs within a block. Structural newlines — those that terminate an annotation line, a target line, or a block opening brace — are consumed by the Parser and never reach the AST.

Specifically:
- The NEWLINE after an annotation with no target is consumed by `handleAnnotationNewline`.
- The NEWLINE after a `HIDE` directive's target is consumed by `resolveAnnotationTarget`.
- The single optional NEWLINE immediately after `{` is consumed by `parseBlock`.
- The trailing NEWLINE at the end of a block's content is removed by `parseBlock` before returning.
- The NEWLINE terminating a target line is consumed by `consumeTargetLine`.

This invariant ensures that every `NewlineNode` in the AST represents authorial intent — a line break the author explicitly wrote between content lines.

---

## 5. Directives

A directive is a special annotation whose first token is an uppercase keyword. The five built-in directives are `SET`, `DEFINE`, `HIDE`, `SYMBOL`, and `NORMAL` (the absence of a directive keyword is the `NORMAL` case).

```ebnf
directive
  = set_directive
  | define_directive
  | hide_directive
  | symbol_directive
  | normal_directive
  ;

set_directive
  = ANNOTATION_OPEN "SET" property_list ANNOTATION_CLOSE ;

define_directive
  = ANNOTATION_OPEN "DEFINE" define_body ANNOTATION_CLOSE ;

hide_directive
  = ANNOTATION_OPEN "HIDE" [ property_list ] ANNOTATION_CLOSE annotation_target ;

symbol_directive
  = ANNOTATION_OPEN "SYMBOL" symbol_body ANNOTATION_CLOSE ;

normal_directive
  = annotation ;   (* no uppercase keyword — the default case *)
```

### 5.1 SET

`[[SET prop: val]]` propagates the specified properties through all subsequent sibling nodes within the current block scope. The propagation does not escape to parent or sibling blocks.

`SET` is syntactic sugar for an annotation with an explicit block target. The following two forms are semantically equivalent:

```atxt
[[SET font: Georgia, serif; size: 15]]
Line one.
Line two.
```

```atxt
[[font: Georgia, serif; size: 15]] {
    Line one.
    Line two.
}
```

Both produce the same IR. `SET` is therefore a convenience directive — it applies its properties to all remaining siblings in the current scope, exactly as if those siblings were wrapped in an annotated block.

**Inline props propagation:** `SET` routes its properties by scope before applying them. Block-scope properties are applied to the wrapper block's `props`. Inline-scope properties are passed as `inheritedProps` to child nodes within the wrapper, ensuring that typographic properties such as `font`, `size`, and `color` propagate correctly to `IR.Text` nodes.

### 5.2 DEFINE

`[[DEFINE class: name; prop: val; ...]]` registers a named class in the `PropertyResolver`. A `merge: other-class` property may be included to copy all properties from one or more previously defined classes before applying the class's own properties.

### 5.3 NORMAL

A `NORMAL` annotation is the default case — any annotation that carries no uppercase directive keyword. It applies its properties to its resolved target and does not propagate.

### 5.4 HIDE

`[[HIDE]]` is a source-level suppression directive. The Parser consumes its target and discards it entirely — the target never reaches the AST or the IR. It is the appropriate tool for author notes, draft passages, and any content that has no role in the rendered document.

`[[HIDE]]` accepts optional properties following the same syntax as other directives, but those properties are discarded along with the target. They serve only as documentation for the author reading the source:

```atxt
[[HIDE]]
This line is suppressed.

[[HIDE class: draft]]
This line is suppressed and will emerge styled as draft when reactivated.

[[HIDE class: draft]] {
    This entire block is suppressed.
    It may contain multiple paragraphs and annotations.
}
```

### 5.5 SYMBOL

`[[SYMBOL symbol: seq; prop: val; ...; type: inline|block]]` registers a custom symbol in the Parser's symbol registry. See §9.3.

The `SYMBOL` directive is consumed entirely by the Parser and never reaches the AST or the IR. The Lowerer is unaware of symbol definitions.

The `type` property is optional and defaults to `inline` when omitted. A `SYMBOL` directive that lacks either a `symbol` property or any content properties (beyond `symbol` and `type`) is silently ignored.

---

## 6. Property System

### 6.1 Property Registry

Every valid property is declared in the property registry. A property declaration specifies:

- `scope`: `"block"` or `"inline"`
- `container`: a boolean flag indicating whether this property establishes a visual container. Block-scope properties marked `container: true` suppress leaf-block promotion to `paragraph` (see §6.5).
- `validate`: a predicate on the string value

Properties not in the registry are rejected at lowering time with a `LOWERER` warning.

Boolean properties are validated case-insensitively. `True`, `TRUE`, and `true` are all accepted.

### 6.2 Built-in Properties

#### Block-scope properties

| Property | `container` | Expected value |
|---|---|---|
| `fill` | yes | CSS color string |
| `radius` | yes | Positive integer (px) |
| `indent` | no | Non-negative integer (spaces) |
| `padding` | yes | 1–4 space-separated non-negative integers |
| `margin` | yes | 1–4 space-separated non-negative integers |
| `border` | yes | Non-empty string matching `/^[a-zA-Z0-9#%.\-\s]+$/` |
| `width` | yes | Positive integer (px) |
| `height` | yes | Positive integer (px) |
| `align` | no | `left` \| `center` \| `right` \| `justify` |
| `kind` | no | See §6.5 |
| `hidden` | no | `true` \| `false` (case-insensitive) |

A node with `hidden: true` arrives in the IR and is skipped by the Generator in standard rendering mode. Because the node is present in the IR, WYSIWYG tools may implement a revision mode that renders hidden nodes with a distinct visual treatment, allowing the author to reactivate them by removing the property.

#### Inline-scope properties

| Property | Expected value |
|---|---|
| `color` | CSS color string |
| `font` | Font family name (non-empty string, max 255 chars) |
| `size` | Positive number, decimals accepted (px) |
| `weight` | `normal` \| `bold` \| `bolder` \| `lighter` \| integer 1–1000 |
| `style` | `normal` \| `italic` \| `oblique` |
| `line-height` | Positive number OR the literal string `normal` |
| `decoration` | `none` \| `underline` \| `line-through` \| `overline` |

### 6.3 Scope Enforcement

Block-scope properties are applied exclusively to `BLOCK` IR nodes. Inline-scope properties are applied exclusively to `TEXT` IR nodes. The Lowerer routes properties by scope before constructing the IR. A Generator never receives a node containing properties outside its scope.

This prevents CSS inheritance from leaking typographic styles from parent blocks into child text nodes.

### 6.4 Style Resolution Order

Within a single node, properties are resolved in ascending priority:

1. **Compiler defaults** — a baseline `size: 16` is applied to the document root before any author-declared properties. This ensures all text has a predictable default size regardless of the output format or rendering environment. Authors may override this at any scope with a more specific annotation or `SET`.
2. Properties inherited via `SET` propagation (propertyContext)
3. Properties from an applied class (`[[class: name]]`)
4. Properties declared inline on the annotation

Higher-priority values overwrite lower-priority values for the same key.

### 6.5 The `kind` Property

`kind` declares the semantic nature of a block. It is a block-scope property and participates in the property registry like any other. Its values are document-semantic names with no commitment to any output format.

#### Valid values and their HTML equivalents

| `kind` value | HTML tag | Leaf-compatible |
|---|---|---|
| `paragraph` | `<p>` | yes |
| `heading1` | `<h1>` | yes |
| `heading2` | `<h2>` | yes |
| `heading3` | `<h3>` | yes |
| `heading4` | `<h4>` | yes |
| `heading5` | `<h5>` | yes |
| `code` | `<pre>` | yes |
| `item` | `<li>` | yes |
| `quote` | `<blockquote>` | yes |
| `list` | `<ul>` | no |
| `ordered-list` | `<ol>` | no |
| `aside` | `<aside>` | no |
| `section` | `<section>` | no |
| `article` | `<article>` | no |
| `header` | `<header>` | no |
| `footer` | `<footer>` | no |

A block with no `kind` property renders as `<div>` in the HTML Generator unless leaf-node promotion applies (see below). A text node renders as `<span>`.

#### Leaf-node promotion

A **leaf block** is an `IR.Block` whose `children` array contains only `IR.Text` and `IR.Newline` nodes — no nested `IR.Block`. This is a structural property of the IR, not a property declared in the source.

The Lowerer applies the following promotion rule: if a leaf block carries no explicit `kind` **and none of its block-scope properties are marked `container: true`**, the block is assigned `kind: paragraph` before the IR is produced. This means plain text lines produce `<p>` elements without any annotation from the author.

```atxt
This line is promoted to paragraph automatically.

[[fill: #f0f0f0]]
This annotated line is NOT promoted — 'fill' is a container property.
It renders as <div> with a background color.

[[align: center]]
This annotated line IS promoted — 'align' is not a container property.
It renders as <p> with centered text.
```

A non-leaf block (containing at least one child `IR.Block`) is never promoted. It renders as `<div>` unless an explicit `kind` is declared.

#### Structural compatibility

The `leaf-compatible` column in the kind table above indicates whether a `kind` value is valid on leaf blocks only. When a block is declared with a leaf-compatible `kind` but contains child blocks, the Lowerer emits an error.

```atxt
[[kind: paragraph]] {
    Normal text here.
    [[kind: section]] {
        This nested block makes kind: paragraph structurally invalid.
    }
}
```

This produces a Lowerer error. The document author must either remove the `kind: paragraph` declaration or restructure the content.

#### `kind` in classes

Because `kind` is a regular block-scope property, it may appear in a `DEFINE` declaration alongside any other block-scope properties:

```atxt
[[DEFINE class: callout; kind: aside; fill: #fffbe6; padding: 16]]

[[class: callout]] {
    This block is an <aside> with a yellow background.
}
```

This is a meaningful advantage over CSS: a class in ATXT can change the semantic element type of a block, not just its visual presentation. In CSS, a class cannot promote a `<div>` to a `<section>`.

#### The `indent` property

`indent` declares character-level indentation: the number of literal space characters prepended to the beginning of each line of content within the block. It is a block-scope property, but its effect is applied by the **Generator**, not the Lowerer.

The Lowerer preserves `indent` in the block's `props` unchanged. Each Generator is responsible for interpreting `indent` appropriately for its output format. The HTML Generator prepends literal space characters before the first node of each line. The DOCX Generator may translate `indent` to native paragraph indentation.

This separation ensures that `indent` in the IR always reflects the author's intent, not a rendered artifact — making the IR portable across output formats and serializable without data loss.

---

## 7. Class System

### 7.1 Defining a Class

```atxt
[[DEFINE class: name; prop: val; prop2: val2]]
```

A class definition registers a named bag of properties in the `PropertyResolver`. The name must be a valid `key_name`. If a class name is redefined, the new definition silently replaces the previous one.

### 7.2 Applying a Class

```atxt
[[class: name]] target
```

All properties registered under `name` are applied to the target node. Inline properties on the same annotation override class properties for conflicting keys.

### 7.3 Merging via `merge`

```atxt
[[DEFINE class: child; merge: base emphasis; size: 14]]
```

`merge` copies all properties from the named classes into the new class definition, left to right, before applying the remaining properties. A class listed later in the value overwrites conflicting keys from a class listed earlier. The class's own properties take final precedence over all merged values. All referenced classes must have been defined before this declaration.

### 7.4 Default Classes

There are no built-in default classes. All classes used in a document must be explicitly declared with `[[DEFINE]]` before first use.

A class may include `kind` among its properties. When a class carrying `kind` is applied to a block, the block acquires that semantic type. See §6.5.

---

## 8. Toggle System

### 8.1 Toggle Syntax

```atxt
[[+prop: val]] text begins here
[[+prop2: val2]]
more text inheriting both props
[[-prop]]
text with only prop2
```

A `+prop: val` annotation adds `prop` to the **propertyContext** — a set of properties that propagates to subsequent sibling text nodes within the current block scope.

A `-prop` annotation removes `prop` from the propertyContext. The value argument is not allowed on a remove toggle.

### 8.2 Toggle Scope

The propertyContext is scoped to the enclosing block. It does not propagate to the parent block, sibling blocks, or child blocks. When a block closes, its propertyContext is discarded.

Anonymous scope blocks (§4.3) are the primary tool for limiting toggle scope without introducing semantic structure:

```atxt
{
    [[+weight: bold]]
    This text is bold.
}
This text is not bold — the toggle did not escape the anonymous block.
```

### 8.3 Toggle Annotations Have No Target

An annotation whose property list consists exclusively of toggle operations (`+` or `-` prefixed keys) does not resolve a target. It modifies the propertyContext in place. Attempting to assign a block or line target to a toggle-only annotation is a parser error.

### 8.4 Toggle Stack Semantics

The propertyContext maintains a **stack per property key**. This enables safe nesting of toggles for the same property:

- `[[+weight: bold]]` pushes `"bold"` onto the `weight` stack.
- `[[+weight: 900]]` pushes `"900"` onto the `weight` stack.
- `[[-weight]]` pops the top value, restoring the previous value.

This means `[[-prop]]` never destroys state that was set by an outer toggle — it only undoes the most recent `[[+prop]]` in the current nesting. If the stack for a key becomes empty after a pop, the property is removed from the propertyContext entirely.

### 8.5 Class Expansion in Toggles

When `[[+class: name]]` is used as a toggle, the class name is pushed onto the `class` key of the propertyContext, and each of the class's concrete properties is individually pushed onto its respective stack. `[[-class]]` pops the top entry from the `class` stack and pops exactly the properties that the corresponding `[[+class]]` pushed — no more, no less.

```atxt
[[DEFINE class: legal-term; color: #1a3a6e; weight: bold]]

[[+class: legal-term]]Service Provider[[-class]]
```

This is internally equivalent to:

```atxt
[[+color: #1a3a6e; +weight: bold]]Service Provider[[-color; -weight]]
```

The class name is a convenience for the author. In the produced `IR.Text` nodes, only the concrete resolved properties appear — not the class name.

### 8.6 Text Slicing

Because inline styles may overlap arbitrarily via toggles, the Lowerer produces flat runs of `TEXT` nodes with complete, explicit property sets per node. Each `TEXT` node carries the full snapshot of the propertyContext at the moment of its creation. No two adjacent `TEXT` nodes share a reference to the same property set.

This model enables overlapping styles that cannot be represented as a strict tree hierarchy.

---

## 9. Symbol System

Symbols are syntactic sugar that the Parser expands into AST nodes via the `SymbolParser`. The Lowerer is unaware of their origin.

### 9.1 Built-in Inline Symbols

| Symbol | Properties applied |
|---|---|
| `**text**` | `weight: bold` |
| `_text_` | `style: italic` |
| `~~text~~` | `decoration: line-through` |

Inline symbols expand to toggle-open and toggle-close annotation pairs around the enclosed content. An inline symbol with empty content between its delimiters is treated as literal text.

The closing delimiter of an inline symbol is always the reverse of the opening sequence, with paired bracket-like characters mirrored appropriately (see §9.4). For symmetric symbols (`**`, `_`, `~~`) the closing is identical to the opening.

### 9.2 Built-in Block Symbols

Block symbols are recognized exclusively when they appear at the start of a `TEXT` token (i.e. the first non-whitespace content of a line). The space character is part of the registered symbol sequence.

| Symbol sequence | Properties applied |
|---|---|
| `"# "` | `kind: heading1; size: 32; weight: bold` |
| `"## "` | `kind: heading2; size: 24; weight: bold` |
| `"### "` | `kind: heading3; size: 18; weight: bold` |
| `"#### "` | `kind: heading4; size: 16; weight: bold` |
| `"##### "` | `kind: heading5; size: 14; weight: bold` |
| `"> "` | `kind: quote; color: gray; indent: 4` |
| `"- "` | `kind: item; indent: 2` |
| `"+ "` | `kind: item; indent: 2` |

The space is consumed as part of the match: for `"# Heading"`, the `SymbolParser` consumes `"# "` (two characters) and the target text starts at `"Heading"`. A block symbol sequence that appears anywhere other than position 0 of the text token is treated as literal text.

When two registered sequences share a prefix (e.g. `"# "` and `"## "`), the longest matching sequence takes precedence (maximal munch via the Trie).

### 9.3 Custom Symbols

Symbols may be declared with any combination of valid content properties:

```atxt
[[SYMBOL symbol: ++; class: highlight; type: inline]]
[[SYMBOL symbol: ^^; color: #1a3a6e; weight: bold; type: inline]]
[[SYMBOL symbol: §; kind: section; type: block]]
```

The `type` property is optional and defaults to `inline`. A `SYMBOL` directive that lacks a `symbol` property, or that provides no content properties beyond `symbol` and `type`, is silently ignored.

Custom symbol definitions register a new sequence in the `SymbolDetector`'s Trie. They must appear before first use in the document. Entirely new custom symbols (e.g., `++`) may be registered anywhere in the document and take effect from that point forward.

**The Document Preamble:** The preamble is the structural region at the absolute beginning of a document. It remains active through blank lines and blocks, and **terminates irreversibly the moment the first character of raw text content is parsed**.

**Redefining Built-in Symbols:** A document may redefine a built-in symbol (e.g., `**`, `# `), but **strictly within the document preamble**. Once the preamble is closed by text content, attempting to redefine a built-in symbol produces a parser error. This structural invariant guarantees that a document's core semantic markers cannot be maliciously hijacked or accidentally corrupted mid-document.

**Closing sequence:** For inline symbols, the closing delimiter is derived by reversing the character sequence of the opening, replacing bracket-like characters with their semantic counterparts as defined in §9.4. For example, the closing of `*-` is `-*`.

**Conflict rules:** - Registering a sequence that is already registered (whether a custom symbol, or a built-in symbol *outside* the preamble) is an error. 
- Registering a sequence whose closing sequence would conflict with an already-registered opening sequence is also an error.
- Sequences containing bracket-like characters (e.g., `[+`) or letters/numbers are structurally invalid and produce an error.

**Escape rule:** The Lexer processes the universal escape character `\` before the Parser sees token content. To emit a symbol sequence as literal text, escape the first character: `\**` produces the literal text `**` and does not open a symbol.

### 9.4 Closing Character Map

The `SymbolParser` derives the closing sequence of any symbol by reversing the character order and substituting matched pairs. The supported pairs include standard ASCII brackets `( )`, `[ ]`, `< >`, and an extensive set of Unicode bracket and quotation pairs — including CJK brackets (`「」`, `【】`, `〔〕`, etc.), mathematical brackets (`⟨⟩`, `⟦⟧`, `⌈⌉`, etc.), ornamental brackets (`❨❩`, `❬❭`, `❰❱`, etc.), and Unicode curly quotes (`""`, `''`).

A character that does not appear in any pair is mapped to itself (symmetric sequences).

---

## 10. Compiler Pipeline

```
Source ATXT
    │
    ▼
┌─────────┐
│  Lexer  │  Converts raw text to a flat token stream.
└────┬────┘  Manages mode stack. Processes escape sequences.
     │       Emits lexer errors on malformed annotations.
     │
     ▼
┌──────────────┐
│ TokenStream  │  Provides positional access to the token sequence.
└──────┬───────┘  Tracks current index. Exposes peek, advance, match.
       │
       ▼
┌────────────────────────────┐
│ Parser + SymbolParser +    │  Consumes tokens to build the AST.
│ SymbolDetector             │  Resolves annotation targets.
└──────────┬─────────────────┘  Expands block and inline symbols via SymbolDetector + SymbolParser.
           │                    Processes SYMBOL directives at parse time.
           │                    Enforces the NEWLINE invariant (§4.4).
           │
           ▼
┌────────────────────────────┐
│ Lowerer + PropertyResolver │  Traverses AST. Resolves classes and properties.
└──────────┬─────────────────┘  Manages propertyContext per block scope.
           │                    Routes properties by scope.
           │                    Applies leaf-block promotion.
           │                    Produces the IR.
           ▼
┌─────────────────────────────────────┐
│  IR (Intermediate Representation)  │
└─────────────┬───────────────────────┘
              │
    ┌─────────┼──────────┐
    ▼         ▼          ▼
┌──────────┐ ┌─────────┐ ┌────────────┐
│ HTML Gen │ │ ...more │ │ Serializer │  Generators and Serializer are pluggable.
└──────────┘ └─────────┘ └────────────┘  Each consumes IR independently.
```

Each stage has exclusive responsibility:

| Stage | Inputs | Outputs | Must not |
|---|---|---|---|
| Lexer | Raw string | Token stream | Know about AST structure |
| Parser | Token stream | AST | Know about style resolution |
| Lowerer | AST | IR | Know about rendering targets |
| Generator | IR | Target format | Know about source syntax |
| Serializer | IR | Canonical `.atxt` source | Know about rendering targets |

The Generator skips any IR node carrying `hidden: true` in standard rendering mode. WYSIWYG tools may override this behavior to implement revision mode.

The HTML Generator selects the output HTML tag for each `IR.Block` based on the `kind` property. If no `kind` is present, leaf blocks that passed promotion carry `kind: paragraph` and render as `<p>`; non-promoted blocks render as `<div>`. If a `kind` is present but structurally incompatible with the block's children, the Lowerer emits an error before the Generator is invoked.

---

## 11. Intermediate Representation

### 11.1 Node Types

The IR consists of three node types organized into an `IRDocument`:

```typescript
interface IRDocument {
  root: IR.Block;
  nodeMap: Map<string, IRNodeEntry>;     // O(1) lookup by node id
  classDefinitions: Map<string, ResolvedProps>;
}

interface IRNodeEntry extends SourceLocation {
  node: IR.Node;
}

interface SourceLocation {
  line: number;
  column: number;
}

type ResolvedProps = Map<string, string>;

type IR.Node = IR.Block | IR.Text | IR.Newline ;

interface IR.Block {
  id: string;                          // UUID v4, unique per compilation
  type: "BLOCK";
  props: ResolvedProps;                // block-scope properties only (merged)
  classes: string[];                   // original class names applied to this node
  ownProps: ResolvedProps;             // properties declared directly on the annotation (snapshot for serialization)
  children: IR.Node[];
}

interface IR.Text {
  id: string;                          // UUID v4, unique per compilation
  type: "TEXT";
  props: ResolvedProps;                // inline-scope properties only (full snapshot)
  classes: string[];                   // always empty; present for interface uniformity
  ownProps: ResolvedProps;             // always empty; present for interface uniformity
  content: string;
}

interface IR.Newline {
  id: string;                          // UUID v4, unique per compilation
  type: "NEWLINE";
}
```

Source position (`line`, `column`) is not stored on IR nodes directly. It lives in `IRNodeEntry`, accessible via `nodeMap` using the node's `id` as key. This enables O(1) jump-to-source from any DOM `data-id` attribute without bloating the node structure.

`IR.Newline` represents a content line break — a newline the author explicitly wrote between lines of text. It carries no properties. It is distinct from structural newlines, which are consumed by the Parser and never reach the IR (see §4.4).

### 11.2 Invariants

The following invariants hold on any valid IR produced by the Lowerer:

1. An `IR.Block` node contains only block-scope properties in `props`.
2. An `IR.Text` node contains only inline-scope properties in `props`.
3. No property in any node fails the validation predicate of its registry entry.
4. Every `IR.Text` node carries a complete, standalone property snapshot — it does not inherit from its parent `IR.Block`.
5. Source position (`line`, `column`) is preserved for all nodes in `nodeMap` to enable WYSIWYG jump-to-source.
6. Every node has a unique `id` expressed as a UUID v4 generated per compilation. IDs do not persist across compilations.
7. `nodeMap` contains every node in the tree, enabling O(1) lookup by `data-id` from the DOM.
8. Certain text nodes may be marked as computed — produced by the template system rather than authored directly. The exact representation is not yet decided (see §15). The Serializer must never write the resolved content of a computed node back to the source; it must always reconstruct the original placeholder or trigger expression.
9. A **leaf block** is an `IR.Block` whose `children` array contains only `IR.Text` and `IR.Newline` nodes — no nested `IR.Block`. This is the criterion used for leaf-node promotion (§6.5) and for Serializer output decisions (§16).
10. `IR.Newline` nodes appear only as children of `IR.Block` nodes. They are never children of `IR.Text` nodes.
11. The `indent` property in an `IR.Block`'s `props` is never pre-applied to child `IR.Text` content. The raw content of every `IR.Text` node reflects exactly what the author wrote — without leading spaces injected by the `indent` mechanism. Generators are responsible for applying `indent` at render time.
12. `ownProps` on `IR.Block` contains only the properties explicitly declared on the annotation itself — never properties inherited from classes or the propertyContext. It is a snapshot of authorial intent, used by the Serializer. `ownProps` on `IR.Text` is always empty.
13. Adjacent TEXT Tokens are never produced by the Lexer.

### 11.3 IR as Serialization Target

The IR is isomorphic to the ATXT source and may be serialized back to ATXT. The Serializer traverses the IR tree and reconstructs canonical ATXT. Nodes with `computed: true` are serialized as their original placeholder expression (e.g. `{{fieldName}}`), never as the resolved text value — preserving the template structure of the source document.

See §16 for the full specification of the Serializer.

---

## 12. Whitespace and Escape Rules

### 12.1 Leading Whitespace

Leading whitespace at the start of a line has no semantic meaning and is stripped by the Lexer before tokenization.

### 12.2 Intentional Leading Space

The sequence `\ ` (backslash followed by a space) at the start of a line produces a single literal space character and suppresses further stripping for that line. This is an emergent consequence of the universal escape rule and not a special case.

### 12.3 Universal Escape

The backslash `\` is the universal escape character, processed by the Lexer. `\x` produces the literal character `x` for any `x`, suppressing its structural significance. Examples:

| Escape | Produces |
|---|---|
| `\[` | literal `[` |
| `\]` | literal `]` |
| `\{` | literal `{` |
| `\}` | literal `}` |
| `\\` | literal `\` |
| `\ ` at line start | literal space, suppresses strip |

The Lexer processes `\x` for any character `x`, emitting an internal escape sentinel (`U+E000`, Unicode Private Use Area) followed by `x` in the `TEXT` token content. The sentinel is stripped from the source before tokenization begins and never appears in any output. The `SymbolParser` consumes sentinel-prefixed characters as unconditional literals, ensuring they are never interpreted as symbol delimiters.

### 12.4 Block Content Trimming

The optional single `NEWLINE` immediately after a block's opening `{` is consumed by `parseBlock` and does not produce a `NewlineNode`. The trailing `NEWLINE` at the end of a block's content is removed by `parseBlock` before returning. Interior blank lines between paragraphs are significant and produce `IR.Newline` nodes in the IR.

---

## 13. Error Model

All compiler errors carry a type, a human-readable message, and a source position.

```typescript
type CompilerErrorType = "LEXER" | "PARSER" | "LOWERER" | "HTML_GENERATOR" ;

interface CompilerError {
  type: CompilerErrorType;
  message: string;
  line: number;
  column: number;
}
```

### 13.1 Lexer Errors

| Condition | Message |
|---|---|
| `]` not followed by `]` inside annotation | `Expected ']' to close annotation.` |
| Line break inside a quoted annotation value | `Line break not allowed inside quoted values.` |
| Unterminated quoted string | `Unterminated string. Missing closing '<quote>'.` |
| Invalid character in property name | `Invalid character in property name: '<char>'` |

### 13.2 Parser Errors

| Condition | Message |
|---|---|
| `}` with no matching `{` | `Unexpected block close.` |
| EOF with unclosed block | `Unclosed block. Expected '}'.` |
| Annotation not closed with `]]` | `Annotation was not closed with ']]'.` |
| Missing property name | `Expected property name, found '<token>'.` |
| Missing `:` after property name | `Expected ':' after property '<name>', found '<token>'.` |
| Missing value after `:` | `Expected value for '<name>', found '<token>'.` |
| Missing `;` between properties | `Expected ';' after property value '<name>'.` |
| Duplicate symbol registration | `Symbol '<seq>' is already registered.` |
| Symbol closing sequence conflict | `The closing sequence of '<seq>' conflicts with an existing symbol.` |
| Invalid symbol sequence characters | `'<seq>' contains invalid characters for a symbol sequence.` |

### 13.3 Lowerer Errors

| Condition | Message |
|---|---|
| Unknown property key | `Warning: Unknown property '<key>'.` |
| Property value fails validation | `Warning: Invalid value '<value>' for property '<key>'.` |
| Unknown property in `DEFINE` | `Warning: Invalid or unknown property '<key>' ignored in DEFINE.` |
| `DEFINE` without `class` property | `DEFINE directive requires a 'class' property.` |
| `merge` references undefined class | `Warning: Base class '<name>' not found in merge.` |
| Class referenced but not defined | `Warning: Class '<name>' not found.` |
| `-class` toggle with no active class | `'-class' toggle has no matching '+class' in the current scope.` |
| Leaf-compatible `kind` on non-leaf block | `kind '<value>' is only valid on leaf blocks but contains child blocks.` |

### 13.4 HTML Generator Errors

Generator errors indicate that a node passed semantic validation in the Lowerer but contains values that are unsafe or incompatible with the specific output format. The Generator neutralizes the unsafe property and continues rendering.

| Condition | Message |
|---|---|
| Global CSS injection pattern detected (e.g. `expression()`) | `Property '<key>': Global HTML/CSS injection pattern detected.` |
| Forbidden URL/Expression in font rendering | `Property 'font': URL or Expression vectors are strictly forbidden in HTML font rendering.` |
| Invalid CSS value formatting | `Property '<key>': <validation error message>` |

### 13.5 Error Recovery

The compiler collects all errors encountered during compilation and returns them alongside any partial output. A document with errors may still produce partial IR. Generators may be invoked on a partial IR at the caller's discretion — the resulting output is best-effort and its usefulness depends on the nature and location of the errors.

---

## 14. The `.atz` Package Format

> **Note:** The `.atz` format is partially specified in this version. The directory structure below represents the intended design. Metadata fields, asset reference syntax, and transform pipeline semantics are subject to change and will be fully specified in a future revision.

An `.atz` file is a ZIP archive with the following structure:

```
document.atz
├── main.atxt              (required) — the document source (template)
├── meta.json              (to be specified) — package metadata
├── data/                  (to be specified) — data sources for placeholder resolution
│   └── data.json          — key-value store for field values
├── assets/                (to be specified) — referenced binary files
│   ├── image.jpg
│   └── chart.png
└── transforms/            (to be specified) — pipeline declarations
    └── pipeline.json
```

### 14.1 `meta.json`

> **To be specified.** The fields below are provisional. The `id` field and its semantics are confirmed; all other fields may change.

```json
{
  "atxt-version": "1.0",
  "id": "7f3a9c2e-4b1d-4e8a-9f2b-1c3d5e7f9a0b",
  "title": "Document title",
  "created": "2026-03-12T00:00:00Z"
}
```

The `id` field is a UUID v4 generated at document creation. It is stable across renames and moves. WYSIWYG editors use this field as the key for persisting user preferences outside the document file.

If the user duplicates a document at the filesystem level, the editor must detect the duplicate `id` and prompt the user to assign a new identity to the copy.

### 14.2 Asset References

> **To be specified.** The syntax for referencing assets from within `.atxt` source, the resolution strategy at compile time, and the behavior in browser environments are not yet formally defined.

### 14.3 Versioning

The `.atxt` source inside an `.atz` package is plain text and is directly compatible with Git version control. Because the package is a ZIP, the recommended workflow is to version the `main.atxt` file independently in a Git repository and produce `.atz` archives only for distribution.

---

## 15. Template System

> **Note:** The syntax for template directives is not yet defined. This section documents the confirmed architectural decisions. All annotation syntax shown is illustrative only.

### 15.1 Philosophy: Model–View Separation

The template system extends ATXT with placeholder resolution and automatic text injection without violating the core guarantee of Turing-incompleteness.

The key architectural decision is that **computed text never mutates the `.atxt` source**. The `.atxt` file always contains the template — the structure, the placeholders, and the rules. The resolved values live in `data/data.json` inside the `.atz` package. When the user edits a placeholder value in the WYSIWYG editor, the editor updates `data.json`, not `main.atxt`. The source document remains a clean, static description of its own structure.

This separation means:

- The `.atxt` source is always diffable and human-readable regardless of the data it has been filled with.
- The same template can be reused with different data sets without modifying the source.
- Round-trip fidelity is guaranteed: serializing the IR back to ATXT always produces the original template with placeholders intact.

### 15.2 Placeholders and Field Values

> **Syntax: to be specified.**

A placeholder declares a named slot in the document where a value will be injected at compile time. Each placeholder has a `name` (the field identifier) and may declare validation rules.

Data values are supplied at the **invocation site** — the point in the document where a declared section is used, not where it is defined. Two supply mechanisms are available:

**Inline** — the value is written directly in the `.atxt` source at the invocation site, alongside the field name. The template declaration and the data remain in separate parts of the document, preserving the template structure even when all data is authored inline.

**Via JSON** — the value is resolved from `data/data.json` inside the `.atz` package using a dot-notation key path (e.g. `client.cpf`). The key path supports only property access by name — no functions, no filters, no computed expressions. This mechanism allows external systems (APIs, databases, batch processors) to populate documents without modifying the `.atxt` source.

When a placeholder is resolved, the Lowerer produces a text node marked as computed. The resolved value is stored in the node's content. The original placeholder expression is preserved separately for serialization purposes — the Serializer never writes the resolved content back to the `.atxt` source.

### 15.3 Validation

> **Syntax: to be specified.**

A placeholder may declare a validation rule expressed as a regular expression. The regex is evaluated against the resolved value before the IR is produced. If the value does not match, the Lowerer emits a `LOWERER` error with a human-readable message and halts rendering for that field.

The regex subset used for validation is deliberately restricted: backreferences and lookahead/lookbehind assertions are not supported. This restriction preserves Turing-incompleteness — the validation predicate terminates in bounded time and produces no side effects.

### 15.4 Triggers and Computed Text Injection

> **Syntax: to be specified.**

A trigger declares a rule of the form: if a selector matches a condition, inject text at a specified location in the document. Triggers are evaluated by the Lowerer after all placeholders have been resolved.

**Selectors** query the IR by node properties, class names, or field names. They do not match computed nodes — nodes with `computed: true` are invisible to selectors. This structural invisibility is the mechanism that prevents trigger chains: a trigger cannot observe the output of another trigger, making cascading reactions architecturally impossible without requiring any runtime cycle detection.

**Injected text** is inserted into the IR as computed text nodes. These nodes are rendered normally by all Generators but are treated as read-only in the WYSIWYG editor (see §15.5) and are serialized back to their original trigger expression, not their resolved content.

The trigger system is **single-pass by design**: the Lowerer evaluates all triggers exactly once against the source IR. The order of evaluation is deterministic (document order). No trigger may reference the output of another trigger.

### 15.5 WYSIWYG Presentation of Computed Nodes

Computed text nodes in the IR receive special treatment in the WYSIWYG editor:

- They are rendered with a distinct visual treatment (e.g. a shaded background or a lock icon) to indicate their computed origin.
- They are rendered with `contenteditable="false"`, preventing direct text editing.
- Clicking a computed node opens a popover or side panel allowing the user to edit the underlying data value (updating `data.json`) or to detach the node (converting it to static text and removing the `computed` flag, which writes the literal content into the `.atxt` source).

Detaching a computed node is a one-way operation. Once detached, the text becomes part of the static document and is no longer associated with any placeholder or trigger.

### 15.6 Turing-Incompleteness Guarantee

The template system preserves the Turing-incompleteness of ATXT through three structural constraints:

1. **No self-reference.** Selectors cannot observe computed nodes, so triggers cannot react to their own output.
2. **Single-pass evaluation.** Triggers are evaluated exactly once in document order. There is no iteration, no recursion, and no conditional branching that could produce unbounded execution.
3. **Bounded validation.** Field validation uses a restricted regex subset that excludes features associated with unbounded computation.

These constraints are enforced by the architecture, not by runtime checks. A conforming implementation cannot produce infinite loops or undecidable computations regardless of the input document.

---

## 16. Serializer

The Serializer is the inverse of the compiler pipeline. It traverses the IR and reconstructs a canonical `.atxt` source file. The round-trip guarantee is: compiling a document and then serializing the resulting IR produces a `.atxt` source that, when compiled again, yields an IR with equivalent visual and semantic properties, with only difference on id, line and column values, and the order of properties inside an annotation.

### 16.1 Purpose

The Serializer enables:

- **WYSIWYG round-trip**: a visual editor can mutate the IR directly and serialize the result back to source without ever parsing or modifying the original `.atxt` text.
- **Canonical formatting**: hand-written `.atxt` files may use arbitrary whitespace and shorthand syntax. The Serializer produces a normalized form that is consistent, predictable, and optimally Git-diffable.
- **Source preservation**: the serialized output is valid `.atxt` and compiles back to an equivalent IR. No semantic information is lost.

### 16.2 Canonical Form Rules

The Serializer applies the following rules to produce canonical output:

**Class definitions** are emitted at the top of the document, one per line, sorted alphabetically by class name. Properties within each `DEFINE` are sorted alphabetically by key.

**Blocks** always serialize as explicit `{ }` delimiters, with or without an annotation. Anonymous scope blocks (those with no classes and no ownProps) serialize as bare `{ }`. This preserves the structural intent of the author — anonymous blocks are never flattened into their parent scope.

**Annotations** emit `class` before `ownProps`. Within each group, properties are sorted alphabetically.

**Inline toggles** are emitted as `[[+key: val; ...]]` and `[[-key; ...]]` annotations between `IR.Text` nodes within a run. Added properties are sorted alphabetically. Removed properties are sorted alphabetically and listed after added properties.

**`Newline` nodes** serialize as a line break in the output file. The number of consecutive `Newline` nodes in the IR is preserved exactly — if the author wrote two blank lines, two `Newline` nodes exist in the IR and two blank lines appear in the serialized output. The Serializer never collapses or adds blank lines.

**Symbol sequences** are **not** used in canonical output. The Serializer always emits explicit annotation syntax. This makes canonical ATXT unambiguous and easier to process with external tooling.

**Computed nodes** serialize as their original placeholder expression, never as the resolved content value. See §15 for the full specification of computed nodes.

### 16.3 Block Preservation Invariant

Every `IR.Block` in the IR serializes as a block in the output. The Serializer never flattens, merges, or discards blocks. This invariant exists because:

1. Anonymous scope blocks are structurally significant — they limit toggle and SET scope, and future selectors may query them by identity.
2. The WYSIWYG editor may create anonymous blocks intentionally (e.g., when the user creates a region without applying any class).
3. Discarding blocks would make the Serializer lossy with respect to IR structure, breaking the round-trip guarantee for the WYSIWYG use case.

### 16.4 What the Serializer Does Not Preserve

The Serializer reconstructs semantics, not syntax. The following source-level constructs are not reconstructed:

- **Symbol sequences**: `# Heading` becomes `[[kind: heading1; size: 32; weight: bold]] { Heading }`.
- **SET directives**: `[[SET class: foo]]` becomes an annotated block `[[class: foo]] { ... }`. The SET keyword is not emitted because the IR does not distinguish SET-originated blocks from annotation-targeted blocks.
- **Original property order**: properties are always sorted alphabetically in canonical output.
- **Original whitespace**: indentation and blank lines in the source are not preserved; canonical whitespace rules apply.

These losses are acceptable because the canonical form retains full semantic equivalence — the compiled IR is identical in all properties that matter for rendering and selection.

### 16.5 The Idempotency Invariant (Canonical IR Equivalence)

The compiler guarantees that compiling a source document and recompiling its canonical serialized form yields semantically equivalent IR.

**Equivalence Rule:**
Let `S` be the original source text. If `IR1 = compile(S)` and `S_canon = serialize(IR1)`, then `IR2 = compile(S_canon)` must be semantically equivalent to `IR1`.

#### 16.5.1 Normalization Rules for Comparison

For the purpose of integrity validation (as implemented in testing utilities like `ir.canon.test.ts`), equality between `IR1` and `IR2` is defined strictly after a normalization step:

1. **ID Ephemerality:** The `id` field (UUID v4) of each node must be ignored or stripped, as it is generated independently per compilation session (see §11.2).
2. **Map Stability:** The insertion order of properties within `props` and `ownProps` must be ignored. Equality is established strictly by matching key-value parity.
3. **Symbol Expansion:** Because the Serializer does not use symbol sequences (see §16.2), `S_canon` will contain explicit annotations where `S` may have used syntactic sugar (e.g., `# ` expanded to `kind: heading1`). This equivalence requires that the `SymbolParser` and the Serializer share identical semantics.

---

*End of ATXT Language Specification v1.0*
