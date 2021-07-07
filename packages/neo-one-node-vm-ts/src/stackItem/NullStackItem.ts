import { ContractParameter } from '@neo-one/node-core';
import { InvalidValueBufferError } from './errors';
import { StackItemBase } from './StackItemBase';
import { StackItemType } from './StackItemType';

export class NullStackItem extends StackItemBase {
  public static readonly type = StackItemType.Any;
  public static readonly isNull = true;
  public readonly value: undefined;

  public constructor() {
    super();
  }

  public asBoolean(): boolean {
    return false;
  }

  public asBuffer(): Buffer {
    throw new InvalidValueBufferError();
  }

  public toContractParameter(): ContractParameter {
    throw new Error('not yet implemented');
  }

  // tslint:disable-next-line no-any
  protected convertJSONInternal(): any {
    return undefined;
  }

  protected serializeInternal(): Buffer {
    return Buffer.from([]);
  }
}
