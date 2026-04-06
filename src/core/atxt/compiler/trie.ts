interface TrieNode<T> {
    children: Map<string, TrieNode<T>>;
    value?: T;
}

export interface TrieMatch<T> {
    value: T;
    literal: string;
}

export class Trie<T> {
    private root: TrieNode<T> = { children: new Map() };

    public insert(sequence: string, value: T): void {
        let node = this.root;
        for (const char of sequence) {
            if (!node.children.has(char)) node.children.set(char, { children: new Map() });
            node = node.children.get(char)!;
        }
        node.value = value;
    }

    public match(text: string, pos: number): TrieMatch<T> | null {
        let node = this.root;
        let bestValue: T | null = null;
        let bestEnd = -1;

        for (let i = pos; i < text.length; i++) {
            const char = text[i];
            if (!node.children.has(char)) break;

            node = node.children.get(char)!;
            if (node.value === undefined) continue;
            bestValue = node.value;
            bestEnd = i;
        }

        if (bestValue === null) return null;
        return {
            value: bestValue,
            literal: text.slice(pos, bestEnd + 1),
        };
    }
}
