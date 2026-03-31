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

Annotations whose property list contains only toggle properties (all keys prefixed with `+` or `-`) have no target. They apply to the propertyContext of the enclosing context.

### 4.3 Block Statement

```ebnf
block_statement
  = BLOCK_OPEN { statement } BLOCK_CLOSE ;
```

Blocks may be nested arbitrarily. A block opened with `{` must be closed with `}`. An unclosed block is a parser error.

#### Anonymous scope blocks

A `{ }` that is not the target of an annotation is an **anonymous scope block**. Its purpose is to limit the scope of `SET` directives and toggle annotations — when the block closes, all propertyContext state accumulated inside it is discarded.

```atxt
{
    [[SET color: gray]]
    This text is gray.
}
This text is unaffected — the SET did not escape the block.
```

An anonymous scope block carries no semantic information beyond scope delimitation. It produces an `IRBlock` in the IR with no properties, no classes, and no inlineProps. The Serializer preserves it as a bare `{ }` — it is never flattened or discarded, because it may be structurally significant to selectors and to the WYSIWYG editor.

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

#### NEWLINE invariant

The Parser enforces a strict invariant: **a NEWLINE token reaches the AST as a `NewlineNode` only when it is content** — that is, when it terminates a line of text or separates paragraphs within a block. Structural newlines — those that terminate an annotation line, a target line, or a block closing brace — are consumed by the Parser and never reach the AST.

Specifically:
- The NEWLINE after an annotation with no target is consumed by `parseAnnotation`.
- The NEWLINE after a `HIDE` or `SYMBOL` directive is consumed by `parseAnnotation`.
- The NEWLINE terminating a target line is consumed by `consumeTargetLine`.
- The NEWLINE after the closing `}` of a block target is consumed by `resolveAnnotationTarget`.
- The trailing NEWLINE at the end of a block's content is removed by `parseBlock` before returning.

This invariant ensures that every `NewlineNode` in the AST represents authorial intent — a line break the author explicitly wrote between content lines.

---

## 5. Directives

A directive is a special annotation whose first property key is an uppercase word. The five built-in directives are `SET`, `DEFINE`, `HIDE`, `SYMBOL`, and `NORMAL` (the absence of a directive keyword is the `NORMAL` case).

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

**Inline props propagation:** `SET` routes its properties by scope before applying them. Block-scope properties are applied to the wrapper block's `props`. Inline-scope properties are passed as `inheritedProps` to child nodes within the wrapper, ensuring that typographic properties such as `font`, `size`, and `color` propagate correctly to `IRText` nodes.

### 5.2 DEFINE

`[[DEFINE class: name; prop: val; ...]]` registers a named class in the StyleResolver. A `compose: other-class` property may be included to inherit all properties of a previously defined class before applying overrides.

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

`[[SYMBOL symbol: seq; class: name; type: inline|block]]` registers a custom symbol in the Parser's symbol registry. See §9.3.

The `SYMBOL` directive is consumed entirely by the Parser and never reaches the AST or the IR. The Hydrator is unaware of symbol definitions.

The `type` property is optional and defaults to `inline` when omitted. A `SYMBOL` directive without a `class` property is silently ignored.

---

## 6. Property System

### 6.1 Property Registry

Every valid property is declared in the property registry. A property declaration specifies:

- `scope`: `"block"` or `"inline"`
- `validate`: a predicate on the string value

Properties not in the registry are rejected at hydration time with a `HYDRATOR` error.

Boolean properties are validated case-insensitively. `True`, `TRUE`, and `true` are all accepted.

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
| `kind` | See §6.5 |
| `hidden` | `true` \| `false` (case-insensitive) |

A node with `hidden: true` arrives in the IR and is skipped by the Generator in standard rendering mode. Because the node is present in the IR, WYSIWYG tools may implement a revision mode that renders hidden nodes with a distinct visual treatment, allowing the author to reactivate them by removing the property.

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

1. **Compiler defaults** — a baseline `size: 16` is applied to the document root before any author-declared properties. This ensures all text has a predictable default size regardless of the output format or rendering environment. Authors may override this at any scope with a more specific annotation or `SET`.
2. Properties inherited via `SET` propagation (propertyContext)
3. Properties from an applied class (`[[class: name]]`)
4. Properties declared inline on the annotation

Higher-priority values overwrite lower-priority values for the same key.

### 6.5 The `kind` Property

`kind` declares the semantic nature of a block. It is a block-scope property and participates in the property registry like any other. Its values are document-semantic names with no commitment to any output format.

#### Valid values and their HTML equivalents

