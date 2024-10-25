export function sortChildren<T extends HTMLElement>(element: HTMLElement, compare: (a: T, b: T) => number) {
    let sortedChildren: T[] = Array.from(element.children) as T[];
    let originalChildren: T[] = Array.from(element.children) as T[];
    sortedChildren.sort(compare);
    for (let child of sortedChildren) {
        element.appendChild(child);
    }
    /*let previous: T | null = null;
    for(let i = 0; i < originalChildren.length; i++) {
        if (sortedChildren[i] != originalChildren[i]) {
            const sortedChild = sortedChildren[i];
            for(let j = 0; j < originalChildren.length; j++) {
                if (sortedChild == originalChildren[j]) {
                    element.insertBefore()
                }
            }
        }
        previous = originalChildren[i]
    }*/
}