import * as ts from 'typescript';
import { getJSDocComment, getJSDocTagNames, isExistJSDocTag } from '../utils/jsDocUtils';
import { getPropertyValidators } from '../utils/validatorUtils';
import { GenerateMetadataError } from './exceptions';
import { getInitializerValue } from './initializerValue';
import { MetadataGenerator } from './metadataGenerator';
import { Typeswag } from './typeswag';

const syntaxKindMap: { [kind: number]: string } = {};
syntaxKindMap[ts.SyntaxKind.NumberKeyword] = 'number';
syntaxKindMap[ts.SyntaxKind.StringKeyword] = 'string';
syntaxKindMap[ts.SyntaxKind.BooleanKeyword] = 'boolean';
syntaxKindMap[ts.SyntaxKind.VoidKeyword] = 'void';

const localReferenceTypeCache: { [typeName: string]: Typeswag.ReferenceType } = {};
const inProgressTypes: { [typeName: string]: boolean } = {};

type UsableDeclaration = ts.InterfaceDeclaration
    | ts.ClassDeclaration
    | ts.TypeAliasDeclaration;

export class TypeResolver {
    constructor(
        private readonly typeNode: ts.TypeNode,
        private readonly current: MetadataGenerator,
        private readonly parentNode?: ts.Node,
        private readonly extractEnum = true,
    ) { }

