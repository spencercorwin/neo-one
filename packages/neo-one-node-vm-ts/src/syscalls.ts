/// <reference types="@reactivex/ix-es2015-cjs" />
import {
  common,
  crypto,
  ECPoint,
  SysCall as SysCallEnum,
  SysCallName,
  toSysCallHashNum,
  TriggerType,
  UInt160,
} from '@neo-one/client-common';
import {
  BinaryReader,
  BlockStackItem,
  BooleanStackItem,
  BufferStackItem,
  ConsensusPayloadStackItem,
  HeaderStackItem,
  IntegerStackItem,
  IteratorStackItem,
  ScriptContainerType,
  StackItem,
  StackItemIterator,
  StorageContextStackItem,
  StorageItem,
  StorageKey,
  TransactionStackItem,
  utils,
} from '@neo-one/node-core';
import { utils as commonUtils } from '@neo-one/utils';
import { AsyncIterableX } from '@reactivex/ix-es2015-cjs/asynciterable/asynciterablex';
import { map as asyncMap } from '@reactivex/ix-es2015-cjs/asynciterable/pipe/map';
import { BN } from 'bn.js';
import _ from 'lodash';
import { ExecutionContext, FEES, OpInvoke, SysCall } from './constants';
import { InvalidVerifySyscallError, ItemTooLargeError, StackUnderflowError, UnknownSysCallHashError } from './errors';
import { vmUtils } from './vmUtils';

export interface CreateSysCallArgs {
  readonly context: ExecutionContext;
}
export type CreateSysCall = (input: CreateSysCallArgs) => SysCall;

export const createSysCall =
  ({
    name,
    in: _in = 0,
    inTry = 0,
    out = 0,
    outTry = 0,
    invocation = 0,
    fee = FEES.ONE,
    invoke,
  }: {
    readonly name: SysCallName;
    readonly in?: number;
    readonly inTry?: number;
    readonly out?: number;
    readonly outTry?: number;
    readonly invocation?: number;
    readonly fee?: BN;
    readonly invoke: OpInvoke;
  }): CreateSysCall =>
  ({ context }) => ({
    context,
    name,
    in: _in,
    inTry,
    out,
    outTry,
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
      scriptHashesForVerifying = scriptContainer.value.getScriptHashesForVerifying();

      break;
    case ScriptContainerType.Block:
      scriptHashesForVerifying = await scriptContainer.value.getScriptHashesForVerifying();

      break;
    case ScriptContainerType.ExtensiblePayload:
      scriptHashesForVerifying = scriptContainer.value.getScriptHashesForVerifying();

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

const createPut =
  ({ name }: { readonly name: 'System.Storage.Put' }) =>
  ({ context: contextIn }: CreateSysCallArgs) => {
    const keyIn = contextIn.stack[1] as StackItem | undefined;
    const valueIn = contextIn.stack[2] as StackItem | undefined;
    const expectedIn = 3;
    if (keyIn === undefined || valueIn === undefined) {
      throw new StackUnderflowError(contextIn, 'SYSCALL', contextIn.stack.length, expectedIn);
    }
    const ratio = new BN(keyIn.getBuffer().length)
      .add(new BN(valueIn.getBuffer().length))
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

        const key = args[1].getBuffer();
        if (key.length > 1024) {
          throw new ItemTooLargeError(context);
        }

        const value = args[2].getBuffer();
        const item = await context.blockchain.storages.tryGet({ hash, key });
        // if (item === undefined) {
        //   await context.blockchain.storages.add(new StorageItem({ hash, key, value, flags }));
        // } else if (hasStorageFlag(item.flags, StorageFlags.Constant)) {
        //   throw new ConstantStorageError(context, key);
        // } else {
        //   await context.blockchain.storages.update(item, { value, flags });
        // }
        if (item !== undefined) {
          await context.blockchain.storages.update(item, { value, flags });
        } else {
          await context.blockchain.storages.add(new StorageItem({ hash, key, value, flags }));
        }

        return { context };
      },
    })({ context: contextIn });
  };

