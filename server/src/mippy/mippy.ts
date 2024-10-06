import { concatMap, EMPTY, map, merge, Observable, share, Subject } from "rxjs";
import { logger } from 'shared/logger';
import { MippyConfig } from "../config";
import { synthesizeVoice } from '../data/text-to-speech';
import { MippyBrain, MippyPrompts } from "./mippy-brain";

const log = logger("mippy");

type Subtitle = {
    subtitleId: number;
    userId: string;
    text: string;
}

type MippyVoiceSynthesizer = {
    synthesize(text: string): Observable<any>
}

export type MippyStreamEvent = {
    audio: {
        filename: string,
        duration: number
    },
    message: {
        text: string
    }
}

export class Mippy {
    enabled: boolean;
    brain: MippyBrain;
    messages$: Observable<MippyStreamEvent>;
    manualMessage$ = new Subject<{ text: string }>();

    constructor(brain: MippyBrain, config: MippyConfig) {
        this.brain = brain;
        log.info("Created Mippy");
        if (this.brain) {
            this.brain.receive().subscribe();
            const brainMessage$ = this.brain.receive().pipe(
                map(message => ({ text: message.text }))
            )
            this.messages$ = merge(brainMessage$, this.manualMessage$).pipe(
                concatMap(
                    message => synthesizeVoice(message.text).pipe(
                        map(result => ({
                            audio: result,
                            message
                        }))
                    )
                ),
                share()
            );
        }
        this.enabled = config.enabled;
    }

    say(text: string) {
        this.manualMessage$.next({ text });
    }

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, source: string = "") {
        if (this.enabled)
            this.brain.ask(event, data, source);
    }

    listen() {
        return this.enabled ? this.messages$ : EMPTY;
    }
}