    public resolve(): Typeswag.Type {
        const primitiveType = this.getPrimitiveType(this.typeNode, this.parentNode);
        if (primitiveType) {
            return primitiveType;
        }

        if (this.typeNode.kind === ts.SyntaxKind.ArrayType) {
            return {
                dataType: 'array',
                elementType: new TypeResolver((this.typeNode as ts.ArrayTypeNode).elementType, this.current).resolve(),
            } as Typeswag.ArrayType;
        }

        if (this.typeNode.kind === ts.SyntaxKind.UnionType) {
            const unionType = this.typeNode as ts.UnionTypeNode;
            const supportType = unionType.types.every((type) => type.kind === ts.SyntaxKind.LiteralType);

            if (supportType) {
                let valueType = 'string';
                const enums = unionType.types.map((type) => {
                    const literalType = (type as ts.LiteralTypeNode).literal;
                    switch (literalType.kind) {
                        case ts.SyntaxKind.TrueKeyword:
                            valueType = 'boolean';
                            return 'true';
                        case ts.SyntaxKind.FalseKeyword:
                            valueType = 'boolean';
                            return 'false';
                        case ts.SyntaxKind.NumericLiteral:
                            valueType = 'number';
                            return Number((type as any).literal.text);
                        default:
                            return String((literalType as any).text);
                    }
                });

                const areTypesEqual = enums.every(enumValue => typeof enumValue === typeof enums[0]);
                if (!areTypesEqual) {
                    throw new Error(`All values from ${this.typeNode.getText()} in union must match in type!`);
                }

                return {
                    dataType: 'enum',
                    enums,
                    valueType,
                } as Typeswag.EnumerateType;
            } else {
                return {
                    dataType: 'object',
                } as Typeswag.Type;
            }
        }

        if (this.typeNode.kind === ts.SyntaxKind.LiteralType) {
            const literalType = this.typeNode as ts.LiteralTypeNode;
            const literal = literalType.literal as ts.LiteralExpression;

            switch (literal.kind) {
                case ts.SyntaxKind.TrueKeyword:
                    return {
                        dataType: 'enum',
                        enums: ['true'],
                        valueType: 'boolean',
                    } as Typeswag.EnumerateType;
                case ts.SyntaxKind.FalseKeyword:
                    return {
                        dataType: 'enum',
                        enums: ['false'],
                        valueType: 'boolean',
                    } as Typeswag.EnumerateType;
                case ts.SyntaxKind.NumericLiteral:
                    return {
                        dataType: 'enum',
                        enums: [Number(literal.text)],
                        valueType: 'number',
                    } as Typeswag.EnumerateType;
                default:
                    return {
                        dataType: 'enum',
                        enums: [literal.text],
                    } as Typeswag.EnumerateType;
            }
        }

        if (this.typeNode.kind === ts.SyntaxKind.ObjectKeyword) {
            return { dataType: 'object' } as Typeswag.Type;
        }

        if ([ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.TypeLiteral, ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.NeverKeyword].some(kind => kind === this.typeNode.kind)) {
            return { dataType: 'any' } as Typeswag.Type;
        }

        if (this.typeNode.kind !== ts.SyntaxKind.TypeReference) {
            throw new GenerateMetadataError(`Unknown type: ${ts.SyntaxKind[this.typeNode.kind]}`);
        }

        const typeReference = this.typeNode as ts.TypeReferenceNode;
        if (typeReference.typeName.kind === ts.SyntaxKind.Identifier) {
            if (typeReference.typeName.text === 'Date') {
                return this.getDateType(this.parentNode);
            }

            if (typeReference.typeName.text === 'Buffer') {
                return { dataType: 'buffer' } as Typeswag.Type;
            }

            if (typeReference.typeName.text === 'ReadableStream') {
                return { dataType: 'stream' } as Typeswag.Type;
            }

            if (typeReference.typeName.text === 'Array' && typeReference.typeArguments && typeReference.typeArguments.length === 1) {
                return {
                    dataType: 'array',
                    elementType: new TypeResolver(typeReference.typeArguments[0], this.current).resolve(),
                } as Typeswag.ArrayType;
            }

            if (typeReference.typeName.text === 'Promise' && typeReference.typeArguments && typeReference.typeArguments.length === 1) {
                return new TypeResolver(typeReference.typeArguments[0], this.current).resolve();
            }

            if (typeReference.typeName.text === 'Partial' && typeReference.typeArguments && typeReference.typeArguments.length === 1) {
                const partialType = Object.assign({}, new TypeResolver(typeReference.typeArguments[0], this.current).resolve() as Typeswag.ReferenceType);
                if (partialType.properties) {
                    partialType.properties = partialType.properties.map(p => Object.assign({}, p));
                    for (const property of partialType.properties) {
                        property.required = false;
                    }
                }
                partialType.refName = `Partial${partialType.refName}`;
                this.current.AddReferenceType(partialType);
                return partialType;
            }

            if (typeReference.typeName.text === 'String') {
                return { dataType: 'string' } as Typeswag.Type;
            }
        }

        if (!this.extractEnum) {
            const enumType = this.getEnumerateType(typeReference.typeName, this.extractEnum);
            if (enumType) { return enumType; }
        }

        const literalType = this.getLiteralType(typeReference.typeName);
        if (literalType) { return literalType; }

        let referenceType: Typeswag.ReferenceType;
        if (typeReference.typeArguments && typeReference.typeArguments.length === 1) {
            const typeT: ts.NodeArray<ts.TypeNode> = typeReference.typeArguments as ts.NodeArray<ts.TypeNode>;
            referenceType = this.getReferenceType(typeReference.typeName as ts.EntityName, this.extractEnum, typeT);
        } else {
            referenceType = this.getReferenceType(typeReference.typeName as ts.EntityName, this.extractEnum);
        }

        this.current.AddReferenceType(referenceType);
        return referenceType;
    }

    private getPrimitiveType(typeNode: ts.TypeNode, parentNode?: ts.Node): Typeswag.Type | undefined {
        const primitiveType = syntaxKindMap[typeNode.kind];
        if (!primitiveType) { return; }

        if (primitiveType === 'number') {
            if (!parentNode) {
                return { dataType: 'double' };
            }

            const tags = getJSDocTagNames(parentNode).filter((name) => {
                return ['isInt', 'isLong', 'isFloat', 'isDouble'].some((m) => m === name);
            });
            if (tags.length === 0) {
                return { dataType: 'double' };
            }

            switch (tags[0]) {
                case 'isInt':
                    return { dataType: 'integer' };
                case 'isLong':
                    return { dataType: 'long' };
                case 'isFloat':
                    return { dataType: 'float' };
                case 'isDouble':
                    return { dataType: 'double' };
                default:
                    return { dataType: 'double' };
            }
        }
        return { dataType: primitiveType } as Typeswag.Type;
    }