| `kind` value | HTML tag | Notes |
|---|---|---|
| `paragraph` | `<p>` | Inline text container. Valid only on leaf blocks (see below). |
| `heading1` | `<h1>` | |
| `heading2` | `<h2>` | |
| `heading3` | `<h3>` | |
| `heading4` | `<h4>` | |
| `heading5` | `<h5>` | |
| `quote` | `<blockquote>` | |
| `code` | `<pre>` | |
| `list` | `<ul>` | |
| `ordered-list` | `<ol>` | |
| `item` | `<li>` | |
| `aside` | `<aside>` | |
| `section` | `<section>` | |
| `article` | `<article>` | |
| `header` | `<header>` | |
| `footer` | `<footer>` | |

A block with no `kind` property renders as `<div>` in the HTML Generator. A text node with no `kind` renders as `<span>`.

#### Leaf-node promotion

A **leaf block** is an `IRBlock` whose `children` array contains only `IRText` and `IRNewline` nodes — no nested `IRBlock`. This is a structural property of the IR, not a property declared in the source.

The HTML Generator applies the following rule: if a leaf block carries no explicit `kind`, it is promoted to `paragraph` automatically. This means plain text lines produce `<p>` elements without any annotation from the author.

```atxt
This line produces a <p> element automatically.

[[fill: #f0f0f0]]
This annotated line also produces a <p> because it is still a leaf block.
```

A non-leaf block (containing at least one child `IRBlock`) is never promoted. It renders as `<div>` unless an explicit `kind` is declared.

#### Structural compatibility

Certain `kind` values imply inline containment in the HTML model (notably `paragraph`). When a block declared with such a `kind` contains child blocks, the resulting HTML would be structurally invalid. The HTML Generator treats this as an error rather than silently demoting the tag.

```atxt
[[kind: paragraph]] {
    Normal text here.
    [[kind: section]] {
        This nested block makes kind: paragraph structurally invalid.
    }
}
```

This produces a Generator error. The document author must either remove the `kind: paragraph` declaration or restructure the content.

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

`indent` declares character-level indentation: the number of literal space characters prepended to the beginning of each line of content within the block. It is a block-scope property, but its effect is applied by the **Generator**, not the Hydrator.

The Hydrator preserves `indent` in the block's `props` unchanged. Each Generator is responsible for interpreting `indent` appropriately for its output format. The HTML Generator prepends literal space characters before the first node of each line. The DOCX Generator may translate `indent` to native paragraph indentation.

This separation ensures that `indent` in the IR always reflects the author's intent, not a rendered artifact — making the IR portable across output formats and serializable without data loss.

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

When `[[+class: name]]` is used as a toggle, the class is **expanded into its concrete properties** at the moment of application. Each property is pushed onto its respective stack in the propertyContext. The class name itself never enters the propertyContext.

`[[-class: name]]` pops exactly the properties that `[[+class: name]]` pushed — no more, no less.

```atxt
[[DEFINE class: legal-term; color: #1a3a6e; weight: bold]]

[[+class: legal-term]]Service Provider[[-class: legal-term]]
```

This is internally equivalent to:

```atxt
[[+color: #1a3a6e; +weight: bold]]Service Provider[[-color; -weight]]
```

The class name is a convenience for the author. It has no presence in the IR propertyContext or in `IRText` props.

### 8.6 Text Slicing

Because inline styles may overlap arbitrarily via toggles, the Hydrator produces flat runs of `TEXT` nodes with complete, explicit property sets per node. Each `TEXT` node carries the full snapshot of the propertyContext at the moment of its creation. No two adjacent `TEXT` nodes share a reference to the same property set.

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

The concrete properties behind each built-in inline symbol are:

| Symbol | Properties |
|---|---|
| `**` | `weight: bold` |
| `_` | `style: italic` |
| `~~` | `decoration: line-through` |

Inline symbols are only recognized within text content. They expand to property toggle pairs around the enclosed content. An inline symbol with empty content between its delimiters is treated as literal text.

The closing delimiter of an inline symbol is always the reverse of the opening sequence. For symmetric symbols (`**`, `_`, `~~`) this is identical to the opening. For asymmetric custom symbols (e.g. `*-`) the closing is the mirror sequence (`-*`).

### 9.2 Built-in Block Symbols

Block symbols are recognized exclusively when they appear as the first non-whitespace token on a line, followed by at least one space character.

