import { Typeswag } from '../metadataGeneration/typeswag';
import { SwaggerConfig } from './../config';
import { normalisePath } from './../utils/pathUtils';
import { Swagger } from './swagger';

export class SpecGenerator {
    constructor(private readonly metadata: Typeswag.Metadata, private readonly config: SwaggerConfig) { }

    public GetSpec() {
        let spec: Swagger.Spec = {
            basePath: normalisePath(this.config.basePath as string, '/', undefined, false),
            consumes: ['application/json'],
            definitions: this.buildDefinitions(),
            info: {
                title: '',
            },
            paths: this.buildPaths(),
            produces: ['application/json'],
            swagger: '2.0',
        };

        spec.securityDefinitions = this.config.securityDefinitions
            ? this.config.securityDefinitions
            : {};

        if (this.config.name) { spec.info.title = this.config.name; }
        if (this.config.version) { spec.info.version = this.config.version; }
        if (this.config.host) { spec.host = this.config.host; }
        if (this.config.description) { spec.info.description = this.config.description; }
        if (this.config.license) { spec.info.license = { name: this.config.license }; }
        if (this.config.tags) { spec.tags = this.config.tags; }
        if (this.config.spec) {
            this.config.specMerging = this.config.specMerging || 'immediate';
            const mergeFuncs: { [key: string]: any } = {
                immediate: Object.assign,
                recursive: require('merge').recursive,
            };

            spec = mergeFuncs[this.config.specMerging](spec, this.config.spec);
        }
        if (this.config.schemes) { spec.schemes = this.config.schemes; }

        return spec;
    }

    private buildDefinitions() {
        const definitions: { [definitionsName: string]: Swagger.Schema } = {};
        Object.keys(this.metadata.referenceTypeMap).map(typeName => {
            const referenceType = this.metadata.referenceTypeMap[typeName];

            // Object definition
            if (referenceType.properties) {
                const required = referenceType.properties.filter(p => p.required).map(p => p.name);
                definitions[referenceType.refName] = {
                    description: referenceType.description,
                    properties: this.buildProperties(referenceType.properties),
                    required: required && required.length > 0 ? Array.from(new Set(required)) : undefined,
                    type: 'object',
                };

                if (referenceType.additionalProperties) {
                    definitions[referenceType.refName].additionalProperties = this.buildAdditionalProperties(referenceType.additionalProperties);
                }

                if (referenceType.example) {
                    definitions[referenceType.refName].example = referenceType.example;
                }
            }

            // Enum definition
            if (referenceType.enums) {
                definitions[referenceType.refName] = {
                    description: referenceType.description,
                    enum: referenceType.enums,
                    type: referenceType.valueType ? referenceType.valueType : 'string',
                };
            }
        });

        return definitions;
    }

    private buildPaths() {
        const paths: { [pathName: string]: Swagger.Path } = {};

        this.metadata.controllers.forEach(controller => {
            const normalisedControllerPath = normalisePath(controller.path, '/');
            // construct documentation using all methods except @Hidden
            controller.methods.filter(method => !method.isHidden).forEach(method => {
                const normalisedMethodPath = normalisePath(method.path, '/');
                const path = normalisePath(`${normalisedControllerPath}${normalisedMethodPath}`, '/', '', false);
                paths[path] = paths[path] || {};
                this.buildMethod(controller.name, method, normalisedControllerPath, paths[path]);
            });
        });

        return paths;
    }

    private buildMethod(controllerName: string, method: Typeswag.Method, controllerPath: string, pathObject: any) {
        const pathMethod: Swagger.Operation = pathObject[method.method] = this.buildOperation(controllerName, method);
        pathMethod.description = method.description;
        pathMethod.summary = method.summary;
        pathMethod.tags = method.tags;

        // Use operationId tag otherwise fallback to generated. Warning: This doesn't check uniqueness.
        pathMethod.operationId = method.operationId || pathMethod.operationId;

        if (method.deprecated) {
            pathMethod.deprecated = method.deprecated;
        }

        if (method.security) {
            pathMethod.security = method.security as any[];
        }

        pathMethod.parameters = method.parameters
            .filter(p => {
                return !(p.in === 'request' || p.in === 'body-prop');
            })
            .map(p => this.buildParameter(p));

        // Build path parameters at the top controller level.
        // They will always be of type 'string'.
        const controllerPathParametersMatch = controllerPath.match(/\{(.+?)\}/g);
        const controllerPathParameters = controllerPathParametersMatch ? controllerPathParametersMatch.map(p => p.substring(1, p.length - 1)) : [];
        pathMethod.parameters = [...pathMethod.parameters, ...this.buildControllerPathParameters(controllerPathParameters)];

        const bodyPropParameter = this.buildBodyPropParameter(controllerName, method);
        if (bodyPropParameter) {
            pathMethod.parameters.push(bodyPropParameter);
        }
        if (pathMethod.parameters.filter((p: Swagger.BaseParameter) => p.in === 'body').length > 1) {
            throw new Error('Only one body parameter allowed per controller method.');
        }
    }

    private buildControllerPathParameters(paths: RegExpMatchArray) {
        return paths.map(p => {
            return {
                in: 'path',
                name: p,
                required: true,
                type: 'string',
            } as Swagger.Parameter;
        });
    }

    private buildBodyPropParameter(controllerName: string, method: Typeswag.Method) {
        const properties = {} as { [name: string]: Swagger.Schema };
        const required: string[] = [];

        method.parameters
            .filter(p => p.in === 'body-prop')
            .forEach(p => {
                properties[p.name] = this.getSwaggerType(p.type);
                properties[p.name].default = p.default;
                properties[p.name].description = p.description;

                if (p.required) {
                    required.push(p.name);
                }
            });

        if (!Object.keys(properties).length) { return; }

        const parameter = {
            in: 'body',
            name: 'body',
            schema: {
                properties,
                title: `${this.getOperationId(method.name)}Body`,
                type: 'object',
            },
        } as Swagger.Parameter;
        if (required.length) {
            parameter.schema.required = required;
        }
        return parameter;
    }

