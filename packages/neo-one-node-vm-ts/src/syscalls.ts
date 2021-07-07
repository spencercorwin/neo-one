/// <reference types="@reactivex/ix-es2015-cjs" />
import {
  assertStorageFlags,
  assertSysCall,
  common,
  crypto,
  ECPoint,
  hasStorageFlag,
  SysCall as SysCallEnum,
  SysCallHash,
  SysCallName,
  toSysCallHash,
  TriggerType,
  UInt160,
} from '@neo-one/client-common';
import { BinaryReader, ScriptContainerType, StorageFlags, StorageItem, utils } from '@neo-one/node-core';
import { utils as commonUtils } from '@neo-one/utils';
import { AsyncIterableX } from '@reactivex/ix-es2015-cjs/asynciterable/asynciterablex';
import { map as asyncMap } from '@reactivex/ix-es2015-cjs/asynciterable/pipe/map';
import { BN } from 'bn.js';
import _ from 'lodash';
import { ExecutionContext, FEES, OpInvoke, SysCall } from './constants';
import {
  ConstantStorageError,
  ContractNoStorageError,
  InvalidVerifySyscallError,
  ItemTooLargeError,
  StackUnderflowError,
  UnknownSysCallError,
} from './errors';
import {
  AccountStackItem,
  ArrayStackItem,
  AssetStackItem,
  AttributeStackItem,
  BlockStackItem,
  BooleanStackItem,
  BufferStackItem,
  ConsensusPayloadStackItem,
  ContractStackItem,
  deserializeStackItem,
  ECPointStackItem,
  EnumeratorStackItem,
  HeaderStackItem,
  InputStackItem,
  IntegerStackItem,
  IteratorStackItem,
  OutputStackItem,
  StackItem,
  StackItemEnumerator,
  StackItemIterator,
  StorageContextStackItem,
  TransactionStackItem,
  UInt160StackItem,
  UInt256StackItem,
  ValidatorStackItem,
  WitnessStackItem,
} from './stackItem';
import { vmUtils } from './vmUtils';

export interface CreateSysCallArgs {
  readonly context: ExecutionContext;
}
export type CreateSysCall = (input: CreateSysCallArgs) => SysCall;

export const createSysCall =
  ({
    name,
    in: _in = 0,
    inAlt = 0,
    out = 0,
    outAlt = 0,
    invocation = 0,
    fee = FEES.ONE,
    invoke,
  }: {
    readonly name: SysCallName;
    readonly in?: number;
    readonly inAlt?: number;
    readonly out?: number;
    readonly outAlt?: number;
    readonly invocation?: number;
    readonly fee?: BN;
    readonly invoke: OpInvoke;
  }): CreateSysCall =>
  ({ context }) => ({
    context,
    name,
    in: _in,
    inAlt,
    out,
    outAlt,
    invocation,
    fee,
    invoke,
  });

const checkWitness = async ({ context, hash }: { readonly context: ExecutionContext; readonly hash: UInt160 }) => {
  const { scriptContainer, skipWitnessVerify } = context.init;
  if (skipWitnessVerify) {
    return true;
  }

  let scriptHashesForVerifying;
  switch (scriptContainer.type) {
    case ScriptContainerType.Transaction:
      scriptHashesForVerifying = await scriptContainer.value.getScriptHashesForVerifying({
        getOutput: context.blockchain.output.get,
        getAsset: context.blockchain.asset.get,
      });

      break;
    case ScriptContainerType.Block:
      scriptHashesForVerifying = await scriptContainer.value.getScriptHashesForVerifying({
        getHeader: context.blockchain.header.get,
      });

      break;
    case ScriptContainerType.Consensus:
      scriptHashesForVerifying = await scriptContainer.value.getScriptHashesForVerifying({
        getValidators: async () => context.blockchain.getValidators([]),
        currentBlockHash: context.blockchain.currentBlock.hash,
      });

      break;
    default:
      commonUtils.assertNever(scriptContainer);
      throw new Error('For TS');
  }

  return scriptHashesForVerifying.has(common.uInt160ToHex(hash));
};