| Symbol | Expands to |
|---|---|
| `# text` | `[[kind: heading1; size: 32; weight: bold]] text` |
| `## text` | `[[kind: heading2; size: 24; weight: bold]] text` |
| `### text` | `[[kind: heading3; size: 18; weight: bold]] text` |
| `#### text` | `[[kind: heading4; size: 16; weight: bold]] text` |
| `##### text` | `[[kind: heading5; size: 14; weight: bold]] text` |
| `> text` | `[[kind: quote; color: gray; indent: 4]] text` |
| `- text` | `[[kind: item; indent: 2]] text` |
| `+ text` | `[[kind: item; indent: 2]] text` |

The concrete properties behind each built-in block symbol are:

| Symbol | Properties |
|---|---|
| `#` | `kind: heading1; size: 32; weight: bold` |
| `##` | `kind: heading2; size: 24; weight: bold` |
| `###` | `kind: heading3; size: 18; weight: bold` |
| `####` | `kind: heading4; size: 16; weight: bold` |
| `#####` | `kind: heading5; size: 14; weight: bold` |
| `>` | `kind: quote; color: gray; indent: 4` |
| `-` | `kind: item; indent: 2` |
| `+` | `kind: item; indent: 2` |

A block symbol in any position other than the start of a line is treated as literal text.

### 9.3 Custom Symbols

Symbols may be declared with a `class` reference or with concrete properties directly:

```atxt
[[SYMBOL symbol: ++; class: highlight; type: inline]]
[[SYMBOL symbol: ^^; color: #1a3a6e; weight: bold; type: inline]]
[[SYMBOL symbol: §; class: section-header; type: block]]
```

When declared with `class`, the class is expanded into its concrete properties at the moment the symbol is applied — following the same expansion rules as toggle class (§8.5). When declared with direct properties, those properties are used directly. In both cases, the class name never enters the propertyContext.

Custom symbol definitions register a new symbol in the Parser's symbol registry. The `type` property is optional and defaults to `inline`. A `SYMBOL` directive with neither a `class` nor any property is silently ignored.

Custom symbol definitions must appear before first use. The symbol sequence must not be empty. A document may redefine a built-in symbol — the new definition takes effect from that point forward.

**Precedence rule:** When two registered symbols share a prefix (e.g. `+` and `++`), the longest matching symbol takes precedence (maximal munch).

Custom inline symbols with empty content between delimiters are treated as literal text.

**Escape rule:** The Lexer processes the universal escape character `\` before the Parser sees token content. To emit a symbol sequence as literal text, escape the first character: `\**` produces the literal text `**` and does not open a symbol.

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
│  TokenStream │  Provides positional access to the token sequence.
└──────┬───────┘  Tracks current index. Exposes peek, advance, match.
       │
       ▼
┌──────────────────────┐
│ Parser + SymbolDetector │  Consumes tokens to build the AST.
└──────────┬───────────┘  Resolves annotation targets.
           │              Expands block and inline symbols via SymbolDetector.
           │              Processes SYMBOL directives at parse time.
           │              Enforces the NEWLINE invariant (§4.4).
           │
           ▼
┌──────────────────────────┐
│  Hydrator + PropertyResolver│  Traverses AST. Resolves classes and properties.
└──────────┬───────────────┘  Manages propertyContext per block scope.
           │                  Routes properties by scope.
           │                  Resolves placeholders against data context (§15).
           │                  Produces the IR.
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
| Hydrator | AST + data context | IR | Know about rendering targets |
| Generator | IR | Target format | Know about source syntax |
| Serializer | IR | Canonical `.atxt` source | Know about rendering targets |

The Generator skips any IR node carrying `hidden: true` in standard rendering mode. WYSIWYG tools may override this behavior to implement revision mode.

The HTML Generator selects the output HTML tag for each `IRBlock` based on the `kind` property. If no `kind` is present, leaf blocks are promoted to `<p>` and non-leaf blocks render as `<div>`. If a `kind` is present but structurally incompatible with the block's children, the Generator emits an error.

---

## 11. Intermediate Representation

### 11.1 Node Types

The IR consists of three node types organized into an `IRDocument`:

```typescript
interface IRDocument {
  root: IRBlock;
  nodeMap: Map<string, IRNode>;        // O(1) lookup by node id
  classDefinitions: Record<string, ResolvedProps>;
}

type IRNode = IRBlock | IRText | IRNewline ;

interface IRBlock {
  id: string;                          // base-36 integer, unique per compilation
  type: "BLOCK";
  props: Record<string, string>;       // block-scope properties only (merged)
  classes: string[];                   // original class names applied to this node
  ownProps: Record<string, string>;    // properties declared directly on the annotation (snapshot for serialization and selectors)
  children: IRNode[];
  line?: number;
  column?: number;
}

