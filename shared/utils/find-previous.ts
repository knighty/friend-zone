/**
 * Find the previous item given a list and a current item
 * @param list 
 * @param compare Test an item to see if it is the current
 * @returns 
 */
export function findPrevious<T>(list: Iterable<T>, compare: (test: T) => boolean): T | undefined {
    let previous: T | undefined = undefined;
    for (let element of list) {
        if (compare(element) && previous !== null)
            break;
        previous = element;
    }
    return previous;
}