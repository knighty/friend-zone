/**
 * Groups an array based on the result of the grouping function. Also orders the resultant groups by name
 * @param array 
 * @param groupingFunction Should return a string for which group the array item is in
 * @returns 
 */
export function orderedGroupArray<T>(array: T[], groupingFunction: (o: T) => string) {
    type Group = {
        group: string,
        items: T[]
    };

    const groups: Record<string, Group> = {};
    for (let item of array) {
        let g = groupingFunction(item);
        groups[g] = groups[g] || { group: g, items: [] };
        groups[g].items.push(item);
    }

    return Object.values(groups).sort((a, b) => a.group.localeCompare(b.group));
}
