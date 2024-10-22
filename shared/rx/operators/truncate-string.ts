import { Observable } from "rxjs";

export function mapTruncateString<In>(projectLength: (value: In) => number, projectString: (value: In, length: number) => string) {
    return (source: Observable<In>) => {
        return new Observable<string>(subscriber => {
            let length = -1;
            let string: string | null = null;

            return source.subscribe({
                next: value => {
                    const desiredLength = projectLength(value);
                    if (desiredLength != length) {
                        length = desiredLength;
                        const desiredString = projectString(value, length);
                        if (desiredString != string) {
                            string = desiredString;
                            subscriber.next(string);
                        }
                    }
                },
                error: (error) => subscriber.error(error),
                complete: () => subscriber.complete(),
            })
        })
    }
}