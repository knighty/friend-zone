/**
 * Groups an array based on the result of the grouping function
 * @param array 
 * @param groupingFunction Should return a string for which group the array item is in
 */
export function groupArray<T>(array: T[], groupingFunction: (o: T) => string) {
    const groups: Record<string, T[]> = {};

    for (let item of array) {
        let g = groupingFunction(item);
        groups[g] = groups[g] || [];
        groups[g].push(item);
    }

    return groups;
}