    private getDateType(parentNode?: ts.Node): Typeswag.Type {
        if (!parentNode) {
            return { dataType: 'datetime' };
        }
        const tags = getJSDocTagNames(parentNode).filter((name) => {
            return ['isDate', 'isDateTime'].some((m) => m === name);
        });

        if (tags.length === 0) {
            return { dataType: 'datetime' };
        }
        switch (tags[0]) {
            case 'isDate':
                return { dataType: 'date' };
            case 'isDateTime':
                return { dataType: 'datetime' };
            default:
                return { dataType: 'datetime' };
        }
    }

    private getEnumerateType(typeName: ts.EntityName, extractEnum = true): Typeswag.Type | undefined {
        const enumName = (typeName as ts.Identifier).text;
        const enumNodes = this.current.nodes
            .filter((node) => node.kind === ts.SyntaxKind.EnumDeclaration)
            .filter((node) => (node as any).name.text === enumName);

        if (!enumNodes.length) { return; }
        if (enumNodes.length > 1) {
            throw new GenerateMetadataError(`Multiple matching enum found for enum ${enumName}; please make enum names unique.`);
        }

        const enumDeclaration = enumNodes[0] as ts.EnumDeclaration;

        function getEnumValue(member: any) {
            const initializer = member.initializer;
            if (initializer) {
                if (initializer.expression) {
                    return initializer.expression.text;
                }
                return initializer.text;
            }
            // No initializer value has been found, we should fallback to number indeces.
            return;
        }

        function getEnumValueType(member: any): 'string' | 'number' {
            const initializer = member.initializer;
            if (initializer) {
                switch (initializer.kind) {
                    case ts.SyntaxKind.StringLiteral:
                        return 'string';
                    case ts.SyntaxKind.NumericLiteral:
                        return 'number';
                    default:
                        return 'string';
                }
            }
            // Default value for enums, that are without initializing value.
            return 'number';
        }

        if (extractEnum) {
            // We make an assumption about the type of enum from the first member.
            const valueType = getEnumValueType((enumDeclaration.members[0]));

            const enums = enumDeclaration.members.map((member, index) => {
                const value = getEnumValue(member) || index;
                switch (valueType) {
                    case 'number':
                        return Number(value);
                    default:
                        return value;
                }
            });
            return {
                dataType: 'refEnum',
                description: this.getNodeDescription(enumDeclaration),
                enums,
                refName: enumName,
                valueType,
            } as Typeswag.ReferenceType;
        } else {
            return {
                dataType: 'enum',
                enums: enumDeclaration.members.map((member: any, index) => {
                    return getEnumValue(member) || String(index);
                }),
            } as Typeswag.EnumerateType;
        }
    }

    private getLiteralType(typeName: ts.EntityName): Typeswag.EnumerateType | undefined {
        const literalName = (typeName as ts.Identifier).text;
        const literalTypes = this.current.nodes
            .filter((node) => node.kind === ts.SyntaxKind.TypeAliasDeclaration)
            .filter((node) => {
                const innerType = (node as any).type;
                return innerType.kind === ts.SyntaxKind.UnionType && (innerType as any).types;
            })
            .filter((node) => (node as any).name.text === literalName);

        if (!literalTypes.length) { return; }
        if (literalTypes.length > 1) {
            throw new GenerateMetadataError(`Multiple matching enum found for enum ${literalName}; please make enum names unique.`);
        }

        const unionTypes = (literalTypes[0] as any).type.types;
        return {
            dataType: 'enum',
            enums: unionTypes.map((unionNode: any) => unionNode.literal.text as string),
        } as Typeswag.EnumerateType;
    }

