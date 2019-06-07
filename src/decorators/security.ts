/**
 * @param {name} security name from securityDefinitions
 */
export function Security(name: string | { [name: string]: string[] }, scopes?: string[]): ClassDecorator & MethodDecorator {
    return () => { return; };
}
