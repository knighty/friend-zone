import { concatMap, EMPTY, filter, ignoreElements, merge, Observable, of, share, Subject, tap } from "rxjs";
import { logger } from 'shared/logger';
import { MippyConfig } from "../config";
import { streamSynthesizeVoice } from '../data/text-to-speech';
import { StreamingTTS } from "../plugins/audio-socket";
import { MippyBrain, MippyPrompts, Prompt } from "./mippy-brain";

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
    audio: number,
    message: {
        text: string
    }
}

export class Mippy {
    enabled: boolean;
    brain: MippyBrain;
    messages$: Observable<MippyStreamEvent>;
    manualMessage$ = new Subject<{ text: string }>();
    audioId = 0;

    constructor(brain: MippyBrain, config: MippyConfig, tts: StreamingTTS) {
        this.brain = brain;
        let i = 0;
        log.info("Created Mippy");
        this.brain.receive().subscribe();
        const brainMessage$ = this.brain.receive();
        this.messages$ = merge(brainMessage$, this.manualMessage$).pipe(
            filter(message => message.text != ""),
            concatMap(
                message => {
                    const stream = tts.create();
                    return merge(
                        streamSynthesizeVoice(message.text).pipe(
                            tap({
                                next: (value) => {
                                    stream.append(value)
                                },
                                complete: () => {
                                    stream.complete()
                                },
                            }),
                            ignoreElements(),
                        ),
                        of({
                            audio: stream.id,
                            message
                        })
                    )
                }
            ),
            share()
        );
        this.enabled = config.enabled;
    }

    say(text: string) {
        this.manualMessage$.next({ text });
    }

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, prompt: Omit<Prompt, "text"> = {}) {
        if (this.enabled)
            this.brain.ask(event, data, {
                ...prompt,
            });
    }

    listen() {
        return this.enabled ? this.messages$ : EMPTY;
    }
}