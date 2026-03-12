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

ATXT source files are UTF-8 encoded. All Unicode scalar values are valid in text content. The following ASCII characters have structural significance:

```
[  ]  {  }  \  "  +  -  :  ;  #  *  _  ~  >  newline  space  tab
```

### 3.2 Tokens

```ebnf
token
  = ANNOTATION_OPEN
  | ANNOTATION_CLOSE
  | BLOCK_OPEN
  | BLOCK_CLOSE
  | PROP_KEY
  | PROP_VALUE
  | PROP_SEPARATOR
  | TEXT
  | NEWLINE
  | EOF
  ;

ANNOTATION_OPEN  = "[[" ;
ANNOTATION_CLOSE = "]]" ;
BLOCK_OPEN       = "{" ;
BLOCK_CLOSE      = "}" ;
PROP_SEPARATOR   = ";" ;
NEWLINE          = "\n" ;
```

### 3.3 Lexer Modes

The lexer operates in three exclusive modes managed via a mode stack:

| Mode | Transitions |
|---|---|
| `NORMAL` | `[[` → push `ANNOTATION_KEY` |
| `ANNOTATION_KEY` | `:` → replace with `ANNOTATION_VALUE`; `]]` → pop |
| `ANNOTATION_VALUE` | `;` → replace with `ANNOTATION_KEY`; `]]` → pop |

A single `]` inside an annotation that is not followed by a second `]` is a lexer error.

### 3.4 Property Key

```ebnf
prop_key
  = [ toggle_prefix ] key_name ;

toggle_prefix
  = "+" | "-" ;

key_name
  = letter { letter | digit | "-" } ;

letter  = ? Unicode letter ? ;
digit   = "0" | "1" | ... | "9" ;
```

A key prefixed with `+` is a toggle-add. A key prefixed with `-` is a toggle-remove. An unprefixed key is a direct assignment.

### 3.5 Property Value

```ebnf
prop_value
  = quoted_string | unquoted_value ;

quoted_string
  = '"' { ? any character except '"' and unescaped newline ? } '"' ;

unquoted_value
  = { ? any character except ']', ';', and newline ? } ;
```

Leading and trailing whitespace is stripped from unquoted values.

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
  = property { PROP_SEPARATOR property } [ PROP_SEPARATOR ] ;

property
  = PROP_KEY [ ":" prop_value ] ;

annotation_target
  = block_statement
  | text_line
  ;
```

**Target resolution rule:** If tokens of non-whitespace text follow the annotation on the same line, those tokens form the target (inline target). If no such tokens exist, the parser skips whitespace and newlines and captures the next non-empty line or block as the target.

Annotations whose property list contains only toggle properties (all keys prefixed with `+` or `-`) have no target. They apply to the backpack of the enclosing context.

### 4.3 Block Statement

```ebnf
block_statement
  = BLOCK_OPEN { statement } BLOCK_CLOSE ;
```

Blocks may be nested arbitrarily. A block opened with `{` must be closed with `}`. An unclosed block is a parser error.

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

---

## 5. Directives

A directive is a special annotation whose first property key is an uppercase word. The three built-in directives are `SET`, `DEFINE`, and `NORMAL` (the absence of a directive keyword is the `NORMAL` case).

```ebnf
directive
  = set_directive
  | define_directive
  | normal_directive
  ;

set_directive
  = ANNOTATION_OPEN "SET" property_list ANNOTATION_CLOSE ;

define_directive
  = ANNOTATION_OPEN "DEFINE" define_body ANNOTATION_CLOSE ;

normal_directive
  = annotation ;   (* no uppercase keyword — the default case *)
