import { BinaryWriter, StackItemType, utils } from '@neo-one/client-common';
import { BN } from 'bn.js';
import { ContractParameter } from '../contractParameter';
import { utils as nodeCoreUtils } from '../utils';
import { BooleanStackItem } from './BooleanStackItem';
import { InvalidRecursiveSerializeError, InvalidValueArrayError } from './errors';
import { StackItem } from './StackItems';

export interface StackItemAdd {
  readonly isNull: boolean;
  readonly type: StackItemType;
}

export abstract class StackItemBase {
  public readonly isNull: boolean;
  public readonly type: StackItemType;
  private mutableCount = 0;

  public constructor({ isNull, type }: StackItemAdd) {
    this.isNull = isNull;
    this.type = type;
  }

  public get referenceCount(): number {
    return this.mutableCount;
  }

  public increment(seen = new Set<StackItemBase>()): number {
    if (seen.has(this)) {
      return 1;
    }
    seen.add(this);
    this.mutableCount += 1;

    if (this.mutableCount > 1) {
      return 1;
    }

    return this.incrementInternal(seen) + 1;
  }

  public decrement(seen = new Set<StackItemBase>()): number {
    if (seen.has(this)) {
      return -1;
    }
    seen.add(this);
    this.mutableCount -= 1;

    if (this.mutableCount >= 1) {
      return -1;
    }

    return this.decrementInternal(seen) - 1;
  }

  public serialize(seen = new Set<StackItemBase>()): Buffer {
    if (seen.has(this)) {
      throw new InvalidRecursiveSerializeError();
    }
    const nextSeen = new Set(seen);
    nextSeen.add(this);

    return this.serializeInternal(nextSeen);
  }

  public getInteger(): BN {
    /* istanbul ignore next */
    throw new Error('Unimplemented.');
  }

  // tslint:disable-next-line: no-any
  public getInterface<T>(_isFunc?: (value: any) => value is T): T | undefined {
    /* istanbul ignore next */
    throw new Error('Unimplemented.');
  }

  public getBuffer(): Buffer {
    /* istanbul ignore next */
    throw new Error('Unimplemented.');
  }

  public getString(): string {
    return nodeCoreUtils.toUTF8(this.getBuffer());
  }

  public toContractParameter(): ContractParameter {
    /* istanbul ignore next */
    throw new Error('Unimplemented.');
  }

  // tslint:disable-next-line no-any
  public equals(other: any): boolean {
    if (other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if (other instanceof StackItemBase) {
      // Note that we don't use serialize here because
      const thisValue = this.getBufferMaybe();
      const otherValue = other.getBufferMaybe();

      return thisValue !== undefined && otherValue !== undefined && thisValue.equals(otherValue);
    }

    return false;
  }

  // tslint:disable-next-line no-any
  public convertJSON(seen = new Set<StackItemBase>()): any {
    if (seen.has(this)) {
      return '<circular>';
    }
    const nextSeen = new Set(seen);
    nextSeen.add(this);

    return this.convertJSONInternal(nextSeen);
  }

  public isArray(): boolean {
    return false;
  }

  // tslint:disable-next-line readonly-array
  public getArray(): StackItem[] {
    throw new InvalidValueArrayError();
  }

  public getBigIntegerUnsafe(): BN {
    return utils.fromSignedBuffer(this.getBuffer());
  }

  public getBufferMaybe(): Buffer | undefined {
    try {
      return this.getBuffer();
    } catch {
      return undefined;
    }
  }

  public getBoolean(): boolean {
    return this.getBuffer().some((value) => value !== 0);
  }

  public get size(): number {
    /* istanbul ignore next */
    throw new Error('Unimplemented.');
  }

  public toStructuralKey(): string {
    return this.getBuffer().toString('hex');
  }

  public convertTo(type: StackItemType): StackItem {
    if (type === this.type) {
      return this;
    }
    if (type === StackItemType.Boolean) {
      return new BooleanStackItem(this.getBoolean());
    }

    throw new Error('Invalid type conversion');
  }

  protected incrementInternal(_seen: Set<StackItemBase>): number {
    return 0;
  }

  protected decrementInternal(_seen: Set<StackItemBase>): number {
    return 0;
  }

  protected incrementInternalArray(stackItems: readonly StackItem[], seen: Set<StackItemBase>): number {
    return stackItems.reduce((acc, val) => acc + val.increment(seen), 0);
  }

  protected decrementInternalArray(stackItems: readonly StackItem[], seen: Set<StackItemBase>): number {
    return stackItems.reduce((acc, val) => acc + val.decrement(seen), 0);
  }

  // tslint:disable-next-line no-any
  protected convertJSONInternal(_seen: Set<StackItemBase>): any {
    try {
      return this.getBuffer().toString('hex');
    } catch {
      return 'UNKNOWN';
    }
  }

  protected serializeInternal(_seen: Set<StackItemBase>): Buffer {
    const writer = new BinaryWriter();
    writer.writeUInt8(StackItemType.Buffer);
    writer.writeVarBytesLE(this.getBuffer());

    return writer.toBuffer();
  }
}
