import { MonoTypeOperatorFunction, Observable, OperatorFunction, animationFrames, concat, connect, debounceTime, endWith, exhaustMap, filter, first, fromEvent, map, merge, partition, race, scan, shareReplay, single, startWith, take, takeUntil, takeWhile, timer } from "rxjs";

export type InputEvents = {
    input: InputEvent;
    change: InputEvent;
}

export type MouseEvents = {
    click: MouseEvent;
    mousedown: MouseEvent;
    mouseup: MouseEvent;
    mousemove: MouseEvent;
    mouseover: MouseEvent;
    mouseleave: MouseEvent;
}

export type TouchEvents = {
    touchstart: TouchEvent;
    touchend: TouchEvent;
}

export type StorageEvents = {
    storage: StorageEvent;
}

export type StateEvents = {
    popstate: PopStateEvent;
}

export type ScrollEvents = {
    scroll: Event
}

export type LoadEvents = {
    load: Event
}

export type KeyEvents = {
    keyup: KeyboardEvent,
    keydown: KeyboardEvent,
}

export type Events = InputEvents & MouseEvents & TouchEvents & StorageEvents & StateEvents & ScrollEvents & LoadEvents & KeyEvents;

type ScopedEventOptions<T> = {
    /**
     * @prop Whether the event should be captured during the top down DOM traversal pass
     */
    capture: boolean,
    /**
     * @prop Whether the event should stop propagating after it's caught
     */
    stopPropagation: boolean,
    /**
     * @prop Whether the default behaviour of the event should be cancelled when it's caught
     */
    preventDefault: boolean,
    /**
     * Callback to check whether the event should be captured or not
     * @param e The captured event
     * @returns 
     */
    filterEvents: (e: T) => boolean
}

function ScopedEventOptionsDefaults<T>({
    capture = false,
    stopPropagation = true,
    preventDefault = true,
}: Partial<ScopedEventOptions<T>> = {}) {
    return { capture, stopPropagation, preventDefault };
}

/**
 * Observe an event emitted from the scoped element's children
 * @param scopedElement The parent element to watch for events
 * @param event Event to watch for
 * @param selector CSS selector for child elements to watch
 * @param options
 */
export function observeScopedEvent<E extends HTMLElement, T extends keyof Events>(scopedElement: Node, event: T, selector: string, options?: Partial<ScopedEventOptions<Events[T]>>): Observable<readonly [Events[T], E]> {
    options = ScopedEventOptionsDefaults(options);
    return fromEvent<Events[T]>(scopedElement, event, { capture: options?.capture ?? false }).pipe(
        map(e => {
            if (options?.filterEvents && !options.filterEvents(e)) {
                return null;
            }
            let element: E = e.target as E;
            do {
                if (!element.matches)
                    return null;
                if (element.matches(selector)) {
                    if (options.stopPropagation)
                        e.stopPropagation();
                    if (options.preventDefault)
                        e.preventDefault();
                    return [e, element] as const;
                }
                element = element.parentNode as E;
            } while (element != scopedElement && element != null);
            return null;
        }),
        filter(e => e != null)
    );
}

/**
 * Observe a DOM event
 * @param element Element to observe
 * @param event Event to observe
 */
export function fromDomEvent<E extends EventTarget, T extends keyof Events>(element: E, event: T) {
    return fromEvent<Events[T]>(element, event);
}

/**
 * Plucks the target out of an event
 */
export function pluckEventTarget<R extends HTMLElement>(): OperatorFunction<Event, R> {
    return map((e: Event) => e.target as R);
}

export type ValueElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Observe an input element's value as it changes
 */
export function observeInput<T extends keyof InputEvents>(element: ValueElement | null, event: T = ("input" as T)): Observable<string> {
    if (element == null)
        throw Error("Element does not exist");
    return fromEvent<T>(element, event).pipe(map(e => element.value));
}

/**
 * Observe an input element's value
 */
export function observeInputField<T extends keyof InputEvents>(element: ValueElement | null, event: T = ("input" as T)): Observable<string> {
    return observeInput(element, event).pipe(startWith(element?.value ?? ""));
}