    private getReferenceType(type: ts.EntityName, extractEnum = true, genericTypes?: ts.NodeArray<ts.TypeNode>): Typeswag.ReferenceType {
        const typeName = this.resolveFqTypeName(type);
        const refNameWithGenerics = this.getTypeName(typeName, genericTypes);

        try {
            const existingType = localReferenceTypeCache[refNameWithGenerics];
            if (existingType) {
                return existingType;
            }

            const referenceEnumType = this.getEnumerateType(type, true) as Typeswag.ReferenceType;
            if (referenceEnumType) {
                localReferenceTypeCache[refNameWithGenerics] = referenceEnumType;
                return referenceEnumType;
            }

            if (inProgressTypes[refNameWithGenerics]) {
                return this.createCircularDependencyResolver(refNameWithGenerics);
            }

            inProgressTypes[refNameWithGenerics] = true;

            const modelType = this.getModelTypeDeclaration(type);
            const properties = this.getModelProperties(modelType, genericTypes);
            const additionalProperties = this.getModelAdditionalProperties(modelType);
            const inheritedProperties = this.getModelInheritedProperties(modelType) || [];
            const example = this.getNodeExample(modelType);

            const referenceType = {
                additionalProperties,
                dataType: 'refObject',
                description: this.getNodeDescription(modelType),
                properties: inheritedProperties,
                refName: refNameWithGenerics,
            } as Typeswag.ReferenceType;

            referenceType.properties = (referenceType.properties as Typeswag.Property[]).concat(properties);
            localReferenceTypeCache[refNameWithGenerics] = referenceType;

            if (example) {
                referenceType.example = example;
            }
            return referenceType;
        } catch (err) {
            // tslint:disable-next-line:no-console
            console.error(`There was a problem resolving type of '${this.getTypeName(typeName, genericTypes)}'.`);
            throw err;
        }
    }

    private resolveFqTypeName(type: ts.EntityName): string {
        if (type.kind === ts.SyntaxKind.Identifier) {
            return (type as ts.Identifier).text;
        }

        const qualifiedType = type as ts.QualifiedName;
        return this.resolveFqTypeName(qualifiedType.left) + '.' + (qualifiedType.right as ts.Identifier).text;
    }

    private getTypeName(typeName: string, genericTypes?: ts.NodeArray<ts.TypeNode>): string {
        if (!genericTypes || !genericTypes.length) { return typeName; }
        return typeName + genericTypes.map((t) => this.getAnyTypeName(t)).join('');
    }

    private getAnyTypeName(typeNode: ts.TypeNode): string {
        const primitiveType = syntaxKindMap[typeNode.kind];
        if (primitiveType) {
            return primitiveType;
        }

        if (typeNode.kind === ts.SyntaxKind.ArrayType) {
            const arrayType = typeNode as ts.ArrayTypeNode;
            return this.getAnyTypeName(arrayType.elementType) + '[]';
        }

        if (typeNode.kind === ts.SyntaxKind.UnionType) {
            return 'object';
        }

        if (typeNode.kind !== ts.SyntaxKind.TypeReference) {
            throw new GenerateMetadataError(`Unknown type: ${ts.SyntaxKind[typeNode.kind]}.`);
        }

        const typeReference = typeNode as ts.TypeReferenceNode;
        try {
            return (typeReference.typeName as ts.Identifier).text;
        } catch (e) {
            // idk what would hit this? probably needs more testing
            // tslint:disable-next-line:no-console
            console.error(e);
            return typeNode.toString();
        }

    }

    private createCircularDependencyResolver(refName: string) {
        const referenceType = {
            dataType: 'refObject',
            refName,
        } as Typeswag.ReferenceType;

        this.current.OnFinish((referenceTypes) => {
            const realReferenceType = referenceTypes[refName];
            if (!realReferenceType) { return; }
            referenceType.description = realReferenceType.description;
            referenceType.properties = realReferenceType.properties;
            referenceType.dataType = realReferenceType.dataType;
            referenceType.refName = referenceType.refName;
        });

        return referenceType;
    }

    private nodeIsUsable(node: ts.Node) {
        switch (node.kind) {
            case ts.SyntaxKind.InterfaceDeclaration:
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.TypeAliasDeclaration:
            case ts.SyntaxKind.EnumDeclaration:
                return true;
            default: return false;
        }
    }

    private resolveLeftmostIdentifier(type: ts.EntityName): ts.Identifier {
        while (type.kind !== ts.SyntaxKind.Identifier) {
            type = (type as ts.QualifiedName).left;
        }
        return type as ts.Identifier;
    }

