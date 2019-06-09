import * as ts from 'typescript';
import { Swagger } from './swagger/swagger';

export interface Config {
    /**
     * Swagger generation configuration object.
     */
    swagger: SwaggerConfig;

    /**
     * Directories to ignore during TypeScript metadata scan.
     */
    ignore?: string[];

    /**
     * Typescript compiler options to be used during generation.
     *
     * @type {ts.CompilerOptions}
     * @memberof RoutesConfig
     */
    compilerOptions?: ts.CompilerOptions;
}

export interface OutputConfig {
    /**
     * Generated Swagger spec will output here.
     */
    path: string;

    /**
     * Generated Swagger spec will be named after this.
     * @default 'swagger.json'
     */
    filename?: string;

    /**
     * If the generated Swagger spec should be transfomed into YAML format.
     */
    yaml?: boolean;
}

export interface SwaggerConfig {
    /**
     * The entry point to your API.
     */
    entryFile: string;

    /**
     * API host.
     * @example 'myapi.com'
     */
    host?: string;

    /**
     * API version number.
     * @default npm package version
     */
    version?: string;

    /**
     * API name.
     * @default npm package name
     */
    name?: string;

    /**
     * API description.
     * @default npm package description
     */
    description?: string;

    /**
     * API license.
     * @default npm package license
     */
    license?: string;

    /**
     * Base API path.
     * @example the v1 in 'https://myapi.com/v1'
     */
    basePath?: string;

    /**
     * Extend generated Swagger spec with this object.
     * Note, that the generated properties will always take precedence over what gets specified here.
     */
    spec?: any;

    /**
     * Alter how the spec is merged to generated Swagger spec.
     *
     * Possible values:
     *  - 'immediate' is overriding top level elements only, thus you can not append a new path or alter an existing value without erasing same level elements.
     *  - 'recursive' proceeds to a deep merge and will concat every branches or override or create new values if needed. Ssee https://www.npmjs.com/package/merge
     * @default 'immediate'
     */
    specMerging?: 'immediate' | 'recursive';

    /**
     * Security definitions object.
     *
     * A declaration of the security schemes available to be used in the
     * specification. This does not enforce the security schemes on the operations
     * and only serves to provide relevant details for each scheme.
     */
    securityDefinitions?: {
        [name: string]: Swagger.Security,
    };

    /**
     * Swagger tags information for your API.
     */
    tags?: Swagger.Tag[];

    /**
     * Options for outputting into a file.
     *
     * If this object is not present, the spec will not be generated into a file.
     */
    output?: OutputConfig;

    schemes?: Swagger.Protocol[];
}
