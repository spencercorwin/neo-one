// tslint:disable readonly-array
import { BinaryWriter, common, StackItemType } from '@neo-one/client-common';
import { utils } from '@neo-one/utils';
import _ from 'lodash';
import { ContractParameter, MapContractParameter } from '../contractParameter';
import { ArrayStackItem } from './ArrayStackItem';
import { CircularReferenceError, MissingStackItemKeyError } from './errors';
import { getNextID } from './referenceCounter';
import { StackItemBase } from './StackItemBase';
import { PrimitiveStackItem, StackItem } from './StackItems';

export class MapStackItem extends StackItemBase {
  public get count() {
    return this.dictionary.size;
  }

  public get subItemCount() {
    return this.count * 2;
  }

  public get size() {
    return this.count;
  }
  public static readonly maxKeySize = common.MAP_STACK_ITEM_MAX_KEY_SIZE;

  public readonly dictionary: Map<PrimitiveStackItem, StackItem>;
  private readonly referenceID = getNextID();

  public constructor(dictionary: Map<PrimitiveStackItem, StackItem>) {
    super({
      type: StackItemType.Map,
      isNull: false,
    });

    this.dictionary = dictionary;
  }

  public toStructuralKey(): string {
    return `${this.referenceID}`;
  }

  public containsKey(key: PrimitiveStackItem) {
    return this.dictionary.has(key);
  }

  public tryGetValue(key: PrimitiveStackItem) {
    return this.dictionary.get(key);
  }

  public has(key: PrimitiveStackItem) {
    return this.containsKey(key);
  }

  public get(key: PrimitiveStackItem) {
    const value = this.tryGetValue(key);

    if (value === undefined) {
      throw new MissingStackItemKeyError();
    }

    return value;
  }

  public set(key: PrimitiveStackItem, value: StackItem): this {
    this.dictionary.set(key, value);

    return this;
  }

  public delete(key: PrimitiveStackItem): this {
    this.dictionary.delete(key);

    return this;
  }

  public getBoolean() {
    return true;
  }

  public asMapStackItem(): MapStackItem {
    return this;
  }

  public clear() {
    this.clear();
  }

  public keys(): ArrayStackItem {
    return new ArrayStackItem(this.keysArray());
  }

  public keysArray(): PrimitiveStackItem[] {
    return [...this.dictionary.keys()];
  }

  public valuesArray(): StackItem[] {
    return [...this.dictionary.values()];
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

    return new MapContractParameter(
      [...this.dictionary.keys()].map<readonly [ContractParameter, ContractParameter]>((key) => [
        key.toContractParameter(newSeen),
        (this.dictionary.get(key) as StackItem).toContractParameter(newSeen),
      ]),
    );
  }

  protected incrementInternal(seen: Set<StackItemBase>): number {
    return this.incrementInternalArray(this.keysArray(), seen) + this.incrementInternalArray(this.valuesArray(), seen);
  }

  protected decrementInternal(seen: Set<StackItemBase>): number {
    return this.decrementInternalArray(this.keysArray(), seen) + this.decrementInternalArray(this.valuesArray(), seen);
  }

  // tslint:disable-next-line no-any
  protected convertJSONInternal(seen: Set<StackItemBase>): any {
    return _.fromPairs(
      utils
        .zip(this.keysArray(), this.valuesArray())
        .map(([key, value]) => [JSON.stringify(key.convertJSON(seen)), value.convertJSON(seen)]),
    );
  }

  protected serializeInternal(seen: Set<StackItemBase>): Buffer {
    const writer = new BinaryWriter();
    writer.writeUInt8(StackItemType.Map);
    const keys = this.keysArray();
    writer.writeVarUIntLE(keys.length);
    keys.forEach((key) => {
      writer.writeBytes(key.serialize(seen));
      writer.writeBytes((this.tryGetValue(key) as PrimitiveStackItem).serialize(seen));
    });

    return writer.toBuffer();
  }
}