    private resolveModelTypeScope(leftmost: ts.EntityName, statements: any): any[] {
        while (leftmost.parent && leftmost.parent.kind === ts.SyntaxKind.QualifiedName) {
            const leftmostName = leftmost.kind === ts.SyntaxKind.Identifier
                ? (leftmost as ts.Identifier).text
                : (leftmost as ts.QualifiedName).right.text;
            const moduleDeclarations = statements
                .filter((node) => {
                    if (node.kind !== ts.SyntaxKind.ModuleDeclaration || !this.current.IsExportedNode(node)) {
                        return false;
                    }

                    const moduleDeclaration = node as ts.ModuleDeclaration;
                    return (moduleDeclaration.name as ts.Identifier).text.toLowerCase() === leftmostName.toLowerCase();
                }) as ts.ModuleDeclaration[];

            if (!moduleDeclarations.length) {
                throw new GenerateMetadataError(`No matching module declarations found for ${leftmostName}.`);
            }
            if (moduleDeclarations.length > 1) {
                throw new GenerateMetadataError(`Multiple matching module declarations found for ${leftmostName}; please make module declarations unique.`);
            }

            const moduleBlock = moduleDeclarations[0].body as ts.ModuleBlock;
            if (moduleBlock === null || moduleBlock.kind !== ts.SyntaxKind.ModuleBlock) {
                throw new GenerateMetadataError(`Module declaration found for ${leftmostName} has no body.`);
            }

            statements = moduleBlock.statements;
            leftmost = leftmost.parent as ts.EntityName;
        }

        return statements;
    }

    private getModelTypeDeclaration(type: ts.EntityName) {
        const leftmostIdentifier = this.resolveLeftmostIdentifier(type);
        const statements: any[] = this.resolveModelTypeScope(leftmostIdentifier, this.current.nodes);

        const typeName = type.kind === ts.SyntaxKind.Identifier
            ? (type as ts.Identifier).text
            : (type as ts.QualifiedName).right.text;

        let modelTypes = statements
            .filter((node) => {
                if (!this.nodeIsUsable(node) || !this.current.IsExportedNode(node)) {
                    return false;
                }

                const modelTypeDeclaration = node as UsableDeclaration;
                return (modelTypeDeclaration.name as ts.Identifier).text === typeName;
            }) as UsableDeclaration[];

        if (!modelTypes.length) {
            throw new GenerateMetadataError(`No matching model found for referenced type ${typeName}.`);
        }

        if (modelTypes.length > 1) {
            // remove types that are from typescript e.g. 'Account'
            modelTypes = modelTypes.filter((modelType) => {
                if (modelType.getSourceFile().fileName.replace(/\\/g, '/').toLowerCase().indexOf('node_modules/typescript') > -1) {
                    return false;
                }

                return true;
            });

            /**
             * Model is marked with '@typeswagModel', indicating that it should be the 'canonical' model used
             */
            const designatedModels = modelTypes.filter(modelType => {
                const isDesignatedModel = isExistJSDocTag(modelType, tag => tag.tagName.text === 'typeswagModel');
                return isDesignatedModel;
            });

            if (designatedModels.length > 0) {
                if (designatedModels.length > 1) {
                    throw new GenerateMetadataError(`Multiple models for ${typeName} marked with '@typeswagModel'; '@typeswagModel' should only be applied to one model.`);
                }

                modelTypes = designatedModels;
            }
        }
        if (modelTypes.length > 1) {
            const conflicts = modelTypes.map(modelType => modelType.getSourceFile().fileName).join('"; "');
            throw new GenerateMetadataError(`Multiple matching models found for referenced type ${typeName}; please make model names unique. Conflicts found: "${conflicts}".`);
        }

        return modelTypes[0];
    }

