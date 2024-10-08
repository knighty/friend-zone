export abstract class AudioEffectNode<T extends Record<string, AudioNode>> {
    nodes: T;
    abstract connect(source: AudioNode, destination: AudioNode): void;
}

export class ReverbEffectNode extends AudioEffectNode<{
    inputGain: GainNode,
    reverbGain: GainNode,
    reverb: ConvolverNode
}> {
    audioCtx: AudioContext;

    constructor(audioCtx: AudioContext) {
        super();
        this.audioCtx = audioCtx;
        this.nodes = {
            reverb: audioCtx.createConvolver(),
            inputGain: audioCtx.createGain(),
            reverbGain: audioCtx.createGain(),
        }
    }

    setDryWetRatio(ratio: number) {
        this.nodes.reverbGain.gain.value = ratio;
        this.nodes.inputGain.gain.value = 1 - ratio;
    }

    async setImpulse(url: string) {
        const response = await fetch(url);
        const arraybuffer = await response.arrayBuffer();
        this.nodes.reverb.buffer = await this.audioCtx.decodeAudioData(arraybuffer);
    }

    connect(source: AudioNode, destination: AudioNode): void {
        source.connect(this.nodes.inputGain);
        source.connect(this.nodes.reverb);
        this.nodes.reverb.connect(this.nodes.reverbGain);

        this.nodes.inputGain.connect(destination);
        this.nodes.reverbGain.connect(destination);
    }
}

export class LowPassNode extends AudioEffectNode<{
    filter: BiquadFilterNode,
}> {
    audioCtx: AudioContext;

    constructor(audioCtx: AudioContext) {
        super();
        this.audioCtx = audioCtx;
        this.nodes = {
            filter: audioCtx.createBiquadFilter()
        }
    }

    connect(source: AudioNode, destination: AudioNode): void {
        this.nodes.filter.type = "lowpass";
        this.nodes.filter.frequency.value = 4000;
        this.nodes.filter.gain.value = 0.3;
        source.connect(this.nodes.filter);
        this.nodes.filter.connect(destination);
    }
}

export class AudioNodeCollection {
    nodes: AudioEffectNode<any>[] = [];
    audioCtx: AudioContext;

    constructor(audioCtx: AudioContext) {
        this.audioCtx = audioCtx;
    }

    addNode(node: AudioEffectNode<any>) {
        this.nodes.push(node);
    }

    connect(source: AudioNode, destination: AudioNode) {
        let next: AudioNode = source;
        let previous: AudioNode = source;
        for (let node of this.nodes) {
            if (!node)
                continue;
            next = this.audioCtx.createGain();
            node.connect(previous, next);
            previous = next;
        }
        next.connect(destination);
    }
}