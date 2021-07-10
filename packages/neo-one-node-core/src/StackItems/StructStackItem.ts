// tslint:disable readonly-array
import { BinaryWriter, StackItemType } from '@neo-one/client-common';
import { utils } from '@neo-one/utils';
import { ArrayContractParameter, ContractParameter } from '../contractParameter';
import { ArrayStackItem } from './ArrayStackItem';
import { CircularReferenceError } from './errors';
import { StackItemBase } from './StackItemBase';
import { StackItem } from './StackItems';

export class StructStackItem extends StackItemBase {
  public readonly array: StackItem[];

  public constructor(array: StackItem[]) {
    super({
      type: StackItemType.Struct,
      isNull: false,
    });

    this.array = array;
  }

  public toStructuralKey(): string {
    return JSON.stringify(this.array.map((value) => value.toStructuralKey()));
  }

  public getBoolean() {
    return true;
  }

  public isArray(): boolean {
    return true;
  }

  public get size() {
    return this.array.length;
  }

  public get count() {
    return this.size;
  }

  public clear() {
    // tslint:disable-next-line: no-loop-statement
    while (this.array.length > 0) {
      this.array.pop();
    }
  }

  // NOTE: We don't use `toReferenceKey` for comparison here because it doesn't short-circuit
  // Instead, use equals for efficiency and since it's equivalent
  // tslint:disable-next-line no-any
  public equals(other: any): boolean {
    if (other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if (other instanceof StructStackItem) {
      if (this.array.length !== other.array.length) {
        return false;
      }

      return utils.zip(this.array, other.array).every(([a, b]) => a.equals(b));
    }

    return this === other;
  }

  public clone(): StructStackItem {
    return new StructStackItem(this.array.map((value) => (value instanceof StructStackItem ? value.clone() : value)));
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
    if (type === StackItemType.Array) {
      return new ArrayStackItem(this.array);
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
