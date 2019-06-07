
export interface CustomDecorators {
    routes: CustomRouteDecorator;
}

export interface CustomRouteDecorator {
    [name: string]: CustomRouteDecoratorOptions;
}

interface CustomRouteDecoratorOptions {
    callback?: (path: string) => string;
}

export const registeredDecorators: CustomDecorators = {
    routes: {},
};
