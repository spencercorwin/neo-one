import { assertStackItemType, BinaryReader, Script, StackItemType, utils } from '@neo-one/client-common';
import { utils as commonUtils } from '@neo-one/utils';
import { BN } from 'bn.js';
import _ from 'lodash';
import { ArrayStackItem } from './ArrayStackItem';
import { BooleanStackItem } from './BooleanStackItem';
import { BufferStackItem } from './BufferStackItem';
import { ByteStringStackItem } from './ByteStringStackItem';
import { UnsupportedStackItemSerdeError } from './errors';
import { IntegerStackItem } from './IntegerStackItem';
import { MapStackItem } from './MapStackItem';
import { NullStackItem } from './NullStackItem';
import { PointerStackItem } from './PointerStackItem';
import { StackItem } from './StackItems';
import { StructStackItem } from './StructStackItem';

export const MAX_ARRAY_SIZE_BN = new BN(1024);

const deserializeStackItemBase = (reader: BinaryReader): StackItem => {
  const type = assertStackItemType(reader.readUInt8());
  switch (type) {
    case StackItemType.Any:
      return new NullStackItem();
    case StackItemType.Pointer:
      const position = reader.readInt32LE();
      const script = new Script(reader.readVarBytesLE());

      return new PointerStackItem({ script, position });
    case StackItemType.ByteString:
      return new ByteStringStackItem(reader.readVarBytesLE());
    case StackItemType.Buffer:
      return new BufferStackItem(reader.readVarBytesLE());
    case StackItemType.Boolean:
      return new BooleanStackItem(reader.readBoolean());
    case StackItemType.Integer:
      return new IntegerStackItem(utils.fromSignedBuffer(reader.readVarBytesLE()));
    case StackItemType.InteropInterface:
      /* istanbul ignore next */
      throw new UnsupportedStackItemSerdeError();
    case StackItemType.Array:
    case StackItemType.Struct: {
      const count = reader.readVarUIntLE(MAX_ARRAY_SIZE_BN).toNumber();
      const value = _.range(count).map(() => deserializeStackItemBase(reader));

      return type === StackItemType.Array ? new ArrayStackItem(value) : new StructStackItem(value);
    }
    case StackItemType.Map: {
      const count = reader.readVarUIntLE(MAX_ARRAY_SIZE_BN).toNumber();
      const referenceKeys = new Map<string, StackItem>();
      const referenceValues = new Map<string, StackItem>();
      _.range(count).forEach(() => {
        const key = deserializeStackItemBase(reader);
        const value = deserializeStackItemBase(reader);
        const referenceKey = key.toStructuralKey();
        referenceKeys.set(referenceKey, key);
        referenceValues.set(referenceKey, value);
      });

      return new MapStackItem({ referenceKeys, referenceValues });
    }
    /* istanbul ignore next */
    default:
      commonUtils.assertNever(type);
      throw new Error('For TS');
  }
};

export const deserializeStackItem = (value: Buffer): StackItem => deserializeStackItemBase(new BinaryReader(value));