export const SYSCALLS: { readonly [K in SysCallEnum]: CreateSysCall } = {
  'System.Contract.Call': createSysCall({
    name: 'System.Contract.Call',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Contract.CallNative': createSysCall({
    name: 'System.Contract.CallNative',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Contract.NativeOnPersist': createSysCall({
    name: 'System.Contract.NativeOnPersist',
    invoke: async ({ context }) => {
      if (context.init.triggerType !== TriggerType.OnPersist) {
        throw new Error('Invalid');
      }
      context.blockchain.nativeContracts.forEach((native) => {
        const updates = context.blockchain.settings.nativeUpdateHistory[native.name];
        if (updates.length !== 0 && updates[0] <= context.persistingBlock.index) {
          await native.onPersist();
        }
      });

      return { context };
    },
  }),
  'System.Contract.NativePostPersist': createSysCall({
    name: 'System.Contract.NativePostPersist',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Contract.CreateStandardAccount': createSysCall({
    name: 'System.Contract.CreateStandardAccount',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Contract.CreateMultisigAccount': createSysCall({
    name: 'System.Contract.CreateMultisigAccount',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Crypto.CheckSig': createSysCall({
    name: 'System.Crypto.CheckSig',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Crypto.CheckMultisig': createSysCall({
    name: 'System.Crypto.CheckMultisig',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Runtime.GetNetwork': createSysCall({
    name: 'System.Runtime.GetNetwork',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Runtime.GetRandom': createSysCall({
    name: 'System.Runtime.GetRandom',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Runtime.GetNotifications': createSysCall({
    name: 'System.Runtime.GetNotifications',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Runtime.GasLeft': createSysCall({
    name: 'System.Runtime.GasLeft',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Runtime.BurnGas': createSysCall({
    name: 'System.Runtime.BurnGas',
    invoke: ({ context }) => ({ context }),
  }),
  'System.Iterator.Print': createSysCall({
    name: 'System.Iterator.Print',
    invoke: ({ context }) => ({ context }),
  }),

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
            hashOrPublicKey: args[0].getBuffer(),
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
            ? args[0].getArray().map((item) => item.toContractParameter())
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
          message: args[0].getString(),
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
          ? context.blockchain.currentBlock.timestamp.toNumber() + context.blockchain.settings.millisecondsPerBlock
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
    invoke: async ({ context }) => {
      const contract = await context.blockchain.getContract(context.scriptHash);
      if (contract === undefined) {
        throw new Error('Contract not found');
      }

      return { context, results: [new StorageContextStackItem(contract.id)] };
    },
  }),

  'System.Storage.GetReadOnlyContext': createSysCall({
    name: 'System.Storage.GetReadOnlyContext',
    out: 1,
    invoke: async ({ context }) => {
      const contract = await context.blockchain.getContract(context.scriptHash);
      if (contract === undefined) {
        throw new Error('Contract not found');
      }

      return { context, results: [new StorageContextStackItem(contract.id).asReadOnly()] };
    },
  }),

  'System.Storage.Get': createSysCall({
    name: 'System.Storage.Get',
    in: 2,
    out: 1,
    fee: FEES.ONE_HUNDRED,
    invoke: async ({ context, args }) => {
      const hash = vmUtils.toStorageContext({ context, value: args[0] }).value;
      // pass variable: isreadonly: true which will throw if the storage context is readonly and
      // this method is trying to modify storage
      const stgContext = args[0].asStorageContext();

      const item = await context.blockchain.storages.tryGet(new StorageKey({ id, key: args[1].getBuffer() }));

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

      const prefix = args[1].getBuffer();
      const findOptions = args[2].getInteger();
      const iterable = AsyncIterableX.from<StorageItem>(context.blockchain.storages.find$('', '')).pipe<{
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

  'System.Storage.Put': createPut({ name: 'System.Storage.Put' }),

  'System.Storage.Delete': createSysCall({
    name: 'System.Storage.Delete',
    in: 1,
    fee: FEES.ONE_HUNDRED,
    invoke: async ({ context, args }) => {
      const hash = vmUtils.toStorageContext({
        context,
        value: args[0],
        write: true,
      }).value;
      const key = args[1].getBuffer();
      const storageKey = new StorageKey({ id, key });
      const existing = await context.blockchain.storages.tryGet(storageKey);
      if (existing !== undefined) {
        await context.blockchain.storages.delete({ hash, key });
      }

      return { context };
    },
  }),

  'System.Runtime.GetScriptContainer': createSysCall({
    name: 'System.Runtime.GetScriptContainer',
    out: 1,
    invoke: async ({ context }) => {
      // Transaction = 0x00,
      // Block = 0x01,
      // Header = 0x02,
      // Signers = 0x03,
      // ExtensiblePayload = 0x04,

      // Tx, TxState, ContractState, NotifyEventARgs, ContractABI, ContractEvent, ContractGroup
      // ContractManifest, ContractMethod, ContractParam, Permission, AccountState, HashIndexState
      // native contracts
      // Trimmed block

      let result;
      const { scriptContainer } = context.init;
      switch (scriptContainer.type) {
        case ScriptContainerType.Transaction:
          result = scriptContainer.value.toStackItem();
          break;
        case ScriptContainerType.Block:
          result = scriptContainer.value.toStackItem();
          break;
        case ScriptContainerType.ExtensiblePayload:
          result = new ConsensusPayloadStackItem(scriptContainer.value);
          break;
        case ScriptContainerType.Header:
          result = new HeaderStackItem(scriptContainer.value);
          break;
        case ScriptContainerType.Signers:
          result = new SignersStackItem(scriptContainer.value);
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
      results: [new BufferStackItem(context.scriptHash)],
    }),
  }),

  'System.Runtime.GetCallingScriptHash': createSysCall({
    name: 'System.Runtime.GetCallingScriptHash',
    out: 1,
    invoke: async ({ context }) => ({
      context,
      results: [
        context.scriptHashStack.length > 1
          ? new BufferStackItem(context.scriptHashStack[1])
          : new BufferStackItem(Buffer.alloc(0, 0)),
      ],
    }),
  }),

  'System.Runtime.GetEntryScriptHash': createSysCall({
    name: 'System.Runtime.GetEntryScriptHash',
    out: 1,
    invoke: async ({ context }) => ({
      context,
      results: [new BufferStackItem(context.scriptHashStack[context.scriptHashStack.length - 1])],
    }),
  }),
};

const SYSCALLS_BY_HASH = _.fromPairs(
  Object.entries(SYSCALLS).map(([key, value]) => [toSysCallHashNum(key as SysCallEnum), value]),
);

export const lookupSysCall = ({ context }: { readonly context: ExecutionContext }) => {
  const { code, pc } = context;
  const reader = new BinaryReader(code, pc);
  const key = reader.readUInt32LE();
  const createCall = SYSCALLS_BY_HASH[key];
  // tslint:disable-next-line: strict-type-predicates
  if (createCall === undefined) {
    throw new UnknownSysCallHashError(context, key);
  }

  const nextContext = {
    ...context,
    pc: reader.index,
  };

  return createCall({ context: nextContext });
};
