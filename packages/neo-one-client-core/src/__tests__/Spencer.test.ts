// tslint:disable no-object-mutation
import { ReadClient } from '@neo-one/client-full-core';
import { AsyncIterableX } from '@reactivex/ix-es2015-cjs/asynciterable';
import _ from 'lodash';
import { NEOONEDataProvider } from '../provider';

const rpcURL = 'https://staging.neotracker.io/rpc';

describe('AsyncBlockIterator', () => {
  test('any', async () => {
    const client = new ReadClient(
      new NEOONEDataProvider({
        network: 'test',
        rpcURL,
      }),
    );

    const blocks = client.iterBlocks({
      indexStart: 0,
    });

    await AsyncIterableX.from(blocks).forEach(async (blockJSON) => {
      console.log(blockJSON.header.index);
    });
  });
});
