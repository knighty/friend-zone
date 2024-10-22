export function objectMap<T extends Record<string, any>, V>(obj: T, project: (value: any, key: keyof T) => V) {
    const newObject: any = {};
    for (let prop in obj) {
        newObject[prop] = project(obj[prop], prop);
    }
    return newObject as Record<string, V>;
}

export function objectMapArray<T extends Record<string, any>, V>(obj: T, project: (value: any, key: keyof T) => V) {
    const a: V[] = [];
    for (let prop in obj) {
        a.push(project(obj[prop], prop));
    }
    return a as V[];
}