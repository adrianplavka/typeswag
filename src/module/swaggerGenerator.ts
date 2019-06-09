import * as ts from 'typescript';
import * as YAML from 'yamljs';
import { SwaggerConfig } from '../config';
import { MetadataGenerator } from '../metadataGeneration/metadataGenerator';
import { Typeswag } from '../metadataGeneration/typeswag';
import { SpecGenerator } from '../swagger/specGenerator';
import { fsExists, fsMkDir, fsWriteFile } from '../utils/fs';
import { CustomDecorators } from './customDecorators';

export class SwaggerGenerator {
    private registeredDecorators: CustomDecorators;

    constructor() {
        this.registeredDecorators = {
            routes: { },
        };
    }

    public registerRouteDecorator(decorator: (path?: string) => any, callback?: (path: string) => string) {
        this.registeredDecorators.routes[decorator.name] = {
            callback,
        };
    }

    public async generate(
        config: SwaggerConfig,
        compilerOptions?: ts.CompilerOptions,
        ignorePaths?: string[],
        // Pass in cached metadata returned in a previous step to speed things up
        metadata?: Typeswag.Metadata,
    ) {
        if (!metadata) {
            metadata = new MetadataGenerator(
                config.entryFile,
                this.registeredDecorators,
                compilerOptions,
                ignorePaths,
            ).Generate();
        }
        const spec = new SpecGenerator(metadata, config).GetSpec();

        if (config.output) {
            const exists = await fsExists(config.output.path);
            if (!exists) {
                await fsMkDir(config.output.path);
            }

            let data = JSON.stringify(spec, null, '\t');
            if (config.output.yaml) {
                data = YAML.stringify(JSON.parse(data), 10);
            }

            const ext = config.output.yaml ? 'yaml' : 'json';
            await fsWriteFile(
                `${config.output.path}/${config.output.filename ? config.output.filename : `swagger.${ext}`}`,
                data,
                { encoding: 'utf8' },
            );
        }

        return spec;
    }
}
