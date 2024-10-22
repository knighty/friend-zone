/**
 * Groups an array based on a key on the items in the array
 * @param array 
 * @param key 
 * @returns 
 */
export function groupByKey<TObj, TKey extends keyof TObj>(array: TObj[], key: TKey) {
    const groups = {} as Record<TObj[TKey] & PropertyKey, TObj[]>;

    for (let item of array) {
        let g = item[key] as TObj[TKey] & PropertyKey;
        groups[g] = groups[g] || [];
        groups[g].push(item);
    }

    return groups;
}