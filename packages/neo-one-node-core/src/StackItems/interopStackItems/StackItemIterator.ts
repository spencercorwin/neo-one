/// <reference types="@reactivex/ix-es2015-cjs" />
import { AsyncIterableX } from '@reactivex/ix-es2015-cjs/asynciterable/asynciterablex';
import { concat } from '@reactivex/ix-es2015-cjs/asynciterable/concat';
import { map } from '@reactivex/ix-es2015-cjs/asynciterable/pipe/map';
import { StackItemBase } from '../StackItemBase';
import { InvalidStorageStackItemIteratorError } from './errors';

interface Value {
  readonly key: StackItemBase;
  readonly value: StackItemBase;
}

export class StackItemIterator {
  protected readonly iterator: AsyncIterator<Value>;
  protected mutableCurrent: Value | undefined;
  private mutableDone: boolean;

  public constructor(iterator: AsyncIterator<Value>) {
    this.iterator = iterator;
    this.mutableDone = false;
  }

  public key(): StackItemBase {
    const { mutableCurrent } = this;
    if (mutableCurrent === undefined) {
      throw new InvalidStorageStackItemIteratorError();
    }

    return mutableCurrent.key;
  }

  public keys(): StackItemIterator {
    const iterable = AsyncIterableX.from(this.iterator as AsyncIterableIterator<Value>).pipe<{
      value: StackItemBase;
    }>(map(({ key }) => ({ value: key })));

    return new StackItemIterator(iterable[Symbol.asyncIterator]());
  }

  public values(): StackItemIterator {
    const iterable = AsyncIterableX.from(this.iterator as AsyncIterableIterator<Value>).pipe<{
      value: StackItemBase;
    }>(map(({ value }) => ({ value })));

    return new StackItemIterator(iterable[Symbol.asyncIterator]());
  }

  public get done(): boolean {
    return this.mutableDone;
  }

  public equals(other: {}): boolean {
    return this === other;
  }

  public async next(): Promise<boolean> {
    if (!this.mutableDone) {
      const result = await this.iterator.next();
      this.mutableCurrent = result.done ? undefined : result.value;
      this.mutableDone = !!result.done;
      if (this.mutableDone) {
        return false;
      }

      return true;
    }

    return false;
  }

  public value(): StackItemBase {
    const { mutableCurrent } = this;
    if (mutableCurrent === undefined) {
      throw new InvalidStorageStackItemIteratorError();
    }

    return mutableCurrent.value;
  }

  public concat(other: StackItemIterator): StackItemIterator {
    const iterable = concat(
      AsyncIterableX.from<Value>(this.iterator as AsyncIterableIterator<Value>),
      AsyncIterableX.from<Value>(other.iterator as AsyncIterableIterator<Value>),
    );

    return new StackItemIterator(iterable[Symbol.asyncIterator]());
  }

  public concatIterator(other: StackItemIterator): StackItemIterator {
    const iterable = concat(
      AsyncIterableX.from(this.iterator as AsyncIterableIterator<Value>),
      AsyncIterableX.from(other.iterator as AsyncIterableIterator<Value>),
    );

    return new StackItemIterator(iterable[Symbol.asyncIterator]());
  }
}
