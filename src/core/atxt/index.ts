export { compileToIR, compileToHTML } from "./compiler/compiler";
export { serialize } from "./compiler/serializer";

export { Lexer } from "./compiler/lexer";
export { Parser } from "./compiler/parser";
export { Hydrator } from "./compiler/hydrator";
export { Generator } from "./compiler/generator";

export * as AST from "./types/ast";
export * as IR from "./types/ir";

export { TokenType } from "./types/tokens";
export type { Token } from "./types/tokens";
export type { CompilerError } from "./types/errors";

export { COMPILER_DEFAULTS } from "./domain/propertyDefinitions";
export type { PropertyDefinition, KindDefinition } from "./domain/propertyDefinitions";
export type { CssPropertyMapping, CssUnit } from "./domain/cssPropertyMapping";
export { getPropertyDefinition, getKindDefinition } from "./domain/propertyDefinitions";
export { getCssMapping } from "./domain/cssPropertyMapping";
