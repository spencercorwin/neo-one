import { BN } from 'bn.js';
import { ContractParameter, IntegerContractParameter } from '../../contractParameter';
import { AsStorageContextStackItemOptions, StackItemBase } from '../StackItemBase';
import { StackItemType } from './StackItemType';

export class StorageContextStackItem extends StackItemBase {
  public static readonly type = StackItemType.InteropInterface;
  public readonly id: number;
  public readonly isReadOnly: boolean;

  public constructor(id: number, isReadOnly = false) {
    super({ isNull: false, type: StackItemType.InteropInterface });
    this.id = id;
    this.isReadOnly = isReadOnly;
  }

  // TODO
  public asBoolean(): boolean {
    return (this.id as number | undefined) !== undefined;
  }

  // TODO: as buffer?

  public asStorageContextStackItem(_options: AsStorageContextStackItemOptions): StorageContextStackItem {
    return this;
  }

  public asReadOnly(): StorageContextStackItem {
    return new StorageContextStackItem(this.id, true);
  }

  public toContractParameter(_seen: Set<StackItemBase> = new Set()): ContractParameter {
    return new IntegerContractParameter(new BN(this.id));
  }
}
