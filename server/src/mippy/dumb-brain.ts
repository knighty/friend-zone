import { Observable, Subject, map, share } from "rxjs";
import { logger } from "shared/logger";
import { MippyBrain, MippyMessage, MippyPrompts } from "./mippy-brain";

const log = logger("dumb-mippy-brain");

export class DumbMippyBrain implements MippyBrain {
    prompt$ = new Subject<string>();
    messages$: Observable<MippyMessage>;

    constructor() {
        this.messages$ = this.prompt$.pipe(
            map(text => {
                log.info(text)
                return {
                    text,
                }
            }),
            share(),
        );
    }

    receive(): Observable<MippyMessage> {
        return this.messages$;
    }

    getPrompt<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data): string {
        function handle<E extends keyof MippyPrompts, D extends MippyPrompts[E]>(event: E, fn: (d: D) => string) {
            return fn(data as unknown as D);
        }

        switch (event) {
            case "question": return handle("question", data => `${data.question}. I dunno, I'm a dumb brain so I have no capacity for thought`)
            case "wothSetCount": return handle("wothSetCount", data => `${data.user} has said the word of the hour ${data.count} times. What an absolute buffoon, I can't believe he'd do that. Is it really that hard to not spurt out simple words? It's like he's a cave man incapable of controlling himself`)
            case "wothSetWord": return handle("wothSetWord", data => `${data.user} set the word of the hour to ${data.word}`)
            case "newFollower": return handle("newFollower", data => `${data.user} followed the stream`)
            case "newSubscriber": return handle("newSubscriber", data => `${data.user} subscribed to the stream`)
            case "setCategory": return handle("setCategory", data => `${data.category} is the new category`)
            case "adBreak": return handle("adBreak", data => `Ad playinf for ${data.duration} seconds`)
            case "setEmojiOnly": return handle("setEmojiOnly", data => `Emoji only mode set to ${data.emojiOnly}`)
        }
    }

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data) {
        const prompt = this.getPrompt(event, data);
        this.prompt$.next(prompt);
    }
}