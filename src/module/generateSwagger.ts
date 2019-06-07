import * as ts from 'typescript';
import * as YAML from 'yamljs';
import { SwaggerConfig } from '../config';
import { MetadataGenerator } from '../metadataGeneration/metadataGenerator';
import { Typeswag } from '../metadataGeneration/typeswag';
import { SpecGenerator } from '../swagger/specGenerator';
import { fsExists, fsMkDir, fsWriteFile } from '../utils/fs';
import { registeredDecorators } from './customDecorators';

export const registerRouteDecorator = (decorator: (path?: string) => any, callback?: (path: string) => string) => {
    registeredDecorators.routes[decorator.name] = {
        callback,
    };
};

export const generateSwaggerSpec = async (
    config: SwaggerConfig,
    compilerOptions?: ts.CompilerOptions,
    ignorePaths?: string[],
    /**
     * pass in cached metadata returned in a previous step to speed things up
     */
    metadata?: Typeswag.Metadata,
) => {
    if (!metadata) {
        metadata = new MetadataGenerator(
            config.entryFile,
            registeredDecorators,
            compilerOptions,
            ignorePaths,
        ).Generate();
    }
    const spec = new SpecGenerator(metadata, config).GetSpec();

    const exists = await fsExists(config.outputDirectory);
    if (!exists) {
        await fsMkDir(config.outputDirectory);
    }

    let data = JSON.stringify(spec, null, '\t');
    if (config.yaml) {
        data = YAML.stringify(JSON.parse(data), 10);
    }
    const ext = config.yaml ? 'yaml' : 'json';

    await fsWriteFile(
        `${config.outputDirectory}/swagger.${ext}`,
        data,
        { encoding: 'utf8' },
    );

    return metadata;
};
