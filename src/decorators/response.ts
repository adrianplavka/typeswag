export function SuccessResponse(name: string | number, description?: string): MethodDecorator {
    return () => { return; };
}

export function Response<T>(name: string | number, description?: string, example?: T): MethodDecorator {
    return () => { return; };
}
