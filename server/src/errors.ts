export class MissingError extends Error {
    status = 404;
    constructor(message?: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class ForbiddenError extends Error {
    status = 403;
    constructor(message?: string) {
        super(message);
        this.name = this.constructor.name;
    }
}