```

### 5.1 SET

`[[SET prop: val]]` propagates the specified properties through all subsequent sibling nodes within the current block scope. The propagation does not escape to parent or sibling blocks.

### 5.2 DEFINE

`[[DEFINE class: name; prop: val; ...]]` registers a named class in the StyleResolver. A `compose: other-class` property may be included to inherit all properties of a previously defined class before applying overrides.

`[[DEFINE symbol: seq; class: name; type: inline|block]]` registers a custom symbol. See §9.

### 5.3 NORMAL

A `NORMAL` annotation is the default case — any annotation that carries no uppercase directive keyword. It applies its properties to its resolved target and does not propagate.

---

## 6. Property System

### 6.1 Property Registry

Every valid property is declared in the property registry. A property declaration specifies:

- `scope`: `"block"` or `"inline"`
- `validate`: a predicate on the string value

Properties not in the registry are rejected at hydration time with a `HYDRATOR` error.

### 6.2 Built-in Properties

#### Block-scope properties

| Property | Expected value |
|---|---|
| `fill` | CSS color string |
| `radius` | Number (px) |
| `indent` | Non-negative integer (spaces) |
| `padding` | One to four whitespace-separated numbers |
| `margin` | One to four whitespace-separated numbers |
| `border` | Non-empty string (CSS border shorthand) |
| `width` | Number |
| `height` | Number |
| `align` | `left` \| `center` \| `right` \| `justify` |

#### Inline-scope properties

| Property | Expected value |
|---|---|
| `color` | CSS color string |
| `font` | Font family name |
| `size` | Positive number (px) |
| `weight` | `normal` \| `bold` \| `bolder` \| `lighter` \| integer 1–1000 |
| `style` | `normal` \| `italic` \| `oblique` |
| `line-height` | Positive number |
| `decoration` | CSS text-decoration value |

### 6.3 Scope Enforcement

Block-scope properties are applied exclusively to `BLOCK` IR nodes. Inline-scope properties are applied exclusively to `TEXT` IR nodes. The Hydrator routes properties by scope before constructing the IR. A Generator never receives a node containing properties outside its scope.

This prevents CSS inheritance from leaking typographic styles from parent blocks into child text nodes.

### 6.4 Style Resolution Order

Within a single node, properties are resolved in ascending priority:

1. Document default styles (`DEFAULT_CLASSES`)
2. Properties inherited via `SET` propagation (backpack)
3. Properties from an applied class (`[[class: name]]`)
4. Properties declared inline on the annotation

Higher-priority values overwrite lower-priority values for the same key.

---

## 7. Class System

### 7.1 Defining a Class

```atxt
[[DEFINE class: name; prop: val; prop2: val2]]
```

A class definition registers a named bag of properties in the StyleResolver. The name must be a valid `key_name`. Redefinition of an existing class within the same scope is a hydrator error.

### 7.2 Applying a Class

```atxt
[[class: name]] target
```

All properties registered under `name` are applied to the target node. Inline properties on the same annotation override class properties for conflicting keys.

### 7.3 Inheritance via `compose`

```atxt
[[DEFINE class: child; compose: parent; size: 14]]
```

`compose` copies all properties from the named parent class into the new class definition before applying the remaining properties. The parent must have been defined earlier in the same scope. Multiple `compose` values are not supported in v1.

### 7.4 Default Classes

The compiler provides a set of default class definitions used when the corresponding class name is applied but not explicitly defined by the document:

| Class | Default properties |
|---|---|
| `h1` | `size: 32; weight: bold` |
| `h2` | `size: 24; weight: bold` |
| `h3` | `size: 18; weight: bold` |
| `blockquote` | `color: gray; indent: 4` |
| `list-item` | `indent: 2` |
| `list-ordered` | `indent: 2` |

A document may override any default class by providing an explicit `[[DEFINE class: h1; ...]]` declaration before first use.

---

## 8. Toggle System

### 8.1 Toggle Syntax

```atxt
[[+prop: val]] text begins here
[[+prop2]]
more text inheriting both props
[[-prop]]
text with only prop2
```

A `+prop: val` annotation adds `prop` to the **backpack** — a set of properties that propagates to subsequent sibling text nodes within the current block scope.

A `-prop` annotation removes `prop` from the backpack. The value argument is not allowed on a remove toggle.

### 8.2 Toggle Scope

The backpack is scoped to the enclosing block. It does not propagate to the parent block, sibling blocks, or child blocks. When a block closes, its backpack is discarded.

### 8.3 Toggle Annotations Have No Target

An annotation whose property list consists exclusively of toggle operations (`+` or `-` prefixed keys) does not resolve a target. It modifies the backpack in place. Attempting to assign a block or line target to a toggle-only annotation is a parser error.

### 8.4 Text Slicing

Because inline styles may overlap arbitrarily via toggles, the Hydrator produces flat runs of `TEXT` nodes with complete, explicit property sets per node. Each `TEXT` node carries the full snapshot of the backpack at the moment of its creation. No two adjacent `TEXT` nodes share a reference to the same property set.

This model enables overlapping styles that cannot be represented as a strict tree hierarchy.

---

## 9. Symbol System

Symbols are syntactic sugar that the Parser expands into annotations. The Hydrator is unaware of their origin.

### 9.1 Built-in Inline Symbols

| Symbol | Expands to |
|---|---|
| `**text**` | `[[+weight: bold]]` ... `[[-weight]]` |
| `_text_` | `[[+style: italic]]` ... `[[-style]]` |
| `~~text~~` | `[[+decoration: line-through]]` ... `[[-decoration]]` |

Inline symbols are only recognized within text content. They expand to toggle pairs around the enclosed content. An inline symbol with empty content between its delimiters is treated as literal text.

### 9.2 Built-in Block Symbols

Block symbols are recognized exclusively when they appear as the first non-whitespace token on a line, followed by at least one space character.

| Symbol | Expands to |
|---|---|
| `# text` | `[[class: h1]] text` |
| `## text` | `[[class: h2]] text` |
| `### text` | `[[class: h3]] text` |
| `> text` | `[[class: blockquote]] text` |
| `- text` | `[[class: list-item]] text` |
| `1. text` | `[[class: list-ordered]] text` |

