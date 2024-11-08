import { bgGreen, bold, inverse } from "kolorist";

const borders = {
    double: ["╔", "╗", "╚", "╝", "═", "║"],
    light: ["┌", "┐", "└", "┘", "─", "│"],
}

function pad(text: string, length: number) {
    const len = text.replace(/[^a-zA-Z0-9 \*\.]+/gi, "").length;
    console.log(len);
    console.log(text.length);
    return text + " ".repeat(length - len);
}

function margin(text: string, size = 1) {
    return " ".repeat(size) + text + " ".repeat(size);
}

function borderedBox(text: (length: number) => string, border: string[]) {
    console.log(border[0] + border[4].repeat(process.stdout.columns - 2) + border[1]);
    console.log(border[5] + " " + text(process.stdout.columns - 4) + " " + border[5]);
    console.log(border[2] + border[4].repeat(process.stdout.columns - 2) + border[3]);
}

function header(text: string) {
    borderedBox(length => bold(inverse(margin("*")) + margin(text).padEnd(length - 3, " ")), borders.light)
}

function success(text: string) {
    borderedBox(length => bgGreen(bold(margin(text).padEnd(length, " "))), borders.light);
}

function subHeader(text: string) {
    console.log(borders.double[4].repeat(2) + inverse(bold(margin(text))) + borders.double[4].repeat(process.stdout.columns - text.length - 4));
}

function subFooter(text: string) {
    console.log(borders.double[0] + "═".repeat(process.stdout.columns - text.length - 2) + borders.double[1]);
}

export const cli = {
    header,
    subHeader,
    success,
    borderedBox,
    margin
}