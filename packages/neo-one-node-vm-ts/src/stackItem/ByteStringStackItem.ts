import { ByteArrayContractParameter, ContractParameter } from '@neo-one/node-core';
import { StackItemBase } from './StackItemBase';
import { StackItemType } from './StackItemType';

export class ByteStringStackItem extends StackItemBase {
  public static readonly type = StackItemType.ByteString;
  public readonly value: Buffer;

  public constructor(value: Buffer) {
    super();
    this.value = value;
  }

  public asBuffer(): Buffer {
    return this.value;
  }

  public toContractParameter(_seen: Set<StackItemBase> = new Set()): ContractParameter {
    return new ByteArrayContractParameter(this.value);
  }
}
