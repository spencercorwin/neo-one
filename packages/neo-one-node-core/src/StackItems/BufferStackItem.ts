import { StackItemType, utils } from '@neo-one/client-common';
import { ByteArrayContractParameter, ContractParameter } from '../contractParameter';
import { ByteStringStackItem } from './ByteStringStackItem';
import { IntegerStackItem } from './IntegerStackItem';
import { StackItemBase } from './StackItemBase';
import { StackItem } from './StackItems';

export class BufferStackItem extends StackItemBase {
  public readonly size: number;
  private readonly mutableInnerBuffer: Buffer;

  public constructor(data: Buffer) {
    super({
      isNull: false,
      type: StackItemType.Buffer,
    });
    this.mutableInnerBuffer = data;
    this.size = data.length;
  }

  public get innerBuffer() {
    return this.mutableInnerBuffer;
  }

  public getBoolean() {
    return true;
  }

  public getBuffer() {
    return this.innerBuffer;
  }

  public convertTo(type: StackItemType): StackItem {
    switch (type) {
      case StackItemType.Integer:
        if (this.innerBuffer.length > 100000) {
          throw new Error('Invalid convert');
        }

        return new IntegerStackItem(utils.fromSignedBuffer(this.innerBuffer));
      case StackItemType.ByteString:
        return new ByteStringStackItem(this.innerBuffer);
      default:
        return super.convertTo(type);
    }
  }

  public copy({
    source,
    destinationIndex,
    startIndex,
    count,
  }: {
    readonly source: Buffer;
    readonly destinationIndex: number;
    readonly startIndex: number;
    readonly count: number;
  }) {
    source.copy(this.mutableInnerBuffer, destinationIndex, startIndex, startIndex + count);
  }

  public toContractParameter(_seen: Set<StackItemBase> = new Set()): ContractParameter {
    return new ByteArrayContractParameter(this.innerBuffer);
  }
}
