/*import { Observable, Subject, switchMap, takeUntil } from "rxjs";
import { ObservableMap } from "../data/observable-map";

type CustomElementType = {
    Data?: Record<string, any>,
    Elements?: Record<string, any>
};

class CustomElement<T extends CustomElementType> extends HTMLElement {
    private hasSetup = false;
    private connected = false;
    public disconnected$ = new Subject<void>();
    private dataSources = new ObservableMap<keyof T["Data"], Observable<any>>();
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
        this.dataSources.set(key, observable);
    }

    registerHandler<K extends keyof T["Data"]>(key: K) {
        return this.dataSources.observeKey(key).pipe(
            switchMap(obs => obs),
            takeUntil(this.disconnected$),
        ) as Observable<T["Data"][K]>;
    }

    connect() { }

    setup() { }
}

type CustomElementDecl<CustomElementType> = {
    render?: () => string
    connect?: () => void
    disconnect?: () => void
}

function customElement<T extends CustomElementType>(decl: CustomElementDecl<T>): CustomElementDecl<T> {
    return decl;
}

function defineCustomElement(callback: (...dependencies: any) => CustomElementDecl<any>) {

}

const woth = defineCustomElement((socket: WebSocket, socket2: WebSocket) => {
    return customElement<{
        Data: {
            woth: string
        },
        Elements: {
            word: HTMLElement
        }
    }>({
        render: () => `<sub-element><sub-element>`,

        connect: () => {
            this.registerHandler("woth").subscribe(word => {
                this.element("word").textContent = word;
                this.dataset.state = word ? "show" : "hidden";
            });
        }
    })
});*/