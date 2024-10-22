/**
 * Find the next  item given a list and a current item
 * @param list 
 * @param compare Test an item to see if it is the current
 * @returns 
 */
export function findNext<T>(list: Iterable<T>, compare: (test: T) => boolean): T | undefined {
    let next = undefined;
    let found = false;
    for (let element of list) {
        next = next ?? element;
        if (found) {
            next = element;
            break;
        }
        if (compare(element)) {
            found = true;
        }
    }
    return next;
}