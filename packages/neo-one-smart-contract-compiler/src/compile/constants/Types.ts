export enum Types {
  Undefined = 1,
  Null = 2,
  Boolean = 3,
  String = 4,
  Symbol = 5,
  Number = 6,
  Object = 7,
  Array = 8,
  Buffer = 9,
  Map = 10,
  Set = 11,
  ForwardValue = 12,
  IteratorResult = 13,
  IterableIterator = 14,
  Error = 15,
  ArrayStorage = 16,
  MapStorage = 17,
  SetStorage = 18,
  Transaction = 19,
  Attribute = 20,
  Contract = 21,
  Block = 22,
  Notification = 23,
  // Fake type, never appears
  Iterable = 24,
}

export type WrappableType =
  | Types.Boolean
  | Types.String
  | Types.Symbol
  | Types.Number
  | Types.Object
  | Types.Array
  | Types.Buffer
  | Types.Map
  | Types.Set
  | Types.ForwardValue
  | Types.IteratorResult
  | Types.IterableIterator
  | Types.Error
  | Types.ArrayStorage
  | Types.MapStorage
  | Types.SetStorage
  | Types.Transaction
  | Types.Attribute
  | Types.Contract
  | Types.Block
  | Types.Notification;

export type IterableTypes =
  | Types.Array
  | Types.ArrayStorage
  | Types.Map
  | Types.MapStorage
  | Types.Set
  | Types.SetStorage
  | Types.IterableIterator;
