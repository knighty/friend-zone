export function awaitResult<T, E extends new (args: any) => Error>(
    promise: Promise<T>,
    errors?: E[]
): Promise<[undefined, T] | [InstanceType<E>]> {
    return promise.then(data => {
        return [undefined, data] as [undefined, T]
    }).catch(error => {
        if (errors == undefined) {
            return [error];
        }
        if (errors.some(e => error instanceof e)) {
            return [error];
        }

        throw error;
    })
}