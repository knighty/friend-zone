import { BehaviorSubject, distinctUntilChanged, Observable, Subject, switchMap, takeUntil } from "rxjs";

type CustomElementType = {
    Data?: Record<string, any>,
    Elements?: Record<string, any>
}

type PartialData<T> = Partial<Record<keyof T, Observable<any>>>

export class CustomElement<T extends CustomElementType> extends HTMLElement {
    private hasSetup = false;
    private connected = false;
    public disconnected$ = new Subject<void>();
    private dataSources: PartialData<T["Data"]> = {};
    private dataSources$ = new BehaviorSubject<PartialData<T["Data"]>>(null);
    protected elements: T["Elements"];

    element<K extends keyof T["Elements"]>(key: K) {
        return this.elements[key] as T["Elements"][K];
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

    bindData<K extends keyof T["Data"], O extends Observable<T["Data"][K]>>(key: K, observable: O) {
        this.dataSources[key] = observable;
        this.dataSources$.next(this.dataSources);
    }

    registerHandler<K extends keyof T["Data"]>(key: K) {
        return this.dataSources$.pipe(
            switchMap(sources => sources[key]),
            distinctUntilChanged(),
            takeUntil(this.disconnected$),
        ) as Observable<T["Data"][K]>;
    }

    connect() { }

    setup() { }
}