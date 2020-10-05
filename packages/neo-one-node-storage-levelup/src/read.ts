// tslint:disable no-var-before-return prefer-immediate-return
import {
  ReadAllStorage,
  ReadFindStorage,
  ReadMetadataStorage,
  ReadStorage,
  StorageReturn,
  StreamOptions,
} from '@neo-one/node-core';
import { LevelUp } from 'levelup';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { KeyNotFoundError } from './errors';
import { streamToObservable } from './streamToObservable';

type SerializeKey<Key> = (key: Key) => Buffer;

export function createTryGet<Key, Value>({
  get,
}: {
  readonly get: (key: Key) => Promise<Value>;
}): (key: Key) => Promise<Value | undefined> {
  return async (key: Key): Promise<Value | undefined> => {
    try {
      const result = await get(key);

      return result;
    } catch (error) {
      if (error.notFound || error.code === 'KEY_NOT_FOUND') {
        return undefined;
      }
      throw error;
    }
  };
}

// TODO: we haven't implemented any `tryGetLatest` functions, should we reimplement for something?
// export function createTryGetLatest<Key, Value>({
//   db,
//   latestKey,
//   deserializeResult,
//   get,
// }: {
//   readonly db: LevelUp;
//   readonly latestKey: string;
//   readonly deserializeResult: (latestResult: Buffer) => Key;
//   readonly get: (key: Key) => Promise<Value>;
// }): () => Promise<Value | undefined> {
//   return async (): Promise<Value | undefined> => {
//     try {
//       const result = await db.get(latestKey);
//       const value = await get(deserializeResult(result as Buffer));

//       return value;
//     } catch (error) {
//       if (error.notFound || error.code === 'KEY_NOT_FOUND') {
//         return undefined;
//       }
//       throw error;
//     }
//   };
// }

export function createReadStorage<Key, Value>({
  db,
  serializeKey,
  deserializeValue,
}: {
  readonly db: LevelUp;
  readonly serializeKey: SerializeKey<Key>;
  readonly deserializeValue: (value: Buffer) => Value;
}): ReadStorage<Key, Value> {
  const get = async (key: Key): Promise<Value> => {
    const serialized = serializeKey(key);
    try {
      const result = await db.get(serialized);

      return deserializeValue(result as Buffer);
    } catch (error) {
      if (error.notFound || error.code === 'KEY_NOT_FOUND') {
        throw new KeyNotFoundError(serialized.toString('hex'));
      }

      throw error;
    }
  };

  return { get, tryGet: createTryGet({ get }) };
}

export function createAll$<Value>({
  db,
  range,
  deserializeValue,
}: {
  readonly db: LevelUp;
  readonly range: StreamOptions;
  readonly deserializeValue: (value: Buffer) => Value;
}): Observable<Value> {
  return streamToObservable(() => db.createValueStream(range)).pipe(map(deserializeValue));
}

export function createReadAllStorage<Key, Value>({
  db,
  serializeKey,
  range,
  deserializeValue,
}: {
  readonly db: LevelUp;
  readonly serializeKey: SerializeKey<Key>;
  readonly range: StreamOptions;
  readonly deserializeValue: (value: Buffer) => Value;
}): ReadAllStorage<Key, Value> {
  const readStorage = createReadStorage({
    db,
    serializeKey,
    deserializeValue,
  });

  return {
    get: readStorage.get,
    tryGet: readStorage.tryGet,
    all$: createAll$({ db, range, deserializeValue }),
  };
}

export function createFind$<Key, Value>({
  db,
  deserializeKey,
  deserializeValue,
}: {
  readonly db: LevelUp;
  readonly deserializeKey: (key: Buffer) => Key;
  readonly deserializeValue: (value: Buffer) => Value;
}): (range: StreamOptions) => Observable<StorageReturn<Key, Value>> {
  return (range: StreamOptions) =>
    streamToObservable<StorageReturn<Buffer, Buffer>>(() => db.createReadStream(range)).pipe(
      map(({ key, value }) => ({ key: deserializeKey(key), value: deserializeValue(value) })),
    );
}

export function createReadFindStorage<Key, Value>({
  db,
  serializeKey,
  deserializeKey,
  deserializeValue,
}: {
  readonly db: LevelUp;
  readonly serializeKey: SerializeKey<Key>;
  readonly deserializeKey: (value: Buffer) => Key;
  readonly deserializeValue: (value: Buffer) => Value;
}): ReadFindStorage<Key, Value> {
  const readStorage = createReadStorage({
    db,
    serializeKey,
    deserializeValue,
  });

  return {
    get: readStorage.get,
    tryGet: readStorage.tryGet,
    find$: createFind$({
      db,
      deserializeKey,
      deserializeValue,
    }),
  };
}

// TODO: do we need to reimplement this for something?
// export function createReadGetAllStorage<Key, Value>({
//   db,
//   serializeKey,
//   getMinKey,
//   getMaxKey,
//   deserializeValue,
// }: {
//   readonly db: LevelUp;
//   readonly serializeKey: SerializeKey<Key>;
//   readonly getMinKey: (keys: Keys) => string;
//   readonly getMaxKey: (keys: Keys) => string;
//   readonly deserializeValue: (value: Buffer) => Value;
// }): ReadGetAllStorage<Key, Keys, Value> {
//   const readStorage = createReadStorage({
//     db,
//     serializeKey,
//     deserializeValue,
//   });

//   return {
//     get: readStorage.get,
//     tryGet: readStorage.tryGet,
//     getAll$: (keys: Keys) =>
//       createAll$({
//         db,
//         minKey: getMinKey(keys),
//         maxKey: getMaxKey(keys),
//         deserializeValue,
//       }),
//   };
// }

export function createTryGetMetadata<Value>({
  get,
}: {
  readonly get: () => Promise<Value>;
}): () => Promise<Value | undefined> {
  return async (): Promise<Value | undefined> => {
    try {
      const result = await get();

      return result;
    } catch (error) {
      if (error.notFound || error.code === 'KEY_NOT_FOUND') {
        return undefined;
      }
      throw error;
    }
  };
}

export function createReadMetadataStorage<Value>({
  db,
  key,
  deserializeValue,
}: {
  readonly db: LevelUp;
  readonly key: Buffer;
  readonly deserializeValue: (value: Buffer) => Value;
}): ReadMetadataStorage<Value> {
  const get = async (): Promise<Value> => {
    try {
      const result = await db.get(key);

      return deserializeValue(result as Buffer);
    } catch (error) {
      if (error.notFound || error.code === 'KEY_NOT_FOUND') {
        throw new KeyNotFoundError(key.toString('hex'));
      }

      throw error;
    }
  };

  return { get, tryGet: createTryGet({ get }) as ReadMetadataStorage<Value>['tryGet'] };
}
