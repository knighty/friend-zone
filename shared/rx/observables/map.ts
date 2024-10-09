import { Observable, Subject, map, merge, shareReplay, startWith } from "rxjs";
import filterMap from "../operators/filter-map";

export class ObservableMap<Key, Value> {
    private data = new Map<Key, Value>();
    private set$ = new Subject<void>();
    private deleted$ = new Subject<void>();
    private updated$ = new Subject<void>();
    private keyUpdated$ = new Subject<Key>();
    private changed$ = merge(this.updated$, this.set$, this.deleted$).pipe(
        startWith(null),
        map(() => this.data),
        shareReplay(1)
    );

    get values$() {
        return this.changed$.pipe(
            map(entries => Array.from(entries.values()))
        );
    }

    get entries$() {
        return this.changed$.pipe(
            map(map => Object.fromEntries(map) as Record<Key extends PropertyKey ? Key : string, Value>)
        );
    }

    get keys$() {
        return this.changed$.pipe(
            map(map => Array.from(map.keys()))
        );
    }

    /**
     * Observe a specific key for changes in value
     * @param key 
     * @returns 
     */
    get(key: Key): Observable<Value> {
        const current = this.data.get(key);
        return this.keyUpdated$.pipe(
            filterMap(updatedKey => updatedKey == key, () => this.data.get(key) as Value, current),
        );
    }

    /**
     * Set a value at key
     * @param key 
     * @param value 
     * @returns Boolean indicating whether the key was new or not
     */
    set(key: Key, value: Value): boolean {
        const newKey = this.data.has(key);
        this.data.set(key, value);
        this.set$.next();
        this.keyUpdated$.next(key);
        return newKey;
    }

    /**
    * Set the value of a key with a callback based on its current value or a default
    * @param key 
    * @param fn 
    * @param def 
    * @returns The new value that was set
    */
    atomicSet<Default extends Value | undefined>(key: Key, fn: (value: Default extends Value ? Value : Value | undefined) => Value, def?: Default): Default extends Value ? Value : Value | undefined {
        const value = this.data.get(key);
        const newValue = fn((value === undefined ? def : value) as Default extends Value ? Value : Value | undefined);
        this.set(key, newValue);
        return newValue;
    }

    /**
     * Batch set multiple items at once
     * @param items 
     */
    setBatch(items: { key: Key, value: Value }[]) {
        for (let item of items) {
            this.data.set(item.key, item.value);
            this.keyUpdated$.next(item.key);
        }
        this.set$.next();
    }

    /**
     * Update the value at key if it exists
     * @param key 
     * @param value 
     */
    update(key: Key, value: Partial<Value>) {
        if (this.data.has(key)) {
            const data = this.data.get(key);
            if (data == undefined)
                return;
            this.data.set(key, {
                ...data,
                ...value
            });
            this.updated$.next();
            this.keyUpdated$.next(key);
        }
    }

    updateBatch(items: { key: Key, value: Partial<Value> }[]) {
        let updated = false;
        for (let item of items) {
            if (this.data.has(item.key)) {
                const data = this.data.get(item.key);
                if (data == undefined)
                    return;
                this.data.set(item.key, {
                    ...data,
                    ...item.value
                });
                this.keyUpdated$.next(item.key);
                updated = true;
            }
        }
        if (updated)
            this.updated$.next();
    }

    /**
     * Delete the values at each key provided
     * @param keys 
     */
    delete(...keys: Key[]) {
        let deleted = false;
        for (let key of keys) {
            if (this.data.has(key)) {
                this.data.delete(key);
                this.keyUpdated$.next(key);
                deleted = true;
            }
        }
        if (deleted) {
            this.deleted$.next();
        }
    }

    /**
     * Empty the map of all values
     */
    empty() {
        this.data = new Map<Key, Value>();
        this.updated$.next();
    }
}