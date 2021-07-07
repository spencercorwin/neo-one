import { ArrayStackItem } from './ArrayStackItem';
import { BlockStackItem } from './BlockStackItem';
import { BooleanStackItem } from './BooleanStackItem';
import { BufferStackItem } from './BufferStackItem';
import { ByteStringStackItem } from './ByteStringStackItem';
import { ConsensusPayloadStackItem } from './ConsensusPayloadStackItem';
import { ContractStackItem } from './ContractStackItem';
import { ECPointStackItem } from './ECPointStackItem';
import { HeaderStackItem } from './HeaderStackItem';
import { IntegerStackItem } from './IntegerStackItem';
import { IteratorStackItem } from './IteratorStackItem';
import { MapStackItem } from './MapStackItem';
import { NullStackItem } from './NullStackItem';
import { StorageContextStackItem } from './StorageContextStackItem';
import { StructStackItem } from './StructStackItem';
import { TransactionStackItem } from './TransactionStackItem';
import { UInt160StackItem } from './UInt160StackItem';
import { UInt256StackItem } from './UInt256StackItem';
import { WitnessStackItem } from './WitnessStackItem';

export type StackItem =
  | ArrayStackItem
  | BooleanStackItem
  | BufferStackItem
  | ConsensusPayloadStackItem
  | UInt160StackItem
  | UInt256StackItem
  | IntegerStackItem
  | HeaderStackItem
  | BlockStackItem
  | ContractStackItem
  | TransactionStackItem
  | IteratorStackItem
  | MapStackItem
  | StorageContextStackItem
  | ECPointStackItem
  | StructStackItem
  | WitnessStackItem
  | NullStackItem
  | ByteStringStackItem;
