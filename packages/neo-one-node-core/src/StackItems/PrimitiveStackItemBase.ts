import { StackItemType } from '@neo-one/client-common';
import { BufferStackItem } from './BufferStackItem';
import { ByteStringStackItem } from './ByteStringStackItem';
import { IntegerStackItem } from './IntegerStackItem';
import { StackItemAdd, StackItemBase } from './StackItemBase';
import { StackItem } from './StackItems';

export interface PrimitiveStackItemAdd extends StackItemAdd {
  readonly memory: Buffer;
  readonly size?: number;
}

export class PrimitiveStackItemBase extends StackItemBase {
  public readonly size: number;
  protected readonly memory: Buffer;

  public constructor(options: PrimitiveStackItemAdd) {
    super(options);
    this.memory = options.memory;
    this.size = options.size ? options.size : this.memory.length;
  }

  public getBuffer(): Buffer {
    return this.memory;
  }

  public convertTo(type: StackItemType): StackItem {
    if (type === this.type) {
      return this;
    }
    switch (type) {
      case StackItemType.Integer:
        return new IntegerStackItem(this.getInteger());
      case StackItemType.ByteString:
        return new ByteStringStackItem(this.memory);
      case StackItemType.Buffer:
        return new BufferStackItem(this.getBuffer());
      default:
        return super.convertTo(type);
    }
  }
}