const checkWitnessPublicKey = async ({
  context,
  publicKey,
}: {
  readonly context: ExecutionContext;
  readonly publicKey: ECPoint;
}) =>
  checkWitness({
    context,
    hash: crypto.getVerificationScriptHash(publicKey),
  });

const checkWitnessBuffer = async ({
  context,
  hashOrPublicKey,
}: {
  readonly context: ExecutionContext;
  readonly hashOrPublicKey: Buffer;
}) => {
  if (hashOrPublicKey.length === common.ECPOINT_BUFFER_BYTES) {
    return checkWitnessPublicKey({
      context,
      publicKey: common.bufferToECPoint(hashOrPublicKey),
    });
  }

  return checkWitness({
    context,
    hash: common.bufferToUInt160(hashOrPublicKey),
  });
};

const checkStorage = async ({ context, hash }: { readonly context: ExecutionContext; readonly hash: UInt160 }) => {
  const contract = await context.blockchain.contract.get({ hash });
  if (!contract.hasStorage) {
    throw new ContractNoStorageError(context, common.uInt160ToString(hash));
  }

  return contract;
};

const createPut =
  ({ name }: { readonly name: 'System.Storage.Put' | 'System.Storage.PutEx' }) =>
  ({ context: contextIn }: CreateSysCallArgs) => {
    const keyIn = contextIn.stack[1] as StackItem | undefined;
    const valueIn = contextIn.stack[2] as StackItem | undefined;
    const expectedIn = name === 'System.Storage.Put' ? 3 : 4;
    if (keyIn === undefined || valueIn === undefined) {
      throw new StackUnderflowError(contextIn, 'SYSCALL', contextIn.stack.length, expectedIn);
    }
    const ratio = new BN(keyIn.asBuffer().length)
      .add(new BN(valueIn.asBuffer().length))
      .sub(utils.ONE)
      .div(utils.ONE_THOUSAND_TWENTY_FOUR)
      .add(utils.ONE);

    return createSysCall({
      name,
      in: expectedIn,
      fee: FEES.ONE_THOUSAND.mul(ratio),
      invoke: async ({ context, args }) => {
        if (context.init.triggerType !== TriggerType.Application) {
          throw new InvalidVerifySyscallError(context, name);
        }
        const hash = vmUtils.toStorageContext({
          context,
          value: args[0],
          write: true,
        }).value;
        await checkStorage({ context, hash });
        const key = args[1].asBuffer();
        if (key.length > 1024) {
          throw new ItemTooLargeError(context);
        }

        const value = args[2].asBuffer();
        const flags =
          name === 'System.Storage.Put'
            ? StorageFlags.None
            : assertStorageFlags(args[3].asBigIntegerUnsafe().toNumber());
        const item = await context.blockchain.storageItem.tryGet({ hash, key });
        // if (item === undefined) {
        //   await context.blockchain.storageItem.add(new StorageItem({ hash, key, value, flags }));
        // } else if (hasStorageFlag(item.flags, StorageFlags.Constant)) {
        //   throw new ConstantStorageError(context, key);
        // } else {
        //   await context.blockchain.storageItem.update(item, { value, flags });
        // }
        if (item !== undefined) {
          if (hasStorageFlag(item.flags, StorageFlags.Constant)) {
            throw new ConstantStorageError(context, key);
          }
          await context.blockchain.storageItem.update(item, { value, flags });
        } else {
          await context.blockchain.storageItem.add(new StorageItem({ hash, key, value, flags }));
        }

        return { context };
      },
    })({ context: contextIn });
  };