    private getModelProperties(node: UsableDeclaration, genericTypes?: ts.NodeArray<ts.TypeNode>): Typeswag.Property[] {
        const isIgnored = (e: ts.TypeElement | ts.ClassElement) => {
            const ignore = isExistJSDocTag(e, tag => tag.tagName.text === 'ignore');
            return ignore;
        };

        // Interface model
        if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
            const interfaceDeclaration = node as ts.InterfaceDeclaration;
            return interfaceDeclaration.members
                .filter(member => {
                    const ignore = isIgnored(member);
                    return !ignore && member.kind === ts.SyntaxKind.PropertySignature;
                })
                .map((member: any) => {
                    const propertyDeclaration = member as ts.PropertyDeclaration;
                    const identifier = propertyDeclaration.name as ts.Identifier;

                    if (!propertyDeclaration.type) {
                        throw new GenerateMetadataError(`No valid type found for property declaration.`);
                    }

                    // Declare a variable that can be overridden if needed
                    let aType = propertyDeclaration.type;

                    // aType.kind will always be a TypeReference when the property of Interface<T> is of type T
                    if (aType.kind === ts.SyntaxKind.TypeReference && genericTypes && genericTypes.length && node.typeParameters) {

                        // The type definitions are conviently located on the object which allow us to map -> to the genericTypes
                        const typeParams = node.typeParameters.map((typeParam: ts.TypeParameterDeclaration) => typeParam.name.text);

                        // I am not sure in what cases
                        const typeIdentifier = (aType as ts.TypeReferenceNode).typeName;
                        let typeIdentifierName: string;

                        // typeIdentifier can either be a Identifier or a QualifiedName
                        if ((typeIdentifier as ts.Identifier).text) {
                            typeIdentifierName = (typeIdentifier as ts.Identifier).text;
                        } else {
                            typeIdentifierName = (typeIdentifier as ts.QualifiedName).right.text;
                        }

                        // I could not produce a situation where this did not find it so its possible this check is irrelevant
                        const indexOfType = typeParams.indexOf(typeIdentifierName);
                        if (indexOfType >= 0) {
                            aType = genericTypes[indexOfType] as ts.TypeNode;
                        }
                    }

                    return {
                        default: getJSDocComment(propertyDeclaration, 'default'),
                        description: this.getNodeDescription(propertyDeclaration),
                        format: this.getNodeFormat(propertyDeclaration),
                        name: identifier.text,
                        required: !propertyDeclaration.questionToken,
                        type: new TypeResolver(aType, this.current, aType.parent).resolve(),
                        validators: getPropertyValidators(propertyDeclaration),
                    } as Typeswag.Property;
                });
        }

        // Type alias model
        if (node.kind === ts.SyntaxKind.TypeAliasDeclaration) {
            const aliasDeclaration = node as ts.TypeAliasDeclaration;
            const properties: Typeswag.Property[] = [];

            if (aliasDeclaration.type.kind === ts.SyntaxKind.IntersectionType) {
                const intersectionTypeNode = aliasDeclaration.type as ts.IntersectionTypeNode;

                intersectionTypeNode.types.forEach((type) => {
                    if (type.kind === ts.SyntaxKind.TypeReference) {
                        const typeReferenceNode = type as ts.TypeReferenceNode;
                        const modelType = this.getModelTypeDeclaration(typeReferenceNode.typeName);
                        const modelProps = this.getModelProperties(modelType);
                        properties.push(...modelProps);
                    }
                });
            }

            if (aliasDeclaration.type.kind === ts.SyntaxKind.TypeReference) {
                const typeReferenceNode = aliasDeclaration.type as ts.TypeReferenceNode;
                const modelType = this.getModelTypeDeclaration(typeReferenceNode.typeName);
                const modelProps = this.getModelProperties(modelType);
                properties.push(...modelProps);
            }
            return properties;
        }

        // Class model
        const classDeclaration = node as ts.ClassDeclaration;
        const properties = classDeclaration.members
            .filter(member => {
                const ignore = isIgnored(member);
                return !ignore;
            })
            .filter((member) => member.kind === ts.SyntaxKind.PropertyDeclaration)
            .filter((member) => this.hasPublicModifier(member)) as Array<ts.PropertyDeclaration | ts.ParameterDeclaration>;

        const classConstructor = classDeclaration
            .members
            .find((member) => member.kind === ts.SyntaxKind.Constructor) as ts.ConstructorDeclaration;

