type CharacterSet = "Lowercase" | "Uppercase" | "Numbers" | "Symbols" | "Hex" | "Ascii" | "Alphanumeric";

function getCharacters(set: CharacterSet) {
    switch (set) {
        case "Hex": return "0123456789abcdef";
        case "Alphanumeric": return "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        case "Lowercase": return "abcdefghijklmnopqrstuvwxyz";
        case "Uppercase": return "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        case "Numbers": return "0123456789";
        case "Ascii": return "#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
        case "Symbols": return "#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~";
    }
    return "";
}

function* randomCharacters(characters: string, length: number) {
    for (let i = 0; i < length; i++) {
        yield characters.charAt(Math.floor(Math.random() * characters.length));
    }
}

export function randomString(length: number, charSets: CharacterSet[] | CharacterSet = "Alphanumeric") {
    const characters = Array.isArray(charSets) ? charSets.map(getCharacters).join("") : charSets;
    return Array.from(randomCharacters(characters, length)).join("");
}