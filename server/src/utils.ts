import { FastifyRequest } from 'fastify';
import fs from "fs";
import path from 'path';
import { catchError, EMPTY, firstValueFrom, map, Observable, share, shareReplay, tap, timestamp } from 'rxjs';
import { log } from 'shared/logger';

//https://stackoverflow.com/a/54957061
export function createCachedSource<T>(
    makeRequest: () => Observable<T>,
    windowTime: number
): Observable<T> {
    let cache: any;

    return new Observable<T>((obs) => {
        const isFresh = cache?.timestamp + windowTime > new Date().getTime();
        if (isFresh) {
            obs.next(cache.value);
            obs.complete();
        } else {
            return makeRequest()
                .pipe(
                    timestamp(),
                    tap((current) => (cache = current)),
                    map(({ value }) => value)
                )
                .subscribe(obs);
        }
    }).pipe(share());
};

export function getRequestDependency<T>(req: FastifyRequest, name: string) {
    if (name in req.dependencies) {
        const o: T = (<T>req.dependencies[name]);
        return o;
    } else {
        throw new Error(`Request dependency "${name}" does not exist`);
    }
}

export function getLazyRequestDependency<T>(req: FastifyRequest, name: string) {
    if (name in req.dependencies) {
        const o: LazyRequestDependency<T> = req.dependencies[name];
        return o.get();
    } else {
        throw new Error(`Request dependency "${name}" does not exist`);
    }
}

export class LazyRequestDependency<T> {
    obj: T | undefined = undefined;
    loader: () => Promise<T>;

    constructor(loader: () => Promise<T>) {
        this.loader = loader;
    }

    async get(): Promise<T> {
        if (this.obj === undefined) {
            const p = this.loader();
            this.obj = await p;
        }
        return this.obj;
    }
}

//https://medium.com/@developer.olly/understanding-typescript-infer-ac42bd018f3
export type UnArray<T> = T extends Array<infer U> ? U : T;

type ManifestFile = { [Key: string]: string }
export const manifest$ = new Observable<ManifestFile>((subscriber) => {
    const filename = path.join(__dirname, "../../public/dist/manifest.json");
    const update = () => {
        log.info("Static manifest file updated", "server");
        const manifest = JSON.parse(fs.readFileSync(filename).toString());
        subscriber.next(<ManifestFile>manifest);
    }
    update();
    fs.watchFile(filename, () => update());
}).pipe(
    shareReplay(1)
);

export function getManifestPath(path: string) {
    return firstValueFrom(manifest$.pipe(map(manifest => manifest[path])));
}
export const catchAndLog = <T>() => catchError<T, Observable<never>>(e => {
    log.error(e);
    return EMPTY;
});
