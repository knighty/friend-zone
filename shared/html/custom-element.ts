import { map, Observable, Subject, switchMap, takeUntil } from "rxjs";
import { Events, observeScopedEvent } from "../dom";
import { ObservableMap } from "../rx/observables/map";

type CustomElementTypeImpl<Data extends Record<string, any> = {}, Elements extends Record<string, any> = {}> = {
    Data: Data,
    Elements: Elements
}

type CustomElementType = {
    Data?: Record<string, any>,
    Elements?: Record<string, any>
}

type PickByType<T, Value> = {
    [P in keyof T as T[P] extends Value | undefined ? P : never]: T[P]
}

type ValueElements<T> = PickByType<T, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

export class CustomElement<T extends CustomElementType> extends HTMLElement {
    private hasSetup = false;
    private connected = false;
    public disconnected$ = new Subject<void>();
    private dataSources = new ObservableMap<keyof T["Data"], Observable<any>>();
    private cachedElements: T["Elements"] = {};

    element<K extends keyof T["Elements"]>(key: K) {
        // @ts-ignore
        if (!this.cachedElements[key]) {
            const element = this.querySelector(`[data-element=${String(key)}]`);
            if (element == null) {
                throw new Error(`Element "${String(key)}" does not exist`);
            }
            // @ts-ignore
            this.cachedElements[key] = element as T["Elements"][K];
        }
        // @ts-ignore
        return this.cachedElements[key] as T["Elements"][K];
    }

    disconnectedCallback() {
        this.disconnected$.next();
        this.connected = false;
    }

    connectedCallback() {
        if (!this.hasSetup) {
            this.setup();
            this.hasSetup = true;
        }
        if (!this.connected) {
            this.connect();
            this.connected = true;
        }
    }

    observeEvent(event: keyof Events, selector: string) {
        return observeScopedEvent(this, event, selector).pipe(
            takeUntil(this.disconnected$)
        );
    }

    observeElement(event: keyof Events, element: string) {
        return this.observeEvent(event, `[data-element=${element}]`);
    }

    observeValue<E extends keyof ValueElements<T["Elements"]>>(element: E, event: "input" | "change" = "input") {
        return this.observeEvent(event, `[data-element=${String(element)}]`).pipe(
            // @ts-ignore
            map(([event, element]) => (element as ValueElements<T["Elements"]>[E]).value),
        );
    }

    bindData<K extends keyof T["Data"], O extends Observable<T["Data"][K]>>(key: K, observable: O) {
        this.dataSources.set(key, observable);
    }

    registerHandler<K extends keyof T["Data"]>(key: K) {
        return this.dataSources.get(key).pipe(
            switchMap(obs => obs),
            takeUntil(this.disconnected$),
        ) as Observable<T["Data"][K]>;
    }

    connect() { }

    setup() { }
}


