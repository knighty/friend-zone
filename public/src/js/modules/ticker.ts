import { concat, defer, endWith, merge, scan, switchMap, takeWhile, tap } from "rxjs";
import { CustomElement } from "shared/html/custom-element";
import { renderLoop$ } from "shared/rx";
import { animation } from "shared/utils";
import { socket } from "../socket";

export class TickerModule extends CustomElement<{
    Data: {
        ticker: string
    }
}> {
    setup(): void {
        this.innerHTML = ``
        this.bindData("ticker", socket.on("ticker"));
    }

    connect(): void {
        /*this.registerHandler("ticker").pipe(
            switchMap(message => {
                return interval(30).pipe(
                    takeWhile(i => i < message.length, true),
                    map(i => message.substring(0, i))
                )
            })
        ).subscribe(message => {
            this.textContent = message;
        })*/

        this.registerHandler("ticker").pipe(
            switchMap(message => {
                return concat(
                    animation(2).pipe(
                        tap(t => this.style.setProperty("--animation-2", (1 - t).toString()))
                    ),
                    defer(() => {
                        this.textContent = message;
                        return merge(
                            animation(2).pipe(
                                tap(t => this.style.setProperty("--animation-2", (t).toString()))
                            ),
                            renderLoop$.pipe(
                                scan((a, c) => a += c.dt * 0.2, 0),
                                takeWhile(i => i < 1),
                                endWith(1),
                                tap(t => this.style.setProperty("--animation", t.toString()))
                            )
                        )
                    })
                )
            })
        ).subscribe()
    }
}