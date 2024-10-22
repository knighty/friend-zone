export function appendChildren(element: HTMLElement, ...children: (HTMLElement | Text)[]) {
    for (let child of children) {
        if (child !== undefined)
            element.appendChild(child);
    }
}

export function setChildren(element: HTMLElement, ...children: (HTMLElement | Text)[]) {
    removeChildren(element);
    appendChildren(element, ...children);
}

export function removeChildren(element: HTMLElement, filterFn?: (element: HTMLElement) => boolean) {
    for (let i = element.childNodes.length - 1; i >= 0; i--) {
        const child = element.childNodes[i];
        if (!(child instanceof HTMLElement))
            continue;
        if (filterFn && !filterFn(child))
            continue;
        child.remove();
    }
}

export function removeNode(node: any) {
    node.parentNode.removeChild(node);
}