        if (classConstructor && classConstructor.parameters) {
            const constructorProperties = classConstructor.parameters
                .filter((parameter) => this.hasPublicModifier(parameter));

            properties.push(...constructorProperties);
        }

        return properties
            .map((property) => {
                const identifier = property.name as ts.Identifier;
                let typeNode = property.type;

                if (!typeNode) {
                    const tsType = this.current.typeChecker.getTypeAtLocation(property);
                    typeNode = this.current.typeChecker.typeToTypeNode(tsType);
                }

                if (!typeNode) {
                    throw new GenerateMetadataError(`No valid type found for property declaration.`);
                }

                const type = new TypeResolver(typeNode, this.current, property).resolve();

                return {
                    default: getInitializerValue(property.initializer, type),
                    description: this.getNodeDescription(property),
                    format: this.getNodeFormat(property),
                    name: identifier.text,
                    required: !property.questionToken && !property.initializer,
                    type,
                    validators: getPropertyValidators(property as ts.PropertyDeclaration),
                } as Typeswag.Property;
            });
    }

    private getModelAdditionalProperties(node: UsableDeclaration) {
        if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
            const interfaceDeclaration = node as ts.InterfaceDeclaration;
            const indexMember = interfaceDeclaration
                .members
                .find((member) => member.kind === ts.SyntaxKind.IndexSignature);
            if (!indexMember) {
                return undefined;
            }

            const indexSignatureDeclaration = indexMember as ts.IndexSignatureDeclaration;
            const indexType = new TypeResolver(indexSignatureDeclaration.parameters[0].type as ts.TypeNode, this.current).resolve();
            if (indexType.dataType !== 'string') {
                throw new GenerateMetadataError(`Only string indexers are supported.`);
            }

            return new TypeResolver(indexSignatureDeclaration.type as ts.TypeNode, this.current).resolve();
        }

        return undefined;
    }

    private getModelInheritedProperties(modelTypeDeclaration: UsableDeclaration): Typeswag.Property[] {
        const properties = [] as Typeswag.Property[];
        if (modelTypeDeclaration.kind === ts.SyntaxKind.TypeAliasDeclaration) {
            return [];
        }
        const heritageClauses = modelTypeDeclaration.heritageClauses;
        if (!heritageClauses) {
            return properties;
        }

        heritageClauses.forEach((clause) => {
            if (!clause.types) { return; }

            clause.types.forEach((t) => {
                const baseEntityName = t.expression as ts.EntityName;
                const referenceType = this.getReferenceType(baseEntityName);
                if (referenceType.properties) {
                    referenceType.properties.forEach((property) => properties.push(property));
                }
            });
        });

        return properties;
    }

    private hasPublicModifier(node: ts.Node) {
        return !node.modifiers || node.modifiers.every((modifier) => {
            return modifier.kind !== ts.SyntaxKind.ProtectedKeyword && modifier.kind !== ts.SyntaxKind.PrivateKeyword;
        });
    }

    private getNodeDescription(node: UsableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration | ts.EnumDeclaration) {
        const symbol = this.current.typeChecker.getSymbolAtLocation(node.name as ts.Node);
        if (!symbol) {
            return undefined;
        }

        /**
         * TODO: Workaround for what seems like a bug in the compiler
         * Warrants more investigation and possibly a PR against typescript
         */
        if (node.kind === ts.SyntaxKind.Parameter) {
            // TypeScript won't parse jsdoc if the flag is 4, i.e. 'Property'
            symbol.flags = 0;
        }

        const comments = symbol.getDocumentationComment(this.current.typeChecker);
        if (comments.length) { return ts.displayPartsToString(comments); }

        return undefined;
    }

    private getNodeFormat(node: UsableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration | ts.EnumDeclaration) {
        return getJSDocComment(node, 'format');
    }

    private getNodeExample(node: UsableDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration | ts.EnumDeclaration) {
        const example = getJSDocComment(node, 'example');

        if (example) {
            return JSON.parse(example);
        } else {
            return undefined;
        }
    }
}
