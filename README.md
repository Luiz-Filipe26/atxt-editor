# ATXT: Motor de Renderização Declarativo para Documentos

O **ATXT** é uma linguagem de marcação e um compilador projetados para criar documentos com controle visual rigoroso mantendo a portabilidade do texto puro. Ele foi desenvolvido para cenários onde o Markdown é insuficiente em termos de layout e o DOCX é excessivamente complexo para controle de versão.

## 🎯 Propósito

O ATXT serve para gerar documentos estilizados (como manuais, relatórios e e-books) onde o design — margens, alinhamentos, bordas e tipografia — precisa ser declarado diretamente no fluxo do texto de forma legível.

- **Fidelidade de Whitespace:** Preserva espaços e quebras de linha originais do autor.
- **Geometria Dinâmica:** Alterna automaticamente entre elementos `inline` e `block` baseando-se nas propriedades aplicadas.
- **Versionamento Amigável:** Por ser texto puro, permite `diffs` claros em sistemas como Git, permitindo auditoria de mudanças visuais e de conteúdo.

## 🚀 Exemplo de Sintaxe

O ATXT utiliza anotações `[[ ]]` para definir propriedades aplicadas ao texto subsequente ou a blocos delimitados por `{ }`.

```atxt
[[ SET font: "Garamond, serif"; size: 19; line-height: 1.8; align: justify ]]

[[ align: center; size: 48; weight: 800; margin: "40 0 20 0" ]]
O MANIFESTO DE AETHELGARD

[[ fill: #fdf2e9; border: "1px solid #e59866"; padding: 30; radius: 12 ]] {
    [[ align: center; size: 22; weight: bold; decoration: underline ]]
    AVISO AOS NAVEGANTES

    É estritamente proibido o uso de propulsores a carvão...

}

Texto com formatação [[ weight: bold; color: red ]] inline integrada perfeitamente.
```

## 🛠️ Especificações Técnicas (MVP)

O compilador opera em uma esteira de quatro estágios independentes:

1. **Lexer:** Scanner com suporte a estados e escape de caracteres estruturais via `\`.
2. **Parser:** Geração de AST (Abstract Syntax Tree) com suporte a diretivas globais (`SET`), locais e de bloco.
3. **Hydrator:** Validação de propriedades e resolução de escopo léxico (conversão de tipos e unidades).
4. **Generator:** Produção de HTML autossuficiente com CSS encapsulado, garantindo portabilidade em diferentes ambientes web.

### Propriedades Suportadas

- **Tipografia:** `font`, `size`, `weight`, `style`, `color`, `line-height`, `decoration`.
- **Layout (Box Model):** `margin`, `padding`, `align`, `fill` (background), `radius`, `border`, `width`, `height`.

## 💻 Instalação e Uso

O projeto utiliza **Vite** e **TypeScript**.

```bash
# Instalação

npm install

# Desenvolvimento

npm run dev
```

O ATXT Studio será iniciado, oferecendo um ambiente de edição com Preview em tempo real e saída de log da árvore sintática no console para depuração técnica.
