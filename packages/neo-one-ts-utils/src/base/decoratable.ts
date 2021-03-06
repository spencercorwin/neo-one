import ts from 'typescript';
import * as utils from '../utils';

export type DecoratableNode = ts.Node & { readonly decorators?: ts.NodeArray<ts.Decorator> };

export function getDecorators(node: DecoratableNode): readonly ts.Decorator[] | undefined {
  return utils.getValueOrUndefined(node.decorators);
}

export function getDecoratorsArray(node: DecoratableNode): readonly ts.Decorator[] {
  return utils.getArray(getDecorators(node));
}
