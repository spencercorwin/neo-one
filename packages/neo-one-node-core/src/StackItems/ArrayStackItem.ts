// tslint:disable readonly-array
import { BinaryWriter, StackItemType } from '@neo-one/client-common';
import { ArrayContractParameter, ContractParameter } from '../contractParameter';
import { CircularReferenceError } from './errors';
import { getNextID } from './referenceCounter';
import { StackItemAdd, StackItemBase } from './StackItemBase';
import { StackItem } from './StackItems';
import { StructStackItem } from './StructStackItem';

export interface ArrayStackItemAdd extends StackItemAdd {
  readonly array: StackItem[];
}

export class ArrayStackItem extends StackItemBase {
  public get count() {
    return this.array.length;
  }

  public get size() {
    return this.count;
  }
  public readonly array: StackItem[];
  private readonly referenceID = getNextID();

  public constructor(array: StackItem[]) {
    super({
      type: StackItemType.Array,
      isNull: false,
    });

    this.array = array;
  }

  public toStructuralKey(): string {
    return `${this.referenceID}`;
  }

  public getBoolean() {
    return true;
  }

  public isArray(): boolean {
    return true;
  }

  public getArray(): StackItem[] {
    return this.array;
  }

  public pop(): StackItem {
    const item = this.array.pop();
    if (item === undefined) {
      throw new Error("Can't remove item from empty array");
    }

    return item;
  }

  public clear() {
    // tslint:disable-next-line: no-loop-statement
    while (this.array.length > 0) {
      this.array.pop();
    }
  }

  // tslint:disable-next-line no-any
  public equals(other: any): boolean {
    return this === other;
  }

  public toContractParameter(seen: Set<StackItemBase> = new Set()): ContractParameter {
    if (seen.has(this)) {
      throw new CircularReferenceError();
    }
    const newSeen = new Set([...seen]);
    newSeen.add(this);

    return new ArrayContractParameter(this.array.map((val) => val.toContractParameter(newSeen)));
  }

  public convertTo(type: StackItemType) {
    if (this.type === StackItemType.Array && type === StackItemType.Struct) {
      return new StructStackItem(this.array);
    }

    return super.convertTo(type);
  }

  protected incrementInternal(seen: Set<StackItemBase>): number {
    return this.incrementInternalArray(this.array, seen);
  }

  protected decrementInternal(seen: Set<StackItemBase>): number {
    return this.decrementInternalArray(this.array, seen);
  }

  // tslint:disable-next-line no-any
  protected convertJSONInternal(seen: Set<StackItemBase>): any {
    return this.array.map((val) => val.convertJSON(seen));
  }

  protected serializeInternal(seen: Set<StackItemBase>): Buffer {
    const writer = new BinaryWriter();
    writer.writeUInt8(this.type);
    writer.writeVarUIntLE(this.array.length);
    this.array.forEach((item) => {
      writer.writeBytes(item.serialize(seen));
    });

    return writer.toBuffer();
  }
}
