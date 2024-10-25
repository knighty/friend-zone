import { concat, defer, merge, switchMap, tap } from "rxjs";
import { CustomElement } from "shared/html/custom-element";
import { animation, curves } from "shared/utils";
import { socket } from "../socket";

export class TickerModule extends CustomElement<{
    Data: {
        ticker: string
    },
    Elements: {
        text: HTMLSpanElement
    }
}> {
    setup(): void {
        this.innerHTML = `<div class="container"><span data-element="text" class="text"></span></div>`
        this.bindData("ticker", socket.on("ticker"));
    }

    connect(): void {
        this.registerHandler("ticker").pipe(
            switchMap(message => {
                const time = message.length * 0.1;
                return concat(
                    animation(1).pipe(
                        tap(t => this.style.setProperty("--translate", (0 + t).toString())),
                        tap(t => this.style.setProperty("--fade", (1 - t).toString()))
                    ),
                    defer(() => {
                        this.element("text").innerHTML = message;
                        return merge(
                            animation(1).pipe(
                                tap(t => this.style.setProperty("--translate", (-1 + t).toString())),
                                tap(t => this.style.setProperty("--fade", (t).toString()))
                            ),
                            animation(time, { curve: curves.linear }).pipe(
                                tap(t => this.style.setProperty("--animation", t.toString()))
                            )
                        )
                    })
                )
            })
        ).subscribe()
    }
}