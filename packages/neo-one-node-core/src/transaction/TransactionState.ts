import { UInt256 } from '@neo-one/client-common';
import { BN } from 'bn.js';
import { assertStructStackItem, BufferStackItem, IntegerStackItem, StackItem, StructStackItem } from '../StackItems';
import { Transaction } from './Transaction';

export type TransactionKey = UInt256;

export interface TransactionStateAdd {
  readonly blockIndex: number;
  readonly transaction: Transaction;
}

export class TransactionState {
  public static fromStackItem(stackItem: StackItem): TransactionState {
    const { array } = assertStructStackItem(stackItem);
    const blockIndex = array[0].getInteger();
    const transaction = Transaction.deserializeWire({
      buffer: array[1].getBuffer(),
      context: { network: 0, validatorsCount: 0, maxValidUntilBlockIncrement: 0 }, // TODO: Fix this
    });

    return new TransactionState({
      blockIndex: blockIndex.toNumber(),
      transaction,
    });
  }

  public readonly blockIndex: number;
  public readonly transaction: Transaction;

  public constructor({ blockIndex, transaction }: TransactionStateAdd) {
    this.blockIndex = blockIndex;
    this.transaction = transaction;
  }

  public toStackItem(): StackItem {
    return new StructStackItem([
      new IntegerStackItem(new BN(this.blockIndex)),
      new BufferStackItem(this.transaction.serializeWire()),
    ]);
  }
}
