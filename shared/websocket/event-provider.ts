import { Observable } from "rxjs";

export type EventProvider = {
    hasEvent: (event: string) => boolean
    observe: (event: string) => Observable<any>
}

export class ObservableEventProvider implements EventProvider {
    data: Record<string, Observable<any>>;

    constructor(data: Record<string, Observable<any>>) {
        this.data = data;
    }

    hasEvent(event: string) {
        return !!this.data[event];
    }

    observe(event: string) {
        return this.data[event];
    }
}