    private buildParameter(source: Typeswag.Parameter): Swagger.Parameter {
        let parameter = {
            default: source.default,
            description: source.description,
            in: source.in,
            name: source.name,
            required: source.required,
        } as Swagger.Parameter;

        const parameterType = this.getSwaggerType(source.type);
        parameter.format = parameterType.format || undefined;

        if (parameter.in === 'query' && parameterType.type === 'array') {
            (parameter as Swagger.QueryParameter).collectionFormat = 'multi';
        }

        if (parameterType.$ref) {
            parameter.schema = parameterType as Swagger.Schema;
            return parameter;
        }

        const validatorObjs = {};
        Object.keys(source.validators)
            .filter(key => {
                return !key.startsWith('is') && key !== 'minDate' && key !== 'maxDate';
            })
            .forEach((key: string) => {
                validatorObjs[key] = source.validators[key].value;
            });

        if (source.in === 'body' && source.type.dataType === 'array') {
            parameter.schema = {
                items: parameterType.items,
                type: 'array',
            };
        } else {
            if (source.type.dataType === 'any') {
                if (source.in === 'body') {
                    parameter.schema = { type: 'object' };
                } else {
                    parameter.type = 'string';
                }
            } else {
                parameter.type = parameterType.type;
                parameter.items = parameterType.items;
                parameter.enum = parameterType.enum;
            }
        }

        if (parameter.schema) {
            parameter.schema = Object.assign({}, parameter.schema, validatorObjs);
        } else {
            parameter = Object.assign({}, parameter, validatorObjs);
        }

        return parameter;
    }

    private buildProperties(source: Typeswag.Property[]) {
        const properties: { [propertyName: string]: Swagger.Schema } = {};

        source.forEach(property => {
            const swaggerType = this.getSwaggerType(property.type);
            const format = property.format as Swagger.DataFormat;
            swaggerType.description = property.description;
            swaggerType.format = format || swaggerType.format;
            if (!swaggerType.$ref) {
                swaggerType.default = property.default;

                Object.keys(property.validators)
                    .filter(key => {
                        return !key.startsWith('is') && key !== 'minDate' && key !== 'maxDate';
                    })
                    .forEach(key => {
                        swaggerType[key] = property.validators[key].value;
                    });
            }

            if (!property.required) {
                swaggerType['x-nullable'] = true;
            }

            properties[property.name] = swaggerType as Swagger.Schema;
        });

        return properties;
    }

    private buildAdditionalProperties(type: Typeswag.Type) {
        return this.getSwaggerType(type);
    }

    private buildOperation(controllerName: string, method: Typeswag.Method): Swagger.Operation {
        const swaggerResponses: any = {};

        method.responses.forEach((res: Typeswag.Response) => {
            swaggerResponses[res.name] = {
                description: res.description,
            };
            if (res.schema && res.schema.dataType !== 'void') {
                swaggerResponses[res.name].schema = this.getSwaggerType(res.schema);
            }
            if (res.examples) {
                swaggerResponses[res.name].examples = { 'application/json': res.examples };
            }
        });

        return {
            operationId: this.getOperationId(method.name),
            produces: ['application/json'],
            responses: swaggerResponses,
        };
    }

    private getOperationId(methodName: string) {
        return methodName.charAt(0).toUpperCase() + methodName.substr(1);
    }

    private getSwaggerType(type: Typeswag.Type): Swagger.Schema {
        const swaggerType = this.getSwaggerTypeForPrimitiveType(type);
        if (swaggerType) {
            return swaggerType;
        }

        if (type.dataType === 'array') {
            return this.getSwaggerTypeForArrayType(type as Typeswag.ArrayType);
        }

        if (type.dataType === 'enum') {
            return this.getSwaggerTypeForEnumType(type as Typeswag.EnumerateType);
        }

        return this.getSwaggerTypeForReferenceType(type as Typeswag.ReferenceType) as Swagger.Schema;
    }

    private getSwaggerTypeForPrimitiveType(type: Typeswag.Type): Swagger.Schema | undefined {
        const map = {
            any: { type: 'object' },
            binary: { type: 'string', format: 'binary' },
            boolean: { type: 'boolean' },
            buffer: { type: 'string', format: 'byte' },
            byte: { type: 'string', format: 'byte' },
            date: { type: 'string', format: 'date' },
            datetime: { type: 'string', format: 'date-time' },
            double: { type: 'number', format: 'double' },
            float: { type: 'number', format: 'float' },
            integer: { type: 'integer', format: 'int32' },
            long: { type: 'integer', format: 'int64' },
            never: { type: 'object' },
            object: { type: 'object' },
            string: { type: 'string' },
            unknown: { type: 'object' },
        } as { [name: string]: Swagger.Schema };

        return map[type.dataType];
    }

    private getSwaggerTypeForArrayType(arrayType: Typeswag.ArrayType): Swagger.Schema {
        return { type: 'array', items: this.getSwaggerType(arrayType.elementType) };
    }

    private getSwaggerTypeForEnumType(enumType: Typeswag.EnumerateType): Swagger.Schema {
        const valueType = enumType.valueType ? enumType.valueType : 'string';
        return { type: valueType, enum: (enumType as any).enums.map((member) => member) };
    }

    private getSwaggerTypeForReferenceType(referenceType: Typeswag.ReferenceType): Swagger.BaseSchema {
        return { $ref: `#/definitions/${referenceType.refName}` };
    }
}
