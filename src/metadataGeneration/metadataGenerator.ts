import * as mm from 'minimatch';
import * as ts from 'typescript';
import { CustomDecorators } from '../module/customDecorators';
import { ControllerGenerator } from './controllerGenerator';
import { Typeswag } from './typeswag';

export class MetadataGenerator {
    public readonly nodes = new Array<ts.Node>();
    public readonly typeChecker: ts.TypeChecker;
    private readonly program: ts.Program;
    private referenceTypeMap: Typeswag.ReferenceTypeMap = {};
    private circularDependencyResolvers = new Array<(referenceTypes: Typeswag.ReferenceTypeMap) => void>();

    public IsExportedNode(node: ts.Node) { return true; }

    constructor(entryFile: string, private readonly customDecorators?: CustomDecorators, compilerOptions?: ts.CompilerOptions, private readonly ignorePaths?: string[]) {
        this.program = ts.createProgram([entryFile], compilerOptions || {});
        this.typeChecker = this.program.getTypeChecker();
    }

    public Generate(): Typeswag.Metadata {
        this.program.getSourceFiles().forEach((sf) => {
            if (this.ignorePaths && this.ignorePaths.length) {
                for (const path of this.ignorePaths) {
                    if (mm(sf.fileName, path)) {
                        return;
                    }
                }
            }

            ts.forEachChild(sf, (node) => {
                this.nodes.push(node);
            });
        });

        const controllers = this.buildControllers();

        this.circularDependencyResolvers.forEach((c) => c(this.referenceTypeMap));

        return {
            controllers,
            referenceTypeMap: this.referenceTypeMap,
        };
    }

    public TypeChecker() {
        return this.typeChecker;
    }

    public AddReferenceType(referenceType: Typeswag.ReferenceType) {
        if (!referenceType.refName) {
            return;
        }
        this.referenceTypeMap[referenceType.refName] = referenceType;
    }

    public GetReferenceType(refName: string) {
        return this.referenceTypeMap[refName];
    }

    public OnFinish(callback: (referenceTypes: Typeswag.ReferenceTypeMap) => void) {
        this.circularDependencyResolvers.push(callback);
    }

    private buildControllers() {
        return this.nodes
            .filter((node) => node.kind === ts.SyntaxKind.ClassDeclaration && this.IsExportedNode(node as ts.ClassDeclaration))
            .map((classDeclaration: ts.ClassDeclaration) => new ControllerGenerator(classDeclaration, this, this.customDecorators && this.customDecorators.routes))
            .filter((generator) => generator.IsValid())
            .map((generator) => generator.Generate());
    }
}
