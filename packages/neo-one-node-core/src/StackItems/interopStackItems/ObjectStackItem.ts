import { StackItemType } from '@neo-one/client-common';
import { ContractParameter, InteropInterfaceContractParameter } from '../../contractParameter';
import { StackItemBase } from '../StackItemBase';
import { InvalidValueBufferError, UnsupportedStackItemSerdeError } from './errors';

export class ObjectStackItem<Value> extends StackItemBase {
  public readonly value: Value;

  public constructor(value: Value) {
    super({
      isNull: false,
      type: StackItemType.InteropInterface,
    });
    this.value = value;
  }

  public asBoolean(): boolean {
    return this.value !== undefined;
  }

  public asBuffer(): Buffer {
    throw new InvalidValueBufferError();
  }

  public toContractParameter(_seen: Set<StackItemBase> = new Set()): ContractParameter {
    return new InteropInterfaceContractParameter();
  }

  // tslint:disable-next-line no-any
  protected toJSONInternal(): any {
    /* istanbul ignore next */
    return JSON.stringify(this.value);
  }

  protected serializeInternal(): Buffer {
    throw new UnsupportedStackItemSerdeError();
  }
}
