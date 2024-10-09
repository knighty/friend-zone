import { filter, map, scan, tap } from "rxjs";
import { CustomElement } from "shared/html/custom-element";

export class FrequencyGraph extends CustomElement<{
    Data: {
        frequencies: Float32Array
    },
    Elements: {}
}> {
    setup() {
        this.innerHTML = `<canvas class="" width="128" height="80"></canvas>`
    }

    connect() {
        const canvas = this.querySelector<HTMLCanvasElement>("canvas");
        const canvasContext = canvas.getContext("2d");
        const grad = canvasContext.createLinearGradient(0, 0, 100, 0);
        grad.addColorStop(0, "#c829f1");
        grad.addColorStop(1, "#45f1f0");
        this.registerHandler("frequencies").pipe(
            map(data => data.subarray(0, data.length / 2)),
            scan((bins: Float32Array, frequencies) => {
                const numBins = bins.length;
                const fftSize = frequencies.length;
                bins.fill(0);
                frequencies.forEach((value, index) => {
                    const normalizedValue = Math.pow((value + 256) / 256, 1.8);
                    bins[Math.floor((index / fftSize) * numBins)] = normalizedValue;
                })
                return bins;
            }, new Float32Array(16)),
            filter(bins => bins.some(v => v != 0)),
            tap(bins => {
                canvasContext.clearRect(0, 0, canvas.width, canvas.height);
                canvasContext.fillStyle = grad;
                canvasContext.beginPath();
                for (let i = 0; i < bins.length; i++) {
                    canvasContext.roundRect(i / bins.length * canvas.width, canvas.height / 2 - bins[i] * canvas.height / 2, canvas.width / bins.length - 1, bins[i] * canvas.height, 4);
                }
                canvasContext.fill();
            })
        ).subscribe();
    }
}