A block symbol in any position other than the start of a line is treated as literal text.

### 9.3 Custom Symbols

```atxt
[[DEFINE symbol: ++; class: highlight; type: inline]]
[[DEFINE symbol: §; class: section-header; type: block]]
```

Custom symbol definitions follow the same contract as class definitions: they must appear before first use. The symbol sequence must not be empty. For inline symbols, the same opening and closing sequence is required. For block symbols, the sequence appears once at the start of a line.

**Precedence rule:** When two registered symbols share a prefix (e.g. `+` and `++`), the longest matching symbol takes precedence (maximal munch). If two symbols are identical, the second definition is a hydrator error.

Custom inline symbols with empty content between delimiters are treated as literal text.

---

## 10. Compiler Pipeline

```
Source ATXT
    │
    ▼
┌─────────┐
│  Lexer  │  Converts raw text to a flat token stream.
└────┬────┘  Manages mode stack. Emits lexer errors on malformed annotations.
     │
     ▼
┌──────────────┐
│  TokenStream │  Provides positional access to the token sequence.
└──────┬───────┘  Tracks current index. Exposes peek, advance, match.
       │
       ▼
┌────────┐
│ Parser │  Consumes tokens to build the AST.
└───┬────┘  Resolves annotation targets. Expands block symbols.
    │       Expands inline symbols within text nodes.
    │
    ▼
┌──────────────────────────┐
│  Hydrator + StyleResolver│  Traverses AST. Resolves classes and properties.
└──────────┬───────────────┘  Manages backpack per block scope.
           │                  Routes properties by scope.
           │                  Produces the IR.
           ▼
┌─────────────────────────────────────┐
│  IR (Intermediate Representation)  │
└─────────────┬───────────────────────┘
              │
    ┌─────────┴──────────┐
    ▼                    ▼
┌───────────────┐  ┌───────────┐
│ HTML Generator│  │ ... more  │  Generators are pluggable.
└───────────────┘  └───────────┘  Each consumes IR independently.
```

Each stage has exclusive responsibility:

| Stage | Inputs | Outputs | Must not |
|---|---|---|---|
| Lexer | Raw string | Token stream | Know about AST structure |
| Parser | Token stream | AST | Know about style resolution |
| Hydrator | AST | IR | Know about rendering targets |
| Generator | IR | Target format | Know about source syntax |

---

## 11. Intermediate Representation

### 11.1 Node Types

The IR consists of two node types:

```typescript
type IRNode = IRBlock | IRText ;

interface IRBlock {
  type: "BLOCK";
  props: Record<string, string>;   // block-scope properties only
  children: IRNode[];
  line?: number;
  column?: number;
}

interface IRText {
  type: "TEXT";
  props: Record<string, string>;   // inline-scope properties only
  content: string;
  line?: number;
  column?: number;
}
```

