export function sortedMapEntries<T>(map: Map<string, T>): [string, T][] {
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
