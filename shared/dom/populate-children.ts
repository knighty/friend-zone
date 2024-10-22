import { appendChildren, removeChildren } from "./nodes";

export function populateChildren<T>(
    element: HTMLElement,
    data: T[],
    existingNode: (elements: HTMLElement, item: T) => boolean,
    createNode: (item: T) => HTMLElement,
) {
    let nodes = Array.from(element.childNodes) as HTMLElement[];
    let keep: HTMLElement[] = [];
    let children: HTMLElement[] = [];
    for (let item of data) {
        const current = nodes.find(node => existingNode(node, item));
        if (current) {
            keep.push(current);
        } else {
            children.push(createNode(item));
        }
    }
    removeChildren(element, option => !keep.includes(option))
    appendChildren(element, ...children);
}