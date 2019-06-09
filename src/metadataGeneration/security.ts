import * as ts from 'typescript';
import { getInitializerValue } from './initializerValue';
import { Typeswag } from './typeswag';

export function getSecurities(decorators: ts.Identifier[]): Typeswag.Security[] {
    const securities: Typeswag.Security[] = [];
    for (const sec of decorators) {
        const expression = sec.parent as ts.CallExpression;
        const security: Typeswag.Security = {};

        if (expression.arguments[0].kind === ts.SyntaxKind.StringLiteral) {
            const name = (expression.arguments[0] as any).text;
            security[name] = expression.arguments[1] ? (expression.arguments[1] as any).elements.map((e: any) => e.text) : [];
        } else {
            const properties = (expression.arguments[0] as any).properties;

            for (const property of properties) {
                const name = property.name.text;
                const scopes = getInitializerValue(property.initializer);
                security[name] = scopes;
            }
        }

        securities.push(security);
    }

    return securities;
}
