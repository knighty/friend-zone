import { setChildren } from "./dom";

/**
 * Programatically create an html element
 * @param type 
 * @param params 
 * @returns 
 */
export function createElement<T extends HTMLElement>(type: string, params?: Partial<{
    classes: string[];
    attributes: Record<string, string>;
    data: Record<string, any>;
    value: string;
    type: string;
}>, children?: (HTMLElement | Text)[] | string): T {
    const element = document.createElement(type);

    if (params === undefined) {
        params = {};
    }

    if (params.classes) {
        element.classList.add(...params.classes.filter(c => c !== undefined));
    }
    if (typeof children == "string") {
        element.innerText = children;
        element.innerHTML = children;
        element.textContent = children;
    }
    if (Array.isArray(children)) {
        setChildren(element, ...children);
    }
    if (params.attributes) {
        for (let attr in params.attributes) {
            if (params.attributes[attr] !== undefined)
                element.setAttribute(attr, params.attributes[attr]);
        }
    }
    if (params.data) {
        for (let data in params.data) {
            element.dataset[data] = params.data[data];
        }
    }
    if (params.type) {
        (element as HTMLInputElement).type = params.type;
    }
    if (params.value !== undefined) {
        if ("value" in element) {
            element.value = params.value;
        } else {
            throw new SyntaxError(`Value was provided for an element without a value`);
        }
    }
    return element as T;
}

// Types

// Animations
export { animation } from "./utils/animation";

// Object utilities
export { objectMap, objectMapArray } from "./utils/object-map";
export { objectRandom } from "./utils/object-random";

// Async utilities
export { awaitResult } from "./utils/await-result";

// Stats utilities
export { executionTimer } from "./utils/execution-timer";

// Array utilities
export { arrayRandom } from "./utils/array-random";
export { findNext } from "./utils/find-next";
export { findPrevious } from "./utils/find-previous";
export { groupArray } from "./utils/group-array";
export { groupByKey } from "./utils/group-by-key";
export { orderedGroupArray } from "./utils/ordered-group-array";