export function observableToggle(setter$: Observable<boolean>, toggler$: Observable<void>, start: boolean = false): Observable<boolean> {
    return merge(
        setter$.pipe(startWith(start), map(set => (current: boolean) => set)),
        toggler$.pipe(map(() => (current: boolean) => !current)),
    ).pipe(
        scan((a, c) => c(a), false),
        shareReplay(1)
    );
}

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

/**
 * Groups an array based on the result of the grouping function. Also orders the resultant groups by name
 * @param array 
 * @param groupingFunction Should return a string for which group the array item is in
 * @returns 
 */
export function orderedGroupArray<T>(array: T[], groupingFunction: (o: T) => string) {
    type Group = {
        group: string,
        items: T[]
    };

    const groups: Record<string, Group> = {};
    for (let item of array) {
        let g = groupingFunction(item);
        groups[g] = groups[g] || { group: g, items: [] };
        groups[g].items.push(item);
    }

    return Object.values(groups).sort((a, b) => a.group.localeCompare(b.group));
}

export function observeMouseDown(element: HTMLElement, leftClick: boolean = true) {
    return merge(
        fromDomEvent(element, "mousedown").pipe(filter(e => (leftClick == false || e.button == 0))),
        fromDomEvent(element, "touchstart")
    );
}

export function observeMouseUp(element: HTMLElement) {
    return merge(
        fromDomEvent(element, "mouseup"),
        //fromEvent(element, "touchend")
    );
}

/**
 * Observe a short or long press on an element. Returns a tuple of the short and long press observables
 * @param element 
 * @param longPressSeconds How long the element must be held to trigger a long press
 */
export function observeShortLongPress(element: HTMLElement, longPressSeconds: number = 500) {
    const up$ = race(
        timer(longPressSeconds).pipe(map(() => true)),
        observeMouseUp(element).pipe(map(() => false)),
    ).pipe(
        takeUntil(observeMouseMovedThreshold(element)),
        first()
    );

    return partition(observeMouseDown(element).pipe(
        exhaustMap(() => up$),
    ), longPress => !longPress);
}

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
}>, children?: HTMLElement[] | string): T {
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
            element.setAttribute(attr, params.attributes[attr]);
        }
    }
    if (params.data) {
        for (let data in params.data) {
            element.dataset[data] = params.data[data];
        }
    }
    if (params.type) {
        (element as HTMLInputElement).type = type;
    }
    if (params.value) {
        if ("value" in element) {
            element.value = params.value;
        } else {
            throw new SyntaxError(`Value was provided for an element without a value`);
        }
    }
    return element as T;
}

export function createElements<T extends HTMLElement, E>(type: string, elements: E[], fn: (element: E) => T) {

}

export function appendChildren(element: HTMLElement, ...children: HTMLElement[]) {
    for (let child of children) {
        if (child !== undefined)
            element.appendChild(child);
    }
}

export function setChildren(element: HTMLElement, ...children: HTMLElement[]) {
    removeChildren(element);
    appendChildren(element, ...children);
}

export function removeChildren(element: HTMLElement, filterFn?: (element: HTMLElement) => boolean) {
    for (let i = element.childNodes.length - 1; i >= 0; i++) {
        if (filterFn) {
            if (!filterFn(element))
                continue;
        }
        element.removeChild(element.childNodes[i]);
    }
}

export function debounceAfterFirst<T>(time: number, num: number = 1): MonoTypeOperatorFunction<T> {
    return connect(value =>
        concat(
            value.pipe(take(num)),
            value.pipe(debounceTime(time))
        )
    )
}

export function removeNode(node: any) {
    node.parentNode.removeChild(node);
}

/**
 * Observe the mouse position
 * @param element Element to calculate the position relative to. Can be empty for global position
 */
export function observeMousePosition(element: HTMLElement | undefined) {
    const rootElement = element ?? document.documentElement;
    return fromDomEvent(rootElement, "mousemove").pipe(
        map(e => ({
            x: e.pageX - rootElement.offsetLeft,
            y: e.pageY - rootElement.offsetTop,
        }))
    )
}

export function observeMousePositionOffset(element?: HTMLElement) {
    return fromDomEvent(element ?? document.documentElement, "mousemove").pipe(
        map(e => ({
            x: e.offsetX,
            y: e.offsetY,
        }))
    )
}

