
declare const INVALID_COMPOSABLE_CHAIN: unique symbol;

type Comp = (arg: any) => any;

type IsValidChain<T extends ((arg: never) => any)[]> =
    T extends [infer $First extends Comp, infer $Second extends Comp, ...infer $Rest extends Comp[]]
    ? [ReturnType<$First>] extends [Parameters<$Second>[0]]
    ? IsValidChain<[$Second, ...$Rest]>
    : (T extends [any, ...infer $Rest] ? $Rest["length"] : never)
    : true;

type ReplaceFromBack<T extends unknown[], Offset extends number, Item, $Draft extends unknown[] = []> =
    $Draft["length"] extends Offset
    ? $Draft extends [any, ...infer $After]
    ? [...T, Item, ...$After]
    : never
    : T extends [...infer $Before, infer $Item]
    ? ReplaceFromBack<$Before, Offset, Item, [$Item, ...$Draft]>
    : never;


type ValidatorOptions = {
    throwFailures?: boolean
}

type PartialRecord<T, U> = Partial<Record<keyof T, U>>

type Record<K extends keyof any, T> = {
    [P in K]: T;
};

class data {
    title = "hello";
    num = 10;
    thing() {

    }
}

type t = Record<keyof data, string>;

export type ValidationErrors<T extends ValidationRules<any>> = Partial<{
    //[P in keyof T]: ReturnType<NonNullable<T[P]>> extends NestedResult<any> ? ValidationErrors<NonNullable<T[P]>> : ValidationError;
    [P in keyof T]: ReturnType<NonNullable<T[P]>> extends NestedResult<any> ? ValidationErrors<ValidationRules<ReturnType<NonNullable<T[P]>> extends NestedResult<infer U> ? U : never>> : ValidationError;
    //[P in keyof T]: ValidationError;
}>;

type ValidationResult<T extends ValidationRules<any>> = {
    success: boolean;
    errors: ValidationErrors<T>;
}

type Thing = {
    str: string;
    num: number;
    obj: {
        str: string;
        num: number;
    }
}

export function rule<Composables extends [Comp, ...Comp[]]>(
    ...composables:
        IsValidChain<Composables> extends (infer $Offset extends number)
        ? ReplaceFromBack<Composables, $Offset, "INVALID_COMPOSABLE">
        : Composables
) {
    return (
        firstData: Parameters<Composables[0]>[0]
    ): Composables extends [...any[], infer $Last extends (arg: never) => any]
        ? ReturnType<$Last>
        : never => {
        let data: any = firstData;
        for (const composable of composables) {
            data = (composable as any)(data);
        }
        return data;
    };
}

/*function createRule<T, Composables extends [(v: T) => Result<T>, ...Comp[]]>(
    ...composables:
        IsValidChain<Composables> extends (infer $Offset extends number)
        ? ReplaceFromBack<Composables, $Offset, "INVALID_COMPOSABLE">
        : Composables
) {
    const theRule = rule(...composables);
    return (input: T) => {
        try {
            theRule(input);
        } catch (e) {
            return false;
        }
        return true;
    }
}*/



type Result<T> = {
    success: boolean;
    error?: ValidationError;
}

type NestedResult<T> = {
    success: boolean;
    type: "gerg";
    errors?: {
        [K in keyof T]?: T[K] extends ValidationRules<any> ? NestedResult<T[K]> : Result<T[K]>
    };
}

class ValidationError {
    error: string = ""

    constructor(error: string) {
        this.error = error;
    }
};

/*function composeValidator<T>(fn: (value: T) => Result<T>): (result: Result<T>) => Result<T> {
    return (result: Result<T>): Result<T> => {
        const validationResult = fn(result.value);
        if (result.success) {
            return {
                value: validationResult.value,
                success: true,
            }
        } else {
            return {
                value: validationResult.value,
                success: false,
                errors: [new ValidationError()],
            }

        }
    }
}*/

function min<T extends number>(min: number): (value: T) => Result<T>
function min<T extends string>(min: number): (value: T) => Result<T>
function min<T extends number | string>(min: number): (value: T) => Result<T> {
    return (value: T): Result<T> => {
        if (typeof value == "number" && value < min) {
            return {
                success: false,
                error: new ValidationError("Too low")
            };
        }
        if (typeof value == "string" && value.length < min) {
            return {
                success: false,
                error: new ValidationError("Too short")
            };
        }
        return {
            success: true,
        }
    }
}