interface IRText {
  id: string;
  type: "TEXT";
  props: Record<string, string>;       // inline-scope properties only (full snapshot)
  classes: string[];
  ownProps: Record<string, string>;    // properties declared directly on the annotation
  content: string;
  line?: number;
  column?: number;
  // Note: the IR will include a mechanism to mark certain text nodes as computed
  // (e.g. resolved from a placeholder or trigger) and non-editable by the author.
  // The exact representation — whether as flags on IRText or as a distinct node type
  // such as IRComputedText — is not yet decided and will be specified in §15.
}

interface IRNewline {
  id: string;
  type: "NEWLINE";
  line?: number;
  column?: number;
}
```

`IRNewline` represents a content line break — a newline the author explicitly wrote between lines of text. It carries no properties. It is distinct from structural newlines, which are consumed by the Parser and never reach the IR (see §4.4).

### 11.2 Invariants

The following invariants hold on any valid IR produced by the Hydrator:

1. An `IRBlock` node contains only block-scope properties in `props`.
2. An `IRText` node contains only inline-scope properties in `props`.
3. No property in any node fails the validation predicate of its registry entry.
4. Every `IRText` node carries a complete, standalone property snapshot — it does not inherit from its parent `IRBlock`.
5. Source position (`line`, `column`) is preserved on all nodes to enable WYSIWYG jump-to-source.
6. Every node has a unique `id`, expressed as a base-36 integer generated per compilation. Ids do not persist across compilations.
7. `nodeMap` contains every node in the tree, enabling O(1) lookup by `data-id` from the DOM.
8. Certain text nodes may be marked as computed — produced by the template system rather than authored directly. The exact representation is not yet decided (see §15). The Serializer must never write the resolved content of a computed node back to the source; it must always reconstruct the original placeholder or trigger expression.
9. A **leaf block** is an `IRBlock` whose `children` array contains only `IRText` and `IRNewline` nodes — no nested `IRBlock`. This is the criterion used for leaf-node promotion (§6.5) and for Serializer output decisions (§16).
10. `IRNewline` nodes appear only as children of `IRBlock` nodes. They are never children of `IRText` nodes.
11. The `indent` property in an `IRBlock`'s `props` is never pre-applied to child `IRText` content. The raw content of every `IRText` node reflects exactly what the author wrote — without leading spaces injected by the `indent` mechanism. Generators are responsible for applying `indent` at render time.
12. `ownProps` contains only the properties explicitly declared on the annotation itself — never properties inherited from classes or the propertyContext. It is a snapshot of authorial intent, used by the Serializer and future selectors.

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

The Lexer processes `\x` for any character `x`, emitting an internal escape sentinel (`U+E000`, Unicode Private Use Area) followed by `x` in the TEXT token content. The sentinel is stripped from the source before tokenization begins and never appears in any output. The TextExpander consumes sentinel-prefixed characters as unconditional literals, ensuring they are never interpreted as symbol delimiters.

### 12.4 Block Content Trimming

The leading blank lines within a block `{ ... }` are discarded by `parseBlock` via `skipWhitespaceTokens` before content parsing begins. The trailing NEWLINE at the end of a block's content is removed by `parseBlock` before returning. Interior blank lines between paragraphs are significant and produce `IRNewline` nodes in the IR.

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
| `HIDE` with no resolvable target | `HIDE directive has no target` |

### 13.3 Hydrator Errors

| Condition | Message |
|---|---|
| Unknown property key | `Unknown property: '<key>'` |
| Property value fails validation | `Invalid value for property '<key>': '<value>'` |
| Class applied before definition | `Class '<n>' used before definition` |
| Class redefined in same scope | `Class '<n>' already defined in this scope` |
| `compose` references undefined class | `Cannot compose undefined class '<n>'` |
| `kind` value not in registry | `Unknown kind: '<value>'` |
| Placeholder field value fails validation | `Invalid value for field '<n>': '<value>'` |

### 13.4 Generator Errors

Generator errors are format-specific and are not part of the core `CompilerError` type. Each Generator defines its own error set. The HTML Generator defines:

| Condition | Message |
|---|---|
| `kind` structurally incompatible with block children | `kind '<value>' is not valid on a non-leaf block` |

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

When a placeholder is resolved, the Hydrator produces a text node marked as computed. The resolved value is stored in the node's content. The original placeholder expression is preserved separately for serialization purposes — the Serializer never writes the resolved content back to the `.atxt` source.

### 15.3 Validation

> **Syntax: to be specified.**

A placeholder may declare a validation rule expressed as a regular expression. The regex is evaluated against the resolved value before the IR is produced. If the value does not match, the Hydrator emits a `HYDRATOR` error with a human-readable message and halts rendering for that field.

The regex subset used for validation is deliberately restricted: backreferences and lookahead/lookbehind assertions are not supported. This restriction preserves Turing-incompleteness — the validation predicate terminates in bounded time and produces no side effects.

### 15.4 Triggers and Computed Text Injection

> **Syntax: to be specified.**

A trigger declares a rule of the form: if a selector matches a condition, inject text at a specified location in the document. Triggers are evaluated by the Hydrator after all placeholders have been resolved.

**Selectors** query the IR by node properties, class names, or field names. They do not match computed nodes — nodes with `computed: true` are invisible to selectors. This structural invisibility is the mechanism that prevents trigger chains: a trigger cannot observe the output of another trigger, making cascading reactions architecturally impossible without requiring any runtime cycle detection.

**Injected text** is inserted into the IR as computed text nodes. These nodes are rendered normally by all Generators but are treated as read-only in the WYSIWYG editor (see §15.5) and are serialized back to their original trigger expression, not their resolved content.

The trigger system is **single-pass by design**: the Hydrator evaluates all triggers exactly once against the source IR. The order of evaluation is deterministic (document order). No trigger may reference the output of another trigger.

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

The Serializer is the inverse of the compiler pipeline. It traverses the IR and reconstructs a canonical `.atxt` source file. The round-trip guarantee is: compiling a document and then serializing the resulting IR produces a `.atxt` source that, when compiled again, yields an IR with equivalent visual and semantic properties.

### 16.1 Purpose

The Serializer enables:

- **WYSIWYG round-trip**: a visual editor can mutate the IR directly and serialize the result back to source without ever parsing or modifying the original `.atxt` text.
- **Canonical formatting**: hand-written `.atxt` files may use arbitrary whitespace and shorthand syntax. The Serializer produces a normalized form that is consistent, predictable, and optimally Git-diffable.
- **Source preservation**: the serialized output is valid `.atxt` and compiles back to an equivalent IR. No semantic information is lost.

### 16.2 Canonical Form Rules

The Serializer applies the following rules to produce canonical output:

**Class definitions** are emitted at the top of the document, one per line, sorted alphabetically by class name. Properties within each `DEFINE` are sorted alphabetically by key.

**Blocks** always serialize as explicit `{ }` delimiters, with or without an annotation. Anonymous scope blocks (those with no classes and no inlineProps) serialize as bare `{ }`. This preserves the structural intent of the author — anonymous blocks are never flattened into their parent scope.

**Annotations** emit `class` before `inlineProps`. Within each group, properties are sorted alphabetically.

**Inline toggles** are emitted as `[[+key: val; ...]]` and `[[-key; ...]]` annotations between `IRText` nodes within a run. Added properties are sorted alphabetically. Removed properties are sorted alphabetically and listed after added properties.

**`Newline` nodes** serialize as a line break in the output file. The number of consecutive `Newline` nodes in the IR is preserved exactly — if the author wrote two blank lines, two `Newline` nodes exist in the IR and two blank lines appear in the serialized output. The Serializer never collapses or adds blank lines.

**Shorthand symbols** (`# `, `**`, `_`, etc.) are **not** used in canonical output. The Serializer always emits explicit annotation syntax. This makes canonical ATXT unambiguous and easier to process with external tooling.

