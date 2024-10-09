import { fromEvent } from "rxjs";
import FeedContainer from "./modules/feeds/container";
import FeedsModule from "./modules/feeds/feeds";
import { FriendElement } from "./modules/friends/friend";
import FriendsModule from "./modules/friends/friends";
import { SubtitlesElement } from "./modules/friends/subtitles";
import { FrequencyGraph } from "./modules/mippy/frequency-graph";
import { MippyModule } from "./modules/mippy/mippy";
import WebcamModule from "./modules/webcam";
import WordOfTheHourModule from "./modules/word-of-the-hour";
import { socket } from "./socket";

socket.isConnected$.subscribe(isConnected => document.body.classList.toggle("connected", isConnected));

class App extends HTMLElement {
    connectedCallback() {
        const button = this.querySelector("button");
        if (button) {
            fromEvent(button, "click").subscribe(() => {
                const video = document.getElementById('video') as HTMLVideoElement;
                button.remove();
                if (video) {
                    navigator.mediaDevices
                        .getUserMedia({ video: true, audio: false })
                        .then((stream) => {
                            video.srcObject = stream;
                            video.play();
                        })
                        .catch((err) => {
                            console.error(`An error occurred: ${err}`);
                        });
                }
            });
        }
    }
}

customElements.define("x-app", App);
customElements.define("feed-container", FeedContainer);
customElements.define("x-feed", FeedsModule);
customElements.define("x-webcam", WebcamModule);
customElements.define("x-friend", FriendElement);
customElements.define("friends-module", FriendsModule);
customElements.define("x-subtitles", SubtitlesElement);
customElements.define("word-of-the-hour-module", WordOfTheHourModule);
customElements.define("frequency-graph", FrequencyGraph);
customElements.define("mippy-module", MippyModule);