export const SYSCALLS: { readonly [K in SysCallEnum]: CreateSysCall } = {
  'System.Runtime.Platform': createSysCall({
    name: 'System.Runtime.Platform',
    out: 1,
    invoke: ({ context }) => ({
      context,
      results: [new BufferStackItem(Buffer.from('NEO', 'ascii'))],
    }),
  }),
  'System.Runtime.GetTrigger': createSysCall({
    name: 'System.Runtime.GetTrigger',
    out: 1,
    invoke: ({ context }) => ({
      context,
      results: [new IntegerStackItem(new BN(context.init.triggerType))],
    }),
  }),

  'System.Runtime.CheckWitness': createSysCall({
    name: 'System.Runtime.CheckWitness',
    in: 1,
    out: 1,
    fee: FEES.TWO_HUNDRED,
    invoke: async ({ context, args }) => ({
      context,
      results: [
        new BooleanStackItem(
          await checkWitnessBuffer({
            context,
            hashOrPublicKey: args[0].asBuffer(),
          }),
        ),
      ],
    }),
  }),

  'System.Runtime.Notify': createSysCall({
    name: 'System.Runtime.Notify',
    in: 1,
    invoke: async ({ context, args }) => {
      const { onNotify } = context.init.listeners;
      if (onNotify !== undefined) {
        onNotify({
          scriptHash: context.scriptHash,
          args: args[0].isArray()
            ? args[0].asArray().map((item) => item.toContractParameter())
            : [args[0].toContractParameter()],
        });
      }

      return { context };
    },
  }),

  'System.Runtime.Log': createSysCall({
    name: 'System.Runtime.Log',
    in: 1,
    invoke: async ({ context, args }) => {
      const { onLog } = context.init.listeners;
      if (onLog !== undefined) {
        onLog({
          scriptHash: context.scriptHash,
          message: args[0].asString(),
        });
      }

      return { context };
    },
  }),

  'System.Runtime.GetTime': createSysCall({
    name: 'System.Runtime.GetTime',
    out: 1,
    invoke: async ({ context }) => {
      const { persistingBlock } = context.init;
      const time =
        persistingBlock === undefined
          ? context.blockchain.currentBlock.timestamp + context.blockchain.settings.secondsPerBlock
          : persistingBlock.timestamp;

      return {
        context,
        results: [new IntegerStackItem(new BN(time))],
      };
    },
  }),

  'System.Storage.GetContext': createSysCall({
    name: 'System.Storage.GetContext',
    out: 1,
    invoke: ({ context }) => ({
      context,
      results: [new StorageContextStackItem(context.scriptHash)],
    }),
  }),

  'System.Storage.GetReadOnlyContext': createSysCall({
    name: 'System.Storage.GetReadOnlyContext',
    out: 1,
    invoke: ({ context }) => ({
      context,
      results: [new StorageContextStackItem(context.scriptHash).asReadOnly()],
    }),
  }),

  'System.Storage.Get': createSysCall({
    name: 'System.Storage.Get',
    in: 2,
    out: 1,
    fee: FEES.ONE_HUNDRED,
    invoke: async ({ context, args }) => {
      const hash = vmUtils.toStorageContext({ context, value: args[0] }).value;
      await checkStorage({ context, hash });

      const item = await context.blockchain.storageItem.tryGet({
        hash,
        key: args[1].asBuffer(),
      });

      const result = item === undefined ? Buffer.from([]) : item.value;

      return {
        context,
        results: [new BufferStackItem(result)],
      };
    },
  }),

  'System.Storage.Find': createSysCall({
    name: 'System.Storage.Find',
    in: 2,
    out: 1,
    invoke: async ({ context, args }) => {
      const hash = vmUtils.toStorageContext({ context, value: args[0] }).value;
      await checkStorage({ context, hash });

      const prefix = args[1].asBuffer();
      const iterable = AsyncIterableX.from<StorageItem>(context.blockchain.storageItem.getAll$({ hash, prefix })).pipe<{
        key: BufferStackItem;
        value: BufferStackItem;
      }>(
        asyncMap(({ key, value }) => ({
          key: new BufferStackItem(key),
          value: new BufferStackItem(value),
        })),
      );

      return {
        context,
        results: [new IteratorStackItem(new StackItemIterator(iterable[Symbol.asyncIterator]()))],
      };
    },
  }),

  'System.Iterator.Next': createSysCall({
    name: 'System.Iterator.Next',
    in: 1,
    out: 1,
    invoke: async ({ context, args }) => {
      const enumerator = args[0].asEnumerator();
      const value = await enumerator.next();

      return {
        context,
        results: [new BooleanStackItem(value)],
      };
    },
  }),

  'System.Iterator.Value': createSysCall({
    name: 'System.Iterator.Value',
    in: 1,
    out: 1,
    invoke: async ({ context, args }) => ({
      context,
      // tslint:disable-next-line no-any
      results: [args[0].asEnumerator().value() as any],
    }),
  }),

  'System.Storage.Put': createPut({ name: 'System.Storage.Put' }),

  'System.Storage.Delete': createSysCall({
    name: 'System.Storage.Delete',
    in: 2,
    fee: FEES.ONE_HUNDRED,
    invoke: async ({ context, args }) => {
      const hash = vmUtils.toStorageContext({
        context,
        value: args[0],
        write: true,
      }).value;
      await checkStorage({ context, hash });
      const key = args[1].asBuffer();
      const existing = await context.blockchain.storageItem.tryGet({ hash, key });
      if (existing !== undefined) {
        if (hasStorageFlag(existing.flags, StorageFlags.Constant)) {
          throw new ConstantStorageError(context, key);
        }

        await context.blockchain.storageItem.delete({ hash, key });
      }

      return { context };
    },
  }),

  'System.Runtime.GetScriptContainer': createSysCall({
    name: 'System.Runtime.GetScriptContainer',
    out: 1,
    invoke: async ({ context }) => {
      let result;
      const { scriptContainer } = context.init;
      switch (scriptContainer.type) {
        case ScriptContainerType.Transaction:
          result = new TransactionStackItem(scriptContainer.value);
          break;
        case ScriptContainerType.Block:
          result = new BlockStackItem(scriptContainer.value);
          break;
        case ScriptContainerType.Consensus:
          result = new ConsensusPayloadStackItem(scriptContainer.value);
          break;
        /* istanbul ignore next */
        default:
          commonUtils.assertNever(scriptContainer);
          throw new Error('For TS');
      }

      return { context, results: [result] };
    },
  }),

  'System.Runtime.GetExecutingScriptHash': createSysCall({
    name: 'System.Runtime.GetExecutingScriptHash',
    out: 1,
    invoke: async ({ context }) => ({
      context,
      results: [new UInt160StackItem(context.scriptHash)],
    }),
  }),

  'System.Runtime.GetCallingScriptHash': createSysCall({
    name: 'System.Runtime.GetCallingScriptHash',
    out: 1,
    invoke: async ({ context }) => ({
      context,
      results: [
        context.scriptHashStack.length > 1
          ? new UInt160StackItem(context.scriptHashStack[1])
          : new BufferStackItem(Buffer.alloc(0, 0)),
      ],
    }),
  }),

  'System.Runtime.GetEntryScriptHash': createSysCall({
    name: 'System.Runtime.GetEntryScriptHash',
    out: 1,
    invoke: async ({ context }) => ({
      context,
      results: [new UInt160StackItem(context.scriptHashStack[context.scriptHashStack.length - 1])],
    }),
  }),
};

