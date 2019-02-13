import * as ts from 'typescript';
import { CustomRouteDecorator } from '../module/customDecorators';
import { getDecorators } from './../utils/decoratorUtils';
import { GenerateMetadataError } from './exceptions';
import { MetadataGenerator } from './metadataGenerator';
import { MethodGenerator } from './methodGenerator';
import { getSecurities } from './security';
import { Typeswag } from './typeswag';

export class ControllerGenerator {
  private readonly path?: string;
  private readonly tags?: string[];
  private readonly security?: Typeswag.Security[];

  constructor(
    private readonly node: ts.ClassDeclaration,
    private readonly current: MetadataGenerator,
    private readonly customRouteDecorators?: CustomRouteDecorator,
    ) {
    this.path = this.getPath();
    this.tags = this.getTags();
    this.security = this.getSecurity();
  }

  public IsValid() {
    return !!this.path || this.path === '';
  }

  public Generate(): Typeswag.Controller {
    if (!this.node.parent) {
      throw new GenerateMetadataError('Controller node doesn\'t have a valid parent source file.');
    }
    if (!this.node.name) {
      throw new GenerateMetadataError('Controller node doesn\'t have a valid name.');
    }

    const sourceFile = this.node.parent.getSourceFile();

    return {
      location: sourceFile.fileName,
      methods: this.buildMethods(),
      name: this.node.name.text,
      path: this.path || '',
    };
  }

  private buildMethods() {
    return this.node.members
      .filter((m) => m.kind === ts.SyntaxKind.MethodDeclaration)
      .map((m: ts.MethodDeclaration) => new MethodGenerator(m, this.current, this.tags, this.security))
      .filter((generator) => generator.IsValid())
      .map((generator) => generator.Generate());
  }

  private getPath() {
    let decoratorName = "";
    const decorators = getDecorators(this.node, (identifier) => {
      if (this.supportRouteDecorator(identifier.text)) {
        decoratorName = identifier.text;
        return true;
      }
      return false;
    });

    if (!decorators || !decorators.length) {
      return;
    }
    if (decorators.length > 1) {
      throw new GenerateMetadataError(`Only one Route type decorator allowed in '${this.node.name!.text}' class.`);
    }

    const decorator = decorators[0];
    const expression = decorator.parent as ts.CallExpression;
    const decoratorArgument = expression.arguments[0] as ts.StringLiteral;
    let path = decoratorArgument ? `${decoratorArgument.text}` : '';

    if (decoratorName && this.customRouteDecorators && this.customRouteDecorators[decoratorName] && this.customRouteDecorators[decoratorName].callback) {
      path = (this.customRouteDecorators[decoratorName].callback as any)(path);
    }
    return path;
  }

  private getTags() {
    const decorators = getDecorators(this.node, (identifier) => identifier.text === 'Tags');
    if (!decorators || !decorators.length) {
      return;
    }
    if (decorators.length > 1) {
      throw new GenerateMetadataError(`Only one Tags decorator allowed in '${this.node.name!.text}' class.`);
    }

    const decorator = decorators[0];
    const expression = decorator.parent as ts.CallExpression;

    return expression.arguments.map((a: any) => a.text as string);
  }

  private getSecurity(): Typeswag.Security[] {
    const securityDecorators = getDecorators(this.node, (identifier) => identifier.text === 'Security');
    if (!securityDecorators || !securityDecorators.length) {
      return [];
    }

    return getSecurities(securityDecorators);
  }

  private supportRouteDecorator(decoratorName: string) {
    const supportedDecorators = ['route'];

    if (this.customRouteDecorators) {
      for (const customDecorator of Object.keys(this.customRouteDecorators)) {
        supportedDecorators.push(customDecorator.toLocaleLowerCase());
      }
    }

    return supportedDecorators.some((d) => d === decoratorName.toLocaleLowerCase());
  }
}
