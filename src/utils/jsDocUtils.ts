import * as ts from 'typescript';

export function getJSDocDescription(node: ts.Node) {
    const jsDocs = (node as any).jsDoc as ts.JSDoc[];
    if (!jsDocs || !jsDocs.length) { return undefined; }

    return jsDocs[0].comment || undefined;
}

export function getJSDocComment(node: ts.Node, tagName: string) {
    const tags = getJSDocTags(node, tag => tag.tagName.text === tagName);
    if (tags.length === 0) {
        return;
    }
    return tags[0].comment;
}

export function getJSDocTagNames(node: ts.Node) {
    let tags: ts.JSDocTag[];
    if (node.kind === ts.SyntaxKind.Parameter) {
        const parameterName = ((node as any).name as ts.Identifier).text;
        tags = getJSDocTags(node.parent as any, tag => {
            return tag.comment !== undefined && tag.comment.startsWith(parameterName);
        });
    } else {
        tags = getJSDocTags(node as any, tag => {
            return tag.comment !== undefined;
        });
    }
    return tags.map(tag => {
        return tag.tagName.text;
    });
}

export function getJSDocTags(node: ts.Node, isMatching: (tag: ts.JSDocTag) => boolean) {
    const jsDocs = (node as any).jsDoc as ts.JSDoc[];
    if (!jsDocs || jsDocs.length === 0) { return []; }

    const jsDoc = jsDocs[0];
    if (!jsDoc.tags) { return []; }

    return jsDoc.tags.filter(isMatching);
}

export function isExistJSDocTag(node: ts.Node, isMatching: (tag: ts.JSDocTag) => boolean) {
    const tags = getJSDocTags(node, isMatching);
    if (tags.length === 0) { return false; }
    return true;
}
