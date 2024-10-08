
import child_process from "node:child_process";
import path from "node:path";

console.log(path.join(__dirname, "../../tts/piper/en_US-hfc_female-medium.onnx"));
const piper = child_process.spawn("piper", [
    `--model`, `${path.join(__dirname, "../../tts/piper/en_US-hfc_female-medium.onnx")}`,
    `--output-raw`,
    `--debug`
], {
    cwd: path.join(__dirname, "../../tts/piper"),
});
piper.stdout.addListener("data", data => {
    console.log(data);
})
piper.stdin.write("Hello World");
piper.stdin.end();