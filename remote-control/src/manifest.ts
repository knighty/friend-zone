import fs from "fs";
import path from "path";
import { firstValueFrom, map, Observable, shareReplay } from "rxjs";
import { log } from "shared/logger";

const publicDir = path.join(__dirname, "../");

type ManifestFile = { [Key: string]: string }
const manifest$ = new Observable<ManifestFile>((subscriber) => {
    const filename = path.join(publicDir, "dist/manifest.json");
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