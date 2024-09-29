
namespace SocketMessageData {
    export type Woth = {
        counts: Record<string, number>,
        word: string
    }
    export type Webcam = {
        position: readonly [number, number]
    }
}

export default class WebcamModule extends HTMLElement {
    connectedCallback() {
        /*socket.on("webcam").subscribe(cam => {
            const webcam = this.querySelector<HTMLElement>(".webcam");
            webcam.style.setProperty("--left", cam.position[0].toString());
            webcam.style.setProperty("--top", cam.position[1].toString());
        });

        interval(1000).subscribe(() => {
            const date = new Date();
            const hours = date.getHours() % 12;
            const minutes = date.getMinutes().toString().padStart(2, "0");
            const seconds = date.getSeconds().toString().padStart(2, "0");
            this.querySelector(".webcam .time span:first-child").textContent = `${hours}:${minutes}:${seconds}`;
            this.querySelector(".webcam .time span:nth-child(2)").textContent = date.getHours() >= 12 ? "PM" : "AM";
        });

        window.addEventListener('obsSceneChanged', function (event) {
            document.body.dataset.scene = event.detail.name;
        });*/
    }
}