export const SYSCALL_ALIASES: { readonly [key: string]: string | undefined } = {
  'Neo.Iterator.Next': 'Neo.Enumerator.Next',
  'Neo.Iterator.Value': 'Neo.Enumerator.Value',
  'System.Runtime.GetTrigger': 'Neo.Runtime.GetTrigger',
  'System.Runtime.CheckWitness': 'Neo.Runtime.CheckWitness',
  'System.Runtime.Notify': 'Neo.Runtime.Notify',
  'System.Runtime.Log': 'Neo.Runtime.Log',
  'System.Runtime.GetTime': 'Neo.Runtime.GetTime',
  'System.Runtime.Serialize': 'Neo.Runtime.Serialize',
  'System.Runtime.Deserialize': 'Neo.Runtime.Deserialize',
  'System.Blockchain.GetHeight': 'Neo.Blockchain.GetHeight',
  'System.Blockchain.GetHeader': 'Neo.Blockchain.GetHeader',
  'System.Blockchain.GetBlock': 'Neo.Blockchain.GetBlock',
  'System.Blockchain.GetTransaction': 'Neo.Blockchain.GetTransaction',
  'System.Blockchain.GetTransactionHeight': 'Neo.Blockchain.GetTransactionHeight',
  'System.Blockchain.GetContract': 'Neo.Blockchain.GetContract',
  'System.Header.GetIndex': 'Neo.Header.GetIndex',
  'System.Header.GetHash': 'Neo.Header.GetHash',
  'System.Header.GetPrevHash': 'Neo.Header.GetPrevHash',
  'System.Header.GetTimestamp': 'Neo.Header.GetTimestamp',
  'System.Block.GetTransactionCount': 'Neo.Block.GetTransactionCount',
  'System.Block.GetTransactions': 'Neo.Block.GetTransactions',
  'System.Block.GetTransaction': 'Neo.Block.GetTransaction',
  'System.Transaction.GetHash': 'Neo.Transaction.GetHash',
  'System.Contract.Destroy': 'Neo.Contract.Destroy',
  'System.Contract.GetStorageContext': 'Neo.Contract.GetStorageContext',
  'System.Storage.GetContext': 'Neo.Storage.GetContext',
  'System.Storage.GetReadOnlyContext': 'Neo.Storage.GetReadOnlyContext',
  'System.Storage.Get': 'Neo.Storage.Get',
  'System.Storage.Put': 'Neo.Storage.Put',
  'System.Storage.Delete': 'Neo.Storage.Delete',
  'System.StorageContext.AsReadOnly': 'Neo.StorageContext.AsReadOnly',
  'AntShares.Runtime.CheckWitness': 'Neo.Runtime.CheckWitness',
  'AntShares.Runtime.Notify': 'Neo.Runtime.Notify',
  'AntShares.Runtime.Log': 'Neo.Runtime.Log',
  'AntShares.Blockchain.GetHeight': 'Neo.Blockchain.GetHeight',
  'AntShares.Blockchain.GetHeader': 'Neo.Blockchain.GetHeader',
  'AntShares.Blockchain.GetBlock': 'Neo.Blockchain.GetBlock',
  'AntShares.Blockchain.GetTransaction': 'Neo.Blockchain.GetTransaction',
  'AntShares.Blockchain.GetAccount': 'Neo.Blockchain.GetAccount',
  'AntShares.Blockchain.GetValidators': 'Neo.Blockchain.GetValidators',
  'AntShares.Blockchain.GetAsset': 'Neo.Blockchain.GetAsset',
  'AntShares.Blockchain.GetContract': 'Neo.Blockchain.GetContract',
  'AntShares.Header.GetHash': 'Neo.Header.GetHash',
  'AntShares.Header.GetVersion': 'Neo.Header.GetVersion',
  'AntShares.Header.GetPrevHash': 'Neo.Header.GetPrevHash',
  'AntShares.Header.GetMerkleRoot': 'Neo.Header.GetMerkleRoot',
  'AntShares.Header.GetTimestamp': 'Neo.Header.GetTimestamp',
  'AntShares.Header.GetConsensusData': 'Neo.Header.GetConsensusData',
  'AntShares.Header.GetNextConsensus': 'Neo.Header.GetNextConsensus',
  'AntShares.Block.GetTransactionCount': 'Neo.Block.GetTransactionCount',
  'AntShares.Block.GetTransactions': 'Neo.Block.GetTransactions',
  'AntShares.Block.GetTransaction': 'Neo.Block.GetTransaction',
  'AntShares.Transaction.GetHash': 'Neo.Transaction.GetHash',
  'AntShares.Transaction.GetType': 'Neo.Transaction.GetType',
  'AntShares.Transaction.GetAttributes': 'Neo.Transaction.GetAttributes',
  'AntShares.Transaction.GetInputs': 'Neo.Transaction.GetInputs',
  'AntShares.Transaction.GetOutputs': 'Neo.Transaction.GetOutputs',
  'AntShares.Transaction.GetReferences': 'Neo.Transaction.GetReferences',
  'AntShares.Attribute.GetUsage': 'Neo.Attribute.GetUsage',
  'AntShares.Attribute.GetData': 'Neo.Attribute.GetData',
  'AntShares.Input.GetHash': 'Neo.Input.GetHash',
  'AntShares.Input.GetIndex': 'Neo.Input.GetIndex',
  'AntShares.Output.GetAssetId': 'Neo.Output.GetAssetId',
  'AntShares.Output.GetValue': 'Neo.Output.GetValue',
  'AntShares.Output.GetScriptHash': 'Neo.Output.GetScriptHash',
  'AntShares.Account.GetScriptHash': 'Neo.Account.GetScriptHash',
  'AntShares.Account.GetVotes': 'Neo.Account.GetVotes',
  'AntShares.Account.GetBalance': 'Neo.Account.GetBalance',
  'AntShares.Asset.GetAssetId': 'Neo.Asset.GetAssetId',
  'AntShares.Asset.GetAssetType': 'Neo.Asset.GetAssetType',
  'AntShares.Asset.GetAmount': 'Neo.Asset.GetAmount',
  'AntShares.Asset.GetAvailable': 'Neo.Asset.GetAvailable',
  'AntShares.Asset.GetPrecision': 'Neo.Asset.GetPrecision',
  'AntShares.Asset.GetOwner': 'Neo.Asset.GetOwner',
  'AntShares.Asset.GetAdmin': 'Neo.Asset.GetAdmin',
  'AntShares.Asset.GetIssuer': 'Neo.Asset.GetIssuer',
  'AntShares.Contract.GetScript': 'Neo.Contract.GetScript',
  'AntShares.Storage.GetContext': 'Neo.Storage.GetContext',
  'AntShares.Storage.Get': 'Neo.Storage.Get',
  'AntShares.Account.SetVotes': 'Neo.Account.SetVotes',
  'AntShares.Validator.Register': 'Neo.Validator.Register',
  'AntShares.Asset.Create': 'Neo.Asset.Create',
  'AntShares.Asset.Renew': 'Neo.Asset.Renew',
  'AntShares.Contract.Create': 'Neo.Contract.Create',
  'AntShares.Contract.Migrate': 'Neo.Contract.Migrate',
  'AntShares.Contract.GetStorageContext': 'Neo.Contract.GetStorageContext',
  'AntShares.Contract.Destroy': 'Neo.Contract.Destroy',
  'AntShares.Storage.Put': 'Neo.Storage.Put',
  'AntShares.Storage.Delete': 'Neo.Storage.Delete',
};

