import { FastifyReply, FastifyRequest } from "fastify";

interface LayoutOptions {
    handleErrors: boolean
}

export default function ejsLayout(layout: string, params: (req: FastifyRequest, res: FastifyReply) => Promise<object> = (req, res) => Promise.resolve({}), options: Partial<LayoutOptions> = {}) {
    options = {
        handleErrors: false,
        ...options
    };

    return (req: FastifyRequest, res: FastifyReply, done: any) => {
        const baseRender: any = res.viewAsync;

        res.viewAsync = async function (view: string, options?: any): Promise<string> {
            const body = await baseRender.call(res, view, options);
            if (options.layout === null) {
                return body;
            }
            const render = baseRender.call(res, options.layout ?? layout, {
                body: body,
                ...options,
                ...await params(req, res),
            })
            return render;
        };

        done();
    };
} 