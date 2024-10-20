import { setChildren } from "./utils";

type Inputs = {
    range: {
        min?: string,
        max?: string,
        step?: string,
    },
    text: {
        maxlength: number
    },
    number: {
    },
    checkbox: {
        checked: string
    },
};

type HTMLElements = {
    h1: HTMLHeadingElement,
    h2: HTMLHeadingElement,
    h3: HTMLHeadingElement,
    h4: HTMLHeadingElement,
    h5: HTMLHeadingElement,
    h6: HTMLHeadingElement,
    input: HTMLInputElement,
    label: HTMLLabelElement,
    textarea: HTMLTextAreaElement,
    select: HTMLSelectElement
}

type Attributes = {
    style?: string,
}

type Params<A = any> = Partial<{
    attributes: A,
    classes: string[],
    data: Record<string, any>
}>;

function create<A extends Record<string, any>, K extends keyof HTMLElements, E = any>(type: K, callback?: (element: HTMLElements[K]) => void) {
    return (params?: Partial<{
        attributes: A,
        classes: string[],
        data: Record<string, any>
    }>, children?: (HTMLElement | Text)[] | string) => {
        const element = document.createElement(type);

        if (params?.classes) {
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
        if (params?.attributes) {
            for (let attr in params.attributes) {
                if (params.attributes[attr] !== undefined)
                    element.setAttribute(attr, String(params.attributes[attr]));
            }
        }
        if (params?.data) {
            for (let data in params.data) {
                element.dataset[data] = params.data[data];
            }
        }

        if (callback) {
            callback(element);
        }

        return element as HTMLElements[K];
    }
}

const inputCreate = create<any, "input">("input");
const input = <T extends keyof Inputs>(type: T, value: any, attributes?: Inputs[T], params?: Params) => {
    const element = inputCreate({
        ...params,
        attributes: attributes
    })
    element.type = type;
    if (value !== undefined) {
        element.value = value;
    }
    return element;
}

const h1 = create("h1");
const h2 = create("h2");
const h3 = create("h3");
const h4 = create("h4");
const h5 = create("h5");
const h6 = create("h6");

const select = create("select");

const label = create("label");

const text = (text: string) => {
    return document.createTextNode(text);
}

const id = <T extends HTMLElement = HTMLElement>(id: string) => {
    return document.getElementById(id) as T;
}

const query = <T extends HTMLElement = HTMLElement>(query: string, root?: Element) => {
    return (root ?? document).querySelector(query) as T;
}

const queryAll = <T extends HTMLElement = HTMLElement>(query: string, root?: Element) => {
    return (root ?? document).querySelectorAll(query) as NodeListOf<T>;
}

export const dom = {
    id, query, queryAll,
    h1, h2, h3, h4, h5, h6,
    label, input, select,
    text
}