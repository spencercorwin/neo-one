import { ClassInstanceMemberType, tsUtils } from '@neo-one/ts-utils';
import { utils } from '@neo-one/utils';
import _ from 'lodash';
import ts from 'typescript';
import { STRUCTURED_STORAGE_TYPES, StructuredStorageType } from '../compile/constants';
import {
  BUILTIN_PROPERTIES,
  ContractPropertyName,
  Decorator,
  DECORATORS_ARRAY,
  IGNORED_PROPERTIES,
  RESERVED_PROPERTIES,
  VIRTUAL_PROPERTIES,
} from '../constants';
import { Context } from '../Context';
import { DiagnosticCode } from '../DiagnosticCode';
import { DiagnosticMessage } from '../DiagnosticMessage';
import { getSetterName } from '../utils';

export interface PropInfoBase {
  readonly classDecl: ts.ClassDeclaration | ts.ClassExpression;
  readonly isPublic: boolean;
}

export interface DeployPropInfo extends PropInfoBase {
  readonly type: 'deploy';
  readonly name: string;
  readonly isMixinDeploy: boolean;
  readonly decl?: ts.ConstructorDeclaration;
  readonly callSignature?: ts.Signature;
  readonly isSafe: boolean;
}

export interface UpgradePropInfo extends PropInfoBase {
  readonly type: 'upgrade';
  readonly name: string;
  readonly approveUpgrade: ts.PropertyDeclaration | ts.MethodDeclaration;
  readonly isSafe: boolean;
}

export interface FunctionPropInfo extends PropInfoBase {
  readonly type: 'function';
  readonly name: string;
  readonly symbol: ts.Symbol;
  readonly decl: ts.PropertyDeclaration | ts.MethodDeclaration;
  readonly callSignature: ts.Signature | undefined;
  readonly receive: boolean;
  readonly constant: boolean;
  readonly isSafe: boolean;
  readonly returnType: ts.Type | undefined;
  readonly isAbstract: boolean;
}

export interface PropertyPropInfo extends PropInfoBase {
  readonly type: 'property';
  readonly name: string;
  readonly symbol: ts.Symbol;
  readonly decl: ts.PropertyDeclaration | ts.ParameterPropertyDeclaration;
  readonly propertyType: ts.Type | undefined;
  readonly isReadonly: boolean;
  readonly isAbstract: boolean;
  readonly isSafe: boolean;
  readonly structuredStorageType: StructuredStorageType | undefined;
}

export interface AccessorPropInfo extends PropInfoBase {
  readonly type: 'accessor';
  readonly name: string;
  readonly symbol: ts.Symbol;
  readonly getter?: {
    readonly name: string;
    readonly decl: ts.GetAccessorDeclaration;
    readonly constant: boolean;
    readonly isSafe: boolean;
  };
  readonly setter?: {
    readonly name: string;
    readonly decl: ts.SetAccessorDeclaration;
    readonly isSafe: boolean;
  };
  readonly propertyType: ts.Type | undefined;
}

export type PropInfo = PropertyPropInfo | AccessorPropInfo | FunctionPropInfo | DeployPropInfo | UpgradePropInfo;

export interface ContractInfo {
  readonly smartContract: ts.ClassDeclaration | ts.ClassExpression;
  readonly propInfos: ReadonlyArray<PropInfo>;
  readonly superSmartContract?: ContractInfo;
}

export class ContractInfoProcessor {
  public constructor(public readonly context: Context, public readonly smartContract: ts.ClassDeclaration) {}