### 11.2 Invariants

The following invariants hold on any valid IR produced by the Hydrator:

1. An `IRBlock` node contains only block-scope properties.
2. An `IRText` node contains only inline-scope properties.
3. No property in any node fails the validation predicate of its registry entry.
4. Every `IRText` node carries a complete, standalone property snapshot — it does not inherit from its parent `IRBlock`.
5. Source position (`line`, `column`) is preserved on all nodes to enable WYSIWYG jump-to-source.

### 11.3 IR as Serialization Target

The IR is isomorphic to the ATXT source and may be serialized to XML or JSON. The Serializer (IR → ATXT) traverses the IR tree and reconstructs canonical ATXT with explicit per-segment annotations. Toggle syntax is not used in serialized output — the canonical form uses explicit open/close annotations for all inline styles.

---

## 12. Whitespace and Escape Rules

### 12.1 Leading Whitespace

Leading whitespace at the start of a line has no semantic meaning and is stripped by the Lexer before tokenization.

### 12.2 Intentional Leading Space

The sequence `\ ` (backslash followed by a space) at the start of a line produces a single literal space character and suppresses further stripping for that line. This is an emergent consequence of the universal escape rule and not a special case.

### 12.3 Universal Escape

The backslash `\` is the universal escape character. `\x` produces the literal character `x` for any `x`, suppressing its structural significance. Examples:

| Escape | Produces |
|---|---|
| `\[` | literal `[` |
| `\]` | literal `]` |
| `\{` | literal `{` |
| `\}` | literal `}` |
| `\\` | literal `\` |
| `\ ` at line start | literal space, suppresses strip |

### 12.4 Blank Lines

A blank line (a line containing only whitespace or nothing before the newline) between two text lines creates a paragraph boundary. The Parser emits a new block node for content following the blank line.

### 12.5 Block Content Trimming

Leading and trailing blank lines within a block `{ ... }` are discarded. Interior blank lines between paragraphs are significant.

---

## 13. Error Model

All compiler errors carry a type, a human-readable message, and a source position.

```typescript
type ErrorType = "LEXER" | "PARSER" | "HYDRATOR" ;

interface CompilerError {
  type: ErrorType;
  message: string;
  line: number;
  column: number;
}
```

### 13.1 Lexer Errors

| Condition | Message |
|---|---|
| `]` not followed by `]` inside annotation | `Expected ']' to close annotation` |
| EOF inside open annotation | `Unexpected end of file inside annotation` |

### 13.2 Parser Errors

| Condition | Message |
|---|---|
| `}` with no matching `{` | `Unexpected block close` |
| EOF with unclosed block | `Unexpected end of file: unclosed block` |
| Toggle-only annotation with explicit target | `Toggle annotations cannot have a target` |

### 13.3 Hydrator Errors

| Condition | Message |
|---|---|
| Unknown property key | `Unknown property: '<key>'` |
| Property value fails validation | `Invalid value for property '<key>': '<value>'` |
| Class applied before definition | `Class '<name>' used before definition` |
| Class redefined in same scope | `Class '<name>' already defined in this scope` |
| `compose` references undefined class | `Cannot compose undefined class '<name>'` |
| Symbol redefined | `Symbol '<seq>' already defined` |
| Custom symbol used before definition | `Symbol '<seq>' used before definition` |

### 13.4 Error Recovery

The compiler collects all errors encountered during compilation and returns them alongside any partial output. A document with errors may still produce partial IR. Generators may be invoked on a partial IR at the caller's discretion — the resulting output is best-effort and its usefulness depends on the nature and location of the errors.

---

## 14. The `.atz` Package Format

> **Note:** The `.atz` format is partially specified in this version. The directory structure below represents the intended design. Metadata fields, asset reference syntax, and transform pipeline semantics are subject to change and will be fully specified in a future revision.

An `.atz` file is a ZIP archive with the following structure:

```
document.atz
├── main.atxt              (required) — the document source
├── meta.json              (to be specified) — package metadata
├── assets/                (to be specified) — referenced binary files
│   ├── image.jpg
│   └── chart.png
├── data/                  (to be specified) — data sources for transforms
│   └── recipients.csv
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

*End of ATXT Language Specification v1.0*