export function observeMouseMove(element: HTMLElement) {
    return fromEvent<MouseEvent>(element, "mousemove").pipe(
        map(e => ({ x: e.movementX, y: e.movementY }))
    );
}

export function observeMouseMovedThreshold(element: HTMLElement, threshold = 5) {
    return observeMouseMove(element).pipe(
        scan((a, c) => a + Math.sqrt(c.x * c.x + c.y * c.y), 0),
        single(moved => moved > threshold),
    )
}

export function toggleClass(element: HTMLElement, c: string) {
    return (visible: boolean) => element.classList.toggle(c, visible);
}

/**
 * Observe when an image is loaded
 * @param element 
 * @returns 
 */
export function observeImageLoaded(element: HTMLImageElement) {
    return fromEvent(element, "load").pipe(
        map(e => element.complete),
        startWith(element.complete),
        filter(v => v),
        first()
    );
}

/**
 * Observe a keyboard press
 * @param code The button to test
 * @param event Which key event to watch for. keydown or keyup
 * @param repeating Whether to register repeating inputs or not
 * @returns 
 */
export function observeKey(code: string, event: keyof KeyEvents = "keydown", repeating: boolean = false) {
    return fromDomEvent(document, event).pipe(
        filter(e => e.code == code && (!e.repeat || e.repeat == repeating))
    );
}

/**
 * Find the next  item given a list and a current item
 * @param list 
 * @param compare Test an item to see if it is the current
 * @returns 
 */
export function findNext<T>(list: Iterable<T>, compare: (test: T) => boolean): T | null {
    let next = null;
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

/**
 * Find the previous item given a list and a current item
 * @param list 
 * @param compare Test an item to see if it is the current
 * @returns 
 */
export function findPrevious<T>(list: Iterable<T>, compare: (test: T) => boolean): T | null {
    let previous: T | null = null;
    for (let element of list) {
        if (compare(element) && previous !== null)
            break;
        previous = element;
    }
    return previous;
}

function easeOutBack(x: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;

    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Observable for an animation over values from start to end over duration
 * @param durationSeconds How long to interpolate for in seconds
 * @param start The starting value to interpolate from
 * @param end End value to interpolate to
 * @returns 
 */
export function animation(durationSeconds: number, options: {
    start?: number;
    end?: number;
    curve?: (num: number) => number
} = {}) {
    const { start = 0, end = 1, curve = (num: number) => num } = options;

    return animationFrames().pipe(
        map(v => v.elapsed / (1000 * durationSeconds)),
        takeWhile(v => v < 1),
        map(easeOutBack),
        map(v => start + (end - start) * v),
        endWith(end)
    );
}

export function objectMap<T extends Record<string, any>, V>(obj: T, project: (value: any, key: keyof T) => V) {
    const newObject: any = {};
    for (let prop in obj) {
        newObject[prop] = project(obj[prop], prop);
    }
    return newObject as Record<string, V>;
}

export function objectMapArray<T extends Record<string, any>, V>(obj: T, project: (value: any, key: keyof T) => V) {
    const a: V[] = [];
    for (let prop in obj) {
        a.push(project(obj[prop], prop));
    }
    return a as V[];
}

export function truncateString(input: string, length: number) {
    if (length >= input.length)
        return input;
    let i = input.indexOf(" ", length);
    if (i == -1) {
        i = length;
    }
    return input.substring(0, i);
}

export function executionTimer(options?: Partial<{
    format: "seconds" | "milliseconds" | "minutes"
}>) {
    const start = performance.now();
    return {
        end: () => {
            const end = performance.now();
            const duration = Math.floor(end - start);

            switch (options?.format ?? "milliseconds") {
                case "milliseconds":
                    return duration.toLocaleString() + "ms";
                case "seconds":
                    return Math.floor(duration / 1000).toLocaleString() + "s";
                case "minutes":
                    return Math.floor(duration / 60000).toLocaleString() + "m";
            }
        }
    }
}

export function lastIndexOfRegex(str: string, regex: RegExp) {
    var match = str.match(regex);
    return match ? (str.lastIndexOf(match[match.length - 1]) + match[match.length - 1].length) : -1;
}