const SYS_CALL_STRING_LENGTH = 252;

const SYSCALLS_BY_HASH = _.fromPairs(
  Object.entries(SYSCALLS).map(([key, value]) => [toSysCallHash(key as SysCallEnum), value]),
);

export const lookupSysCall = ({ context }: { readonly context: ExecutionContext }) => {
  const { code, pc } = context;
  const reader = new BinaryReader(code, pc);

  const sysCallBytes = reader.readVarBytesLE(SYS_CALL_STRING_LENGTH);
  let key: SysCallHash;
  let debugName: string;
  if (sysCallBytes.length === 4) {
    key = sysCallBytes.readUInt32LE(0) as SysCallHash;
    debugName = sysCallBytes.toString('hex');
  } else {
    const sysCallName = utils.toASCII(sysCallBytes);
    const aliasName = SYSCALL_ALIASES[sysCallName];
    const canonicalName = aliasName === undefined ? sysCallName : aliasName;
    key = toSysCallHash(assertSysCall(canonicalName));
    debugName = canonicalName;
  }
  const createCall = SYSCALLS_BY_HASH[key];
  // tslint:disable-next-line: strict-type-predicates
  if (createCall === undefined) {
    throw new UnknownSysCallError(context, debugName);
  }

  const nextContext = {
    ...context,
    pc: reader.index,
  };

  return createCall({ context: nextContext });
};
