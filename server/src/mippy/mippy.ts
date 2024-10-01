import { concatMap, EMPTY, map, Observable, share } from "rxjs";
import { logger } from 'shared/logger';
import { MippyConfig } from "../config";
import { synthesizeVoice } from '../data/text-to-speech';
import { MippyBrain, MippyMessage, MippyPrompts } from "./mippy-brain";

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
    message: MippyMessage
}

export class Mippy {
    enabled: boolean;
    brain: MippyBrain;
    messages$: Observable<MippyStreamEvent>;

    constructor(brain: MippyBrain, config: MippyConfig) {
        this.brain = brain;
        log.info("Created Mippy");
        if (this.brain) {
            this.brain.receive().subscribe();
        }
        this.messages$ = this.brain.receive().pipe(
            concatMap(
                message => synthesizeVoice(message.text).pipe(
                    map(result => ({
                        audio: result,
                        message: message
                    }))
                )
            ),
            share()
        );
        this.enabled = config.enabled;
    }

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data) {
        if (this.enabled)
            this.brain.ask(event, data);
    }

    listen() {
        return this.enabled ? this.messages$ : EMPTY;
    }
}