**Computed nodes** serialize as their original placeholder expression, never as the resolved content value. See §15 for the full specification of computed nodes.

### 16.3 Block Preservation Invariant

Every `IRBlock` in the IR serializes as a block in the output. The Serializer never flattens, merges, or discards blocks. This invariant exists because:

1. Anonymous scope blocks are structurally significant — they limit toggle and SET scope, and future selectors may query them by identity.
2. The WYSIWYG editor may create anonymous blocks intentionally (e.g., when the user creates a region without applying any class).
3. Discarding blocks would make the Serializer lossy with respect to IR structure, breaking the round-trip guarantee for the WYSIWYG use case.

### 16.4 What the Serializer Does Not Preserve

The Serializer reconstructs semantics, not syntax. The following source-level constructs are not reconstructed:

- **Shorthand symbols**: `# Heading` becomes `[[class: h1]] { ... }`.
- **SET directives**: `[[SET class: foo]]` becomes an annotated block `[[class: foo]] { ... }`. The SET keyword is not emitted because the IR does not distinguish SET-originated blocks from annotation-targeted blocks.
- **Original property order**: properties are always sorted alphabetically in canonical output.
- **Original whitespace**: indentation and blank lines in the source are not preserved; canonical whitespace rules apply.

These losses are acceptable because the canonical form retains full semantic equivalence — the compiled IR is identical in all properties that matter for rendering and selection.

---

*End of ATXT Language Specification v1.0*
