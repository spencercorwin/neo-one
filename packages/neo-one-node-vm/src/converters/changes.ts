import { Batch } from '@neo-one/node-core';

type ChangeType = 'Added' | 'Changed' | 'Deleted';

export interface ChangeReturn {
  readonly type: ChangeType;
  readonly key: Buffer;
  readonly value: Buffer;
}

export const parseChangeReturns = (changes: readonly ChangeReturn[]): readonly Batch[] =>
  changes.map(parseChangeReturn);

const parseChangeReturn = (change: ChangeReturn): Batch => {
  switch (change.type) {
    case 'Added':
      return {
        type: 'put',
        key: change.key,
        value: change.value,
      };

    case 'Changed':
      return {
        type: 'put',
        key: change.key,
        value: change.value,
      };

    case 'Deleted':
      return {
        type: 'del',
        key: change.key,
      };

    default:
      throw new Error('Invalid Change Type found');
  }
};