  public process(): ContractInfo {
    if (tsUtils.modifier.isAbstract(this.smartContract)) {
      this.context.reportError(
        this.smartContract,
        DiagnosticCode.InvalidContract,
        DiagnosticMessage.InvalidContractAbstract,
      );
    }
    const result = this.processClass(this.smartContract, this.context.analysis.getType(this.smartContract));
    const approveUpgrade = this.getApproveUpgradeDecl(result);
    const upgrade: PropInfo | undefined =
      approveUpgrade !== undefined
        ? {
            type: 'upgrade',
            name: ContractPropertyName.upgrade,
            classDecl: this.smartContract,
            isPublic: true,
            approveUpgrade,
            isSafe: false,
          }
        : undefined;

    const finalPropInfos = result.propInfos.concat([upgrade].filter(utils.notNull));

    if (this.hasDeployInfo(result)) {
      return {
        ...result,
        propInfos: finalPropInfos,
      };
    }

    return {
      ...result,
      propInfos: finalPropInfos.concat([
        {
          type: 'deploy',
          name: ContractPropertyName.deploy,
          classDecl: this.smartContract,
          isPublic: true,
          isMixinDeploy: false,
          isSafe: true, // TODO: check
        },
      ]),
    };
  }

  private processClass(
    classDecl: ts.ClassDeclaration | ts.ClassExpression,
    classType: ts.Type | undefined,
    baseTypes: ReadonlyArray<ts.Type> = [],
  ): ContractInfo {
    if (classType === undefined) {
      return { smartContract: classDecl, propInfos: [] };
    }

    tsUtils.class_
      .getStaticMembers(classDecl)
      .map((member) => tsUtils.modifier.getStaticKeyword(member))
      .filter(utils.notNull)
      .forEach((keyword) => {
        this.context.reportError(
          keyword,
          DiagnosticCode.InvalidContractMethod,
          DiagnosticMessage.InvalidContractPropertyOrMethodStatic,
        );
      });

    _.flatten(tsUtils.class_.getMembers(classDecl).map((member) => tsUtils.decoratable.getDecoratorsArray(member)))
      .filter((decorator) => !this.isValidDecorator(decorator))
      .forEach((decorator) => {
        this.context.reportError(decorator, DiagnosticCode.UnsupportedSyntax, DiagnosticMessage.UnsupportedDecorator);
      });

    _.flatten(
      tsUtils.class_
        .getMethods(classDecl)
        .map((method) =>
          _.flatten(
            tsUtils.parametered.getParameters(method).map((param) => tsUtils.decoratable.getDecoratorsArray(param)),
          ),
        ),
    )
      .filter((decorator) => !this.isValidDecorator(decorator))
      .forEach((decorator) => {
        this.context.reportError(decorator, DiagnosticCode.UnsupportedSyntax, DiagnosticMessage.UnsupportedDecorator);
      });

    _.flatten(
      tsUtils.class_
        .getSetAccessors(classDecl)
        .map((method) =>
          _.flatten(
            tsUtils.parametered.getParameters(method).map((param) => tsUtils.decoratable.getDecoratorsArray(param)),
          ),
        ),
    )
      .filter((decorator) => !this.isValidDecorator(decorator))
      .forEach((decorator) => {
        this.context.reportError(decorator, DiagnosticCode.UnsupportedSyntax, DiagnosticMessage.UnsupportedDecorator);
      });

    let propInfos = tsUtils.type_
      .getProperties(classType)
      .map((symbol) => this.processProperty(symbol))
      .filter(utils.notNull);

    const ctor = tsUtils.class_.getConcreteConstructor(classDecl);
    const ctorType =
      ctor === undefined
        ? undefined
        : this.context.analysis.getTypeOfSymbol(this.context.analysis.getSymbol(ctor.parent), ctor.parent);
    if (ctor !== undefined && ctorType !== undefined) {
      const callSignatures = ctorType.getConstructSignatures();
      if (callSignatures.length !== 1) {
        this.context.reportError(
          ctor,
          DiagnosticCode.InvalidContractMethod,
          DiagnosticMessage.InvalidContractMethodMultipleSignatures,
        );
      }
      const callSignature = callSignatures[0];
      const maybeFunc = tsUtils.node.getFirstAncestorByTest(
        ctor,
        (value): value is ts.FunctionDeclaration | ts.FunctionExpression =>
          ts.isFunctionDeclaration(value) || ts.isFunctionExpression(value),
      );

      propInfos = propInfos.concat([
        {
          type: 'deploy',
          name: ContractPropertyName.deploy,
          classDecl,
          decl: ctor,
          isPublic: true,
          isSafe: true, // TODO: check
          callSignature,
          isMixinDeploy: maybeFunc !== undefined && this.context.analysis.isSmartContractMixinFunction(maybeFunc),
        },
      ]);
    }

    const extend = tsUtils.class_.getExtends(classDecl);
    let superSmartContract: ContractInfo | undefined;
    if (extend !== undefined) {
      let baseType = baseTypes[0] as ts.Type | undefined;
      let nextBaseTypes = baseTypes.slice(1);
      if (baseTypes.length === 0) {
        const currentBaseTypes = tsUtils.class_.getBaseTypesFlattened(this.context.typeChecker, classDecl);
        baseType = currentBaseTypes[0];
        nextBaseTypes = currentBaseTypes.slice(1);
      }

      if (baseType !== undefined) {
        const baseSymbol = this.context.analysis.getSymbolForType(classDecl, baseType);
        if (baseSymbol !== undefined) {
          const decls = tsUtils.symbol.getDeclarations(baseSymbol);
          const decl = decls[0];
          if (
            decls.length === 1 &&
            (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) &&
            !this.context.builtins.isValue(decl, 'SmartContract')
          ) {
            superSmartContract = this.processClass(decl, baseType, nextBaseTypes);
          }
        }
      }
    }

    const contractInfo = { smartContract: classDecl, propInfos, superSmartContract };
    if (
      contractInfo.propInfos.every((propInfo) => propInfo.type !== 'deploy') &&
      contractInfo.propInfos.some(
        (propInfo) => propInfo.type === 'property' && tsUtils.initializer.getInitializer(propInfo.decl) !== undefined,
      )
    ) {
      return {
        ...contractInfo,
        propInfos: contractInfo.propInfos.concat([
          {
            type: 'deploy',
            name: ContractPropertyName.deploy,
            classDecl: this.smartContract,
            isPublic: true,
            isMixinDeploy: false,
            isSafe: true, // TODO: check
          },
        ]),
      };
    }

    return contractInfo;
  }

