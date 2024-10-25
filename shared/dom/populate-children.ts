import { appendChildren, removeChildren } from "./nodes";

/**
 * Populate an element from an array
 * @param element The element to attach new elements to
 * @param data The array to populate with
 * @param existingNode A function that checks if an existing node matches the array item
 * @param createNode A function to create a new element if one doesn't exist
 * @param updateNode A function to update an existing element
 */
export function populateChildren<T, E extends HTMLElement>(
    element: HTMLElement,
    data: T[],
    existingNode: (element: E, item: T) => boolean,
    createNode: (item: T) => E,
    updateNode?: (item: T, element: E) => void,
) {
    let nodes = Array.from(element.childNodes) as E[];
    let keep: E[] = [];
    let children: E[] = [];
    for (let item of data) {
        const current = nodes.find(node => existingNode(node, item));
        if (current) {
            keep.push(current);
            if (updateNode) {
                updateNode(item, current);
            }
        } else {
            children.push(createNode(item));
        }
    }
    removeChildren(element, option => !keep.includes(option as E))
    appendChildren(element, ...children);
}