function max<T extends number>(max: number): (value: T) => Result<T>
function max<T extends string>(max: number): (value: T) => Result<T>
function max<T extends number | string>(max: number): (value: T) => Result<T> {
    return (value: T) => {
        if (typeof value == "number" && value >= max) {
            return {
                success: false,
                error: new ValidationError("Too high")
            }
        }
        if (typeof value == "string" && value.length >= max) {
            return {
                success: false,
                error: new ValidationError("Too long")
            }
        }
        return {
            success: true,
        }
    }
}

export type ValidationRule<T> = (type: T) => Result<T>

export type ValidationRules<S> = {
    //[T in keyof S]?: ValidationRule<S[T]> | (S[T] extends object ? ValidationRules<S[T]> : never)
    [T in keyof S]?: ValidationRule<S[T]>
}

type ObjectRules<T> = {
    [K in keyof T]?: ValidationRule<T[K]>
}

export const validators = {
    rule<T>(...composables: ((v: T) => Result<T>)[]): (value: T) => Result<T> {
        return (input: T) => {
            let data: T = input;
            for (const composable of composables) {
                const result = composable(data);
                //data = result.value;
                if (result.success)
                    continue;
                return { success: false, error: result.error };
            }
            return { success: true };
        }
    },

    rules<T>(rules: ValidationRules<T>): (value: T) => NestedResult<T> {
        return (input: T): NestedResult<T> => {
            let data: T = input;
            let errors: any = {};//ValidationErrors<ValidationRules<T>> = {};
            for (const rule in rules) {
                if (!rules[rule])
                    continue;
                const result = rules[rule](data[rule]);
                if (result.success)
                    continue;
                errors[rule] = result.error;
                return { type: "gerg", success: false, errors: errors };
            }
            return { type: "gerg", success: true };
        }
    },

    future: function (date: Date): Result<Date> {
        if (date.getTime() < Date.now())
            return { success: false }
        return { success: true };
    },

    past: function (date: Date): Result<Date> {
        if (date.getTime() > Date.now())
            return { success: false };
        return { success: true };
    },

    min: min,
    max: max,

    array: function <T>(rule: ValidationRule<T>): (values: T[]) => Result<T[]> {
        return (values: T[]) => {
            for (let value of values) {
                const result = rule(value);
                if (result.success)
                    continue;
                return { success: false };
            }
            return { success: true };
        };
    },

    /*fromObject: function <T>(rules: ValidationRules<T>): (value: T) => Result<T> {
        return (value: T) => {
            const result = validator.validate(value, rules);
            if (result.success) return { success: true };
            return { success: false, error: new ValidationNestedError(result.errors) };
        };
    }*/
}

export type ValidationRulesInput<S> = {
    [T in keyof S]: ValidationRule<S[T]> | (S[T] extends object ? ValidationRulesInput<S[T]> : never)
}

export type ValidationRulesOutput<S> = {
    [T in keyof S]: S[T]
}

type UnArray<T> = T extends Array<infer U> ? U : T;

export const validator = {
    create: <T>(rules: ValidationRules<T>, options: ValidatorOptions = {}) => {
        const o: Required<ValidatorOptions> = {
            throwFailures: false,
            ...options
        }

        return {
            validate: (input: T) => {
                return validator.validate(input, rules);
            },
        }
    },

    rules: <const T>(rules: ValidationRules<T>, options: ValidatorOptions = {}): ValidationRules<T> => {
        return rules;
    },

    validate: <T, U extends Partial<ValidationRules<T>>>(input: T, rules: U): ValidationResult<U> => {
        const loop = (input: any, rules: any) => {
            const errors: any = {};
            let success = true;
            for (let rule in rules) {
                if (rules[rule]) {
                    const fn = rules[rule];
                    const r = fn(input[rule]);
                    if (!r.success) {
                        success = false;
                        errors[rule] = r.errors;
                    }
                }
            }
            return errors;
        }

        const errors = loop(input, rules);

        return { success: true, errors: errors };
    },
}