  private processProperty(symbol: ts.Symbol): PropInfo | undefined {
    const decls = tsUtils.symbol.getDeclarations(symbol);
    const implDecls = decls.filter(
      (symbolDecl) =>
        (!(ts.isMethodDeclaration(symbolDecl) || ts.isConstructorDeclaration(symbolDecl)) ||
          tsUtils.overload.isImplementation(symbolDecl)) &&
        (!ts.isPropertyDeclaration(symbolDecl) || !tsUtils.modifier.isAbstract(symbolDecl)),
    );

    const decl = implDecls.length > 0 ? implDecls[0] : (decls[0] as ts.Declaration | undefined);
    if (
      decl === undefined ||
      !(
        ts.isMethodDeclaration(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isGetAccessorDeclaration(decl) ||
        ts.isSetAccessorDeclaration(decl) ||
        ts.isParameterPropertyDeclaration(decl, decl.parent)
      )
    ) {
      return undefined;
    }
    const nameNode = tsUtils.node.getNameNode(decl);
    if (!ts.isIdentifier(nameNode)) {
      this.context.reportError(
        nameNode,
        DiagnosticCode.InvalidContractProperty,
        DiagnosticMessage.InvalidContractPropertyIdentifier,
      );

      return undefined;
    }

    const name = tsUtils.symbol.getName(symbol);
    if (IGNORED_PROPERTIES.has(name)) {
      return undefined;
    }
    if (BUILTIN_PROPERTIES.has(name)) {
      const memberSymbol = this.context.builtins.getOnlyMemberSymbol('SmartContract', name);
      if (symbol !== memberSymbol) {
        this.context.reportError(
          nameNode,
          DiagnosticCode.InvalidContractProperty,
          DiagnosticMessage.InvalidContractPropertyReserved,
          name,
        );
      }

      return undefined;
    }
    if (RESERVED_PROPERTIES.has(name)) {
      const valueSymbol = this.context.builtins.getValueSymbol('SmartContract');
      const memberSymbol = tsUtils.symbol.getMemberOrThrow(valueSymbol, name);
      if (tsUtils.symbol.getTarget(symbol) !== memberSymbol) {
        this.context.reportError(
          nameNode,
          DiagnosticCode.InvalidContractProperty,
          DiagnosticMessage.InvalidContractPropertyReserved,
          name,
        );
      }

      return undefined;
    }
    if (VIRTUAL_PROPERTIES.has(name)) {
      this.context.reportError(
        nameNode,
        DiagnosticCode.InvalidContractMethod,
        DiagnosticMessage.InvalidContractMethodReserved,
        name,
      );

      return undefined;
    }

    const type = this.context.analysis.getTypeOfSymbol(symbol, decl);
    if (type === undefined) {
      return undefined;
    }

    const maybeClassDecl = tsUtils.node.getFirstAncestorByTest(decl, ts.isClassDeclaration);
    const maybeClassExpr = tsUtils.node.getFirstAncestorByTest(decl, ts.isClassExpression);
    const classDecl = maybeClassDecl === undefined ? maybeClassExpr : maybeClassDecl;
    if (classDecl === undefined) {
      this.context.reportUnsupported(decl);

      return undefined;
    }

    const isPublic = tsUtils.modifier.isPublic(decl);
    if (ts.isGetAccessorDeclaration(decl) || ts.isSetAccessorDeclaration(decl)) {
      const getDecl = ts.isGetAccessorDeclaration(decl) ? decl : tsUtils.accessor.getGetAccessor(decl);
      const setDecl = ts.isSetAccessorDeclaration(decl) ? decl : tsUtils.accessor.getSetAccessor(decl);

      return {
        type: 'accessor',
        symbol: tsUtils.symbol.getTarget(symbol),
        name: tsUtils.node.getName(decl),
        classDecl,
        getter:
          getDecl === undefined
            ? undefined
            : {
                name: tsUtils.node.getName(getDecl),
                decl: getDecl,
                constant: this.hasConstant(getDecl),
                isSafe: this.hasSafe(getDecl) || this.hasConstant(getDecl),
              },
        setter:
          setDecl === undefined
            ? undefined
            : {
                name: getSetterName(tsUtils.node.getName(setDecl)),
                decl: setDecl,
                isSafe: this.hasSafe(setDecl),
              },
        isPublic,
        propertyType: type,
      };
    }

    let callSignatures = type.getCallSignatures();
    if (ts.isMethodDeclaration(decl) || (ts.isPropertyDeclaration(decl) && callSignatures.length > 0)) {
      if (callSignatures.length > 1) {
        callSignatures = callSignatures.filter((signature) => !tsUtils.modifier.isAbstract(signature.getDeclaration()));
      }
      if (callSignatures.length > 1) {
        this.context.reportError(
          decl,
          DiagnosticCode.InvalidContractMethod,
          DiagnosticMessage.InvalidContractMethodMultipleSignatures,
        );
      }
      if (callSignatures.length === 0) {
        return undefined;
      }

      if (ts.isPropertyDeclaration(decl)) {
        const initializerProp = tsUtils.initializer.getInitializer(decl);
        const isReadonlyProp = tsUtils.modifier.isReadonly(decl);
        if (initializerProp === undefined || tsUtils.type_.getCallSignatures(type).length === 0 || !isReadonlyProp) {
          this.context.reportError(
            decl,
            DiagnosticCode.InvalidContractStorageType,
            DiagnosticMessage.InvalidContractStorageType,
          );

          return undefined;
        }
      }

      const callSignature = callSignatures[0];

      const constant = this.hasConstant(decl);
      const receive = this.hasReceive(decl);
      const safe = this.hasSafe(decl);

      const returnType = callSignatures.length >= 1 ? tsUtils.signature.getReturnType(callSignature) : undefined;

      return {
        type: 'function',
        name: tsUtils.node.getName(decl),
        classDecl,
        symbol: tsUtils.symbol.getTarget(symbol),
        decl,
        receive,
        isPublic,
        isSafe: safe || constant,
        callSignature,
        returnType,
        constant,
        isAbstract: !tsUtils.overload.isImplementation(decl),
      };
    }

    const structuredStorageType = STRUCTURED_STORAGE_TYPES.find((testType) =>
      this.context.builtins.isInterface(decl, type, testType),
    );
    const isReadonly = tsUtils.modifier.isReadonly(decl);
    const isAbstract = tsUtils.modifier.isAbstract(decl);
    const initializer = tsUtils.initializer.getInitializer(decl);
    const isSafe = this.hasSafe(decl);
    if (structuredStorageType !== undefined && (isPublic || isAbstract || !isReadonly || initializer === undefined)) {
      this.context.reportError(
        decl,
        DiagnosticCode.InvalidStructuredStorageFor,
        DiagnosticMessage.InvalidStructuredStorageForProperty,
      );

      return undefined;
    }

    if (structuredStorageType === undefined && !this.context.analysis.isValidStorageType(decl, type)) {
      this.context.reportError(
        decl,
        DiagnosticCode.InvalidContractStorageType,
        DiagnosticMessage.InvalidContractStorageType,
      );

      return undefined;
    }

    return {
      type: 'property',
      symbol: tsUtils.symbol.getTarget(symbol),
      name: tsUtils.node.getName(decl),
      classDecl,
      decl,
      isPublic,
      propertyType: type,
      isReadonly,
      isAbstract,
      structuredStorageType,
      isSafe: isReadonly || isSafe,
    };
  }

  private hasConstant(decl: ClassInstanceMemberType | ts.ConstructorDeclaration): boolean {
    return this.hasDecorator(decl, Decorator.constant);
  }

  private hasReceive(decl: ClassInstanceMemberType | ts.ConstructorDeclaration): boolean {
    return this.hasDecorator(decl, Decorator.receive);
  }

  private hasSafe(decl: ClassInstanceMemberType | ts.ConstructorDeclaration): boolean {
    return this.hasDecorator(decl, Decorator.safe);
  }

  private hasDecorator(decl: ClassInstanceMemberType | ts.ConstructorDeclaration, name: Decorator): boolean {
    const decorators = tsUtils.decoratable.getDecorators(decl);

    return decorators === undefined ? false : decorators.some((decorator) => this.isDecorator(decorator, name));
  }

  private isValidDecorator(decorator: ts.Decorator): boolean {
    return DECORATORS_ARRAY.some((valid) => this.isDecorator(decorator, valid));
  }

  private isDecorator(decorator: ts.Decorator, name: Decorator): boolean {
    return this.context.builtins.isValue(tsUtils.expression.getExpression(decorator), name);
  }

  private hasDeployInfo(contractInfo: ContractInfo): boolean {
    if (contractInfo.propInfos.some((propInfo) => propInfo.type === 'deploy')) {
      return true;
    }

    const superSmartContract = contractInfo.superSmartContract;
    if (superSmartContract === undefined) {
      return false;
    }

    return this.hasDeployInfo(superSmartContract);
  }

  private getApproveUpgradeDecl(contractInfo: ContractInfo): ts.MethodDeclaration | ts.PropertyDeclaration | undefined {
    const propInfo = contractInfo.propInfos.find((info) => info.name === ContractPropertyName.approveUpgrade);
    if (propInfo !== undefined && propInfo.type === 'function' && tsUtils.overload.isImplementation(propInfo.decl)) {
      return propInfo.decl;
    }

    const superSmartContract = contractInfo.superSmartContract;
    if (superSmartContract === undefined) {
      return undefined;
    }

    return this.getApproveUpgradeDecl(superSmartContract);
  }
}
