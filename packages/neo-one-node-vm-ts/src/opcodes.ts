import {
  assertStackItemType,
  BinaryReader,
  common,
  isStackItemType,
  Op as OpCodeToByteCode,
  OpCode,
  Script,
  StackItemType,
  UInt160,
  utils,
  VMState,
} from '@neo-one/client-common';
import {
  ArrayStackItem,
  assertArrayStackItem,
  assertBufferStackItem,
  assertCompoundStackItem,
  assertMapStackItem,
  assertPrimitiveStackItem,
  BooleanStackItem,
  BufferStackItem,
  ByteStringStackItem,
  IntegerStackItem,
  MapStackItem,
  NullStackItem,
  PointerStackItem,
  StackItem,
  StructStackItem,
} from '@neo-one/node-core';
import { utils as oneUtils } from '@neo-one/utils';
// tslint:disable-next-line:match-default-export-name
import bitwise from 'bitwise';
import { BN } from 'bn.js';
import { MAX_STACK_SIZE } from 'dist/cjs/constants';
import _ from 'lodash';
import { InvalidStackItemError } from '../../neo-one-node-core/src/errors';
import {
  ExecutionContext,
  ExecutionStack,
  FEES,
  MAX_ARRAY_SIZE,
  MAX_ITEM_SIZE,
  MAX_SHL_SHR,
  MIN_SHL_SHR,
  Op,
  OpInvoke,
} from './constants';
import {
  CodeOverflowError,
  ContainerTooLargeError,
  InsufficientReturnValueError,
  InvalidHasKeyIndexError,
  InvalidPackCountError,
  InvalidPickItemKeyError,
  InvalidRemoveIndexError,
  InvalidSetItemIndexError,
  InvalidStackItemTypeError,
  InvalidTailCallReturnValueError,
  ItemTooLargeError,
  LeftNegativeError,
  PickNegativeError,
  RightLengthError,
  RightNegativeError,
  RollNegativeError,
  ShiftTooLargeError,
  StackUnderflowError,
  SubstrNegativeEndError,
  SubstrNegativeStartError,
  ThrowError,
  UnknownOpError,
  XDropNegativeError,
  XDropUnderflowError,
} from './errors';
import { lookupSysCall } from './syscalls';
import { vmUtils } from './vmUtils';

export type CreateOp = (input: CreateOpArgs) => {
  readonly op: Op;
  readonly context: ExecutionContext;
};

interface OpStatic {
  readonly type: 'op';
  readonly op: Op;
}

interface OpCreate {
  readonly type: 'create';
  readonly create: CreateOp;
}

type OpObject = OpStatic | OpCreate;

export interface CreateOpArgs {
  readonly context: ExecutionContext;
}

export const createOp = ({
  name,
  in: _in = 0,
  inTry = 0,
  out = 0,
  outTry = 0,
  invocation = 0,
  fee: feeIn,
  invoke,
}: {
  readonly name: OpCode;
  readonly in?: number;
  readonly inTry?: number;
  readonly out?: number;
  readonly outTry?: number;
  readonly invocation?: number;
  readonly array?: number;
  readonly item?: number;
  readonly fee?: BN;
  readonly invoke: OpInvoke;
}): OpStatic => {
  let fee = feeIn;
  if (fee === undefined) {
    const byteCode = OpCodeToByteCode[name];
    fee = byteCode <= OpCodeToByteCode.NOP ? utils.ZERO : FEES.ONE;
  }

  return {
    type: 'op',
    op: {
      name,
      in: _in,
      inTry,
      out,
      outTry,
      invocation,
      fee,
      invoke,
    },
  };
};

const pushNumber = ({ name, value }: { readonly name: OpCode; readonly value: number }) =>
  createOp({
    name,
    out: 1,
    invoke: ({ context }) => ({
      context,
      results: [new IntegerStackItem(new BN(value))],
    }),
  });

const pushInt = ({ name, numBytes }: { readonly name: OpCode; readonly numBytes: 1 | 2 | 4 | 8 | 16 | 32 }) =>
  createOp({
    name,
    out: 1,
    invoke: ({ context }) => {
      const { code, pc } = context;
      const reader = new BinaryReader(code, pc);
      let readNum;
      switch (numBytes) {
        case 1:
          readNum = reader.readInt8();
          break;
        case 2:
          readNum = reader.readInt16LE();
          break;
        case 4:
          readNum = reader.readInt32LE();
          break;
        case 8:
          readNum = reader.readInt64LE();
          break;
        case 16:
          readNum = reader.readInt128LE();
          break;
        case 32:
          readNum = reader.readInt256LE();
          break;
        default:
          oneUtils.assertNever(numBytes);
          throw new Error('For TS');
      }

      return {
        context: {
          ...context,
          pc: pc + numBytes,
        },

        results: [new IntegerStackItem(new BN(readNum))],
      };
    },
  });

const pushData = ({ name, numBytes }: { readonly name: OpCode; readonly numBytes: 1 | 2 | 4 }) =>
  createOp({
    name,
    out: 1,
    invoke: ({ context }) => {
      const { code, pc } = context;
      let size;
      if (numBytes === 1) {
        size = code.readUInt8(context.pc);
      } else if (numBytes === 2) {
        size = code.readUInt16LE(pc);
      } else {
        size = code.readInt32LE(pc);
      }

      if (code.length < pc + numBytes + size - 1) {
        throw new CodeOverflowError(context);
      }

      const value = code.slice(pc + numBytes, pc + numBytes + size);
      if (value.length > MAX_ITEM_SIZE) {
        throw new ItemTooLargeError(context);
      }

      return {
        context: {
          ...context,
          pc: pc + numBytes + size,
        },

        results: [new BufferStackItem(value)],
      };
    },
  });

const loadFromSlot = ({
  getSlot,
  index,
  name,
}: {
  // tslint:disable-next-line: readonly-array
  readonly getSlot: (ctx: ExecutionContext) => StackItem[] | undefined;
  readonly index?: number;
  readonly name: OpCode;
}) =>
  createOp({
    name,
    out: 1,
    invoke: ({ context }) => {
      const slot = getSlot(context);
      if (slot === undefined) {
        throw new Error('Slot has not been initialized');
      }

      const realIndex = index === undefined ? context.code.readUInt8(context.pc) : index;

      if (realIndex < 0 || realIndex >= slot.length) {
        throw new Error(`Index out of range when loading from slot: ${realIndex}`);
      }

      // TODO: what if this register doesn't contain anything? Push null? Or push nothing?
      return {
        context: { ...context, pc: index === undefined ? context.pc + 1 : context.pc },
        results: [slot[realIndex]],
      };
    },
  });

const storeToSlot = ({
  name,
  index,
  getSlot,
}: {
  readonly name: OpCode;
  readonly index?: number;
  // tslint:disable-next-line: readonly-array
  readonly getSlot: (ctx: ExecutionContext) => StackItem[] | undefined;
}) =>
  createOp({
    name,
    in: 1,
    invoke: ({ context, args }) => {
      const slot = getSlot(context);
      if (slot === undefined) {
        throw new Error('Slot has not been initialized');
      }

      const realIndex = index === undefined ? context.code.readUInt8(context.pc) : index;

      if (realIndex < 0 || realIndex >= slot.length) {
        throw new Error(`Index out of range when loading from slot: ${realIndex}`);
      }

      // tslint:disable-next-line: no-array-mutation no-object-mutation
      slot[realIndex] = args[0];

      return { context: { ...context, pc: index === undefined ? context.pc + 1 : context.pc } };
    },
  });

const jump = ({
  name,
  checkTrue,
  long,
  jmpCheck,
}: {
  readonly name: OpCode;
  readonly checkTrue?: boolean;
  readonly long: boolean;
  readonly jmpCheck?: (args: readonly StackItem[]) => boolean;
}) =>
  createOp({
    name,
    in: checkTrue === undefined ? 0 : jmpCheck !== undefined ? 2 : 1,
    invoke: ({ context, args }) => {
      const { code } = context;
      let { pc } = context;
      const offset = long ? code.readInt32LE(pc) : code.readInt8(pc);
      pc += long ? 3 : 1;
      const newPC = pc + offset - (long ? 4 : 2);
      if (newPC < 0 || newPC > code.length) {
        throw new CodeOverflowError(context);
      }

      let shouldJump = true;
      if (checkTrue !== undefined) {
        shouldJump = jmpCheck === undefined ? args[0].getBoolean() : jmpCheck(args);
        if (!checkTrue) {
          shouldJump = !shouldJump;
        }
      }

      return {
        context: {
          ...context,
          pc: shouldJump ? newPC : pc,
        },
      };
    },
  });

const isDynamic = (hash: UInt160) => common.uInt160ToBuffer(hash).every((value) => value === 0);

const call = ({ name, tailCall }: { readonly name: OpCode; readonly tailCall?: boolean }): OpCreate => ({
  type: 'create',
  create: ({ context: contextIn }) => {
    const hashIn = common.bufferToUInt160(contextIn.code.slice(contextIn.pc, contextIn.pc + 20));

    const { op } = createOp({
      name,
      in: isDynamic(hashIn) ? 1 : 0,
      invocation: tailCall ? 0 : 1,
      fee: FEES.TEN,
      invoke: async ({ context, args }) => {
        const { pc, scriptHash } = context;
        let hash = common.bufferToUInt160(context.code.slice(pc, pc + 20));
        if (isDynamic(hash)) {
          hash = common.bufferToUInt160(args[0].getBuffer());

          const executingContract = await context.blockchain.getContract(scriptHash);
        }
        const contract = await context.blockchain.getContract(hash);
        const scriptHashStack = [hash, ...context.scriptHashStack];
        const resultContext = await context.engine.executeScript({
          code: contract.script,
          blockchain: context.blockchain,
          init: context.init,
          gasLeft: context.gasLeft,
          options: {
            stack: context.stack,
            stackTry: context.stackTry,
            depth: tailCall ? context.depth : context.depth + 1,
            createdContracts: context.createdContracts,
            scriptHashStack: tailCall ? scriptHashStack.slice(0, scriptHashStack.length - 1) : scriptHashStack,
            scriptHash: context.scriptHash,
            entryScriptHash: context.entryScriptHash,
            returnValueCount: -1,
            stackCount: context.stackCount,
            staticFields: context.staticFields,
            localVariables: context.localVariables,
            arguments: context.arguments,
          },
        });

        let { state } = resultContext;
        if (state === VMState.HALT) {
          // If it's a tail call, then the final recursive call executes the rest
          // of the script, and we just return immediately here.
          state = tailCall ? VMState.HALT : context.state;
        }

        return {
          context: {
            state,
            errorMessage: resultContext.errorMessage,
            blockchain: context.blockchain,
            init: context.init,
            engine: context.engine,
            code: context.code,
            scriptHashStack: tailCall
              ? context.scriptHashStack.slice(0, context.scriptHashStack.length - 1)
              : context.scriptHashStack,
            scriptHash: context.scriptHash,
            callingScriptHash: context.callingScriptHash,
            entryScriptHash: context.entryScriptHash,
            pc: pc + 20,
            depth: context.depth,
            returnValueCount: context.returnValueCount,
            stackCount: resultContext.stackCount,
            stack: resultContext.stack,
            stackTry: resultContext.stackTry,
            gasLeft: resultContext.gasLeft,
            createdContracts: resultContext.createdContracts,
            // TODO: check this
            staticFields: resultContext.staticFields,
            localVariables: resultContext.localVariables,
            arguments: resultContext.arguments,
          },
        };
      },
    });

    return { op, context: contextIn };
  },
});

const callIsolated = ({
  name,
  dynamicCall,
  tailCall,
}: {
  readonly name: OpCode;
  readonly dynamicCall?: boolean;
  readonly tailCall?: boolean;
}): OpCreate => ({
  type: 'create',
  create: ({ context: contextIn }) => {
    const returnValueCount = contextIn.code.slice(contextIn.pc, contextIn.pc + 1)[0];
    const parametersCount = contextIn.code.slice(contextIn.pc + 1, contextIn.pc + 2)[0];

    const nextPC = dynamicCall ? contextIn.pc + 2 : contextIn.pc + 22;

    const { op } = createOp({
      name,
      in: parametersCount + (dynamicCall ? 1 : 0),
      invocation: tailCall ? 0 : 1,
      invoke: async ({ context, args }) => {
        const { pc, scriptHash } = context;
        const hash = dynamicCall
          ? common.bufferToUInt160(args[0].getBuffer())
          : common.bufferToUInt160(context.code.slice(pc + 2, pc + 22));

        if (tailCall && context.returnValueCount !== returnValueCount) {
          throw new InvalidTailCallReturnValueError(context, context.returnValueCount, returnValueCount);
        }

        if (dynamicCall) {
          const executingContract = await context.blockchain.getContract(scriptHash);
        }

        const contract = await context.blockchain.getContract(hash);
        const nextStack = dynamicCall ? args.slice(1) : args;
        const scriptHashStack = [hash, ...context.scriptHashStack];

        const resultContext = await context.engine.executeScript({
          code: contract.script,
          blockchain: context.blockchain,
          init: context.init,
          gasLeft: context.gasLeft,
          options: {
            stack: nextStack,
            stackTry: [],
            depth: tailCall ? context.depth : context.depth + 1,
            createdContracts: context.createdContracts,
            scriptHashStack: tailCall ? scriptHashStack.slice(0, scriptHashStack.length - 1) : scriptHashStack,
            scriptHash: context.scriptHash,
            entryScriptHash: context.entryScriptHash,
            returnValueCount,
            stackCount: context.stackCount + nextStack.reduce((acc, value) => acc + value.increment(), 0),
            // TODO: check this
            staticFields: context.staticFields,
            localVariables: context.localVariables,
            arguments: context.arguments,
          },
        });

        let { state, stackCount } = resultContext;
        if (state === VMState.HALT) {
          // If it's a tail call, then the final recursive call executes the rest
          // of the script, and we just return immediately here.
          state = tailCall ? VMState.HALT : context.state;
        }

        let stack: ExecutionStack = [];
        if (returnValueCount === -1) {
          stack = resultContext.stack;
        } else if (returnValueCount > 0) {
          if (resultContext.state === VMState.HALT && resultContext.stack.length < returnValueCount) {
            throw new InsufficientReturnValueError(context, resultContext.stack.length, returnValueCount);
          }

          stack = resultContext.stack.slice(0, returnValueCount);
          stackCount += resultContext.stack.slice(returnValueCount).reduce((acc, value) => acc + value.decrement(), 0);
        }

        stackCount += resultContext.stackTry.reduce((acc, value) => acc + value.decrement(), 0);

        return {
          context: {
            state,
            errorMessage: resultContext.errorMessage,
            blockchain: context.blockchain,
            init: context.init,
            engine: context.engine,
            code: context.code,
            scriptHashStack: tailCall
              ? context.scriptHashStack.slice(0, context.scriptHashStack.length - 1)
              : context.scriptHashStack,
            scriptHash: context.scriptHash,
            callingScriptHash: context.callingScriptHash,
            entryScriptHash: context.entryScriptHash,
            pc: nextPC,
            depth: context.depth,
            returnValueCount: context.returnValueCount,
            stackCount,
            stack: stack.concat(context.stack),
            stackTry: context.stackTry,
            gasLeft: resultContext.gasLeft,
            createdContracts: resultContext.createdContracts,
            // TODO: check this
            staticFields: resultContext.staticFields,
            localVariables: resultContext.localVariables,
            arguments: resultContext.arguments,
          },
        };
      },
    });

    return { op, context: contextIn };
  },
});

const functionCallIsolated = ({ name }: { readonly name: OpCode }): OpCreate => ({
  type: 'create',
  create: ({ context: contextIn }) => {
    const returnValueCount = contextIn.code.slice(contextIn.pc, contextIn.pc + 1)[0];
    let parametersCount = contextIn.code.slice(contextIn.pc + 1, contextIn.pc + 2)[0];
    parametersCount = parametersCount === -1 ? contextIn.stack.length : parametersCount;
    const jumpCount = contextIn.code.slice(contextIn.pc + 2, contextIn.pc + 4).readInt16LE(0);
    const nextPC = contextIn.pc + 4;

    const { op } = createOp({
      name,
      in: parametersCount,
      invocation: 1,
      invoke: async ({ context, args, argsTry }) => {
        const resultContext = await context.engine.executeScript({
          code: context.code,
          blockchain: context.blockchain,
          init: context.init,
          gasLeft: context.gasLeft,
          options: {
            stack: args,
            stackTry: argsTry,
            depth: context.depth + 1,
            createdContracts: context.createdContracts,
            scriptHashStack: [context.scriptHash, ...context.scriptHashStack],
            scriptHash: context.scriptHash,
            entryScriptHash: context.entryScriptHash,
            returnValueCount,
            pc: context.pc + jumpCount + 1,
            stackCount: context.stackCount + args.reduce((acc, value) => acc + value.increment(), 0),
            // TODO: check this
            staticFields: context.staticFields,
            localVariables: context.localVariables,
            arguments: context.arguments,
          },
        });

        let { state, stackCount } = resultContext;
        if (state === VMState.HALT) {
          state = context.state;
        }

        let stack: ExecutionStack = [];
        if (returnValueCount === -1) {
          stack = resultContext.stack;
        } else if (returnValueCount > 0) {
          if (resultContext.stack.length < returnValueCount) {
            throw new InsufficientReturnValueError(context, resultContext.stack.length, returnValueCount);
          }

          stack = resultContext.stack.slice(0, returnValueCount);
          stackCount += resultContext.stack.slice(returnValueCount).reduce((acc, value) => acc + value.decrement(), 0);
        }

        stackCount += resultContext.stackTry.reduce((acc, value) => acc + value.decrement(), 0);

        return {
          context: {
            state,
            errorMessage: resultContext.errorMessage,
            blockchain: context.blockchain,
            init: context.init,
            engine: context.engine,
            code: context.code,
            scriptHashStack: context.scriptHashStack,
            scriptHash: context.scriptHash,
            callingScriptHash: context.callingScriptHash,
            entryScriptHash: context.entryScriptHash,
            pc: nextPC,
            depth: context.depth,
            returnValueCount: context.returnValueCount,
            stackCount,
            stack: stack.concat(context.stack),
            stackTry: context.stackTry,
            gasLeft: resultContext.gasLeft,
            createdContracts: resultContext.createdContracts,
            // TODO: check this
            staticFields: resultContext.staticFields,
            localVariables: resultContext.localVariables,
            arguments: resultContext.arguments,
          },
        };
      },
    });

    return { op, context: contextIn };
  },
});

const newArrayOrStruct = ({ name }: { readonly name: 'NEWARRAY' | 'NEWSTRUCT' }) =>
  createOp({
    name,
    in: 1,
    out: 1,
    invoke: ({ context, args }) => {
      let results;
      if (args[0].isArray()) {
        const array = args[0].getArray();
        results = name === 'NEWARRAY' ? [new ArrayStackItem(array)] : [new StructStackItem(array)];
      } else {
        const count = vmUtils.toNumber(context, args[0].getBigIntegerUnsafe());

        if (count > MAX_ARRAY_SIZE) {
          throw new ContainerTooLargeError(context);
        }

        const fill = _.range(0, count).map(() => new BooleanStackItem(false));
        results = name === 'NEWARRAY' ? [new ArrayStackItem(fill)] : [new StructStackItem(fill)];
      }

      return { context, results };
    },
  });

const JMP = jump({ name: 'JMP', long: false });

const OPCODE_PAIRS = (
  [
    [OpCodeToByteCode.PUSHINT8, pushInt({ name: 'PUSHINT8', numBytes: 1 })],
    [OpCodeToByteCode.PUSHINT16, pushInt({ name: 'PUSHINT16', numBytes: 2 })],
    [OpCodeToByteCode.PUSHINT32, pushInt({ name: 'PUSHINT32', numBytes: 4 })],
    [OpCodeToByteCode.PUSHINT64, pushInt({ name: 'PUSHINT64', numBytes: 8 })],
    [OpCodeToByteCode.PUSHINT128, pushInt({ name: 'PUSHINT128', numBytes: 16 })],
    [OpCodeToByteCode.PUSHINT256, pushInt({ name: 'PUSHINT256', numBytes: 32 })],
    // tslint:disable-next-line: readonly-array
  ] as ReadonlyArray<[number, OpObject]>
)
  .concat([
    [OpCodeToByteCode.PUSHDATA1, pushData({ name: 'PUSHDATA1', numBytes: 1 })],
    [OpCodeToByteCode.PUSHDATA2, pushData({ name: 'PUSHDATA2', numBytes: 2 })],
    [OpCodeToByteCode.PUSHDATA4, pushData({ name: 'PUSHDATA4', numBytes: 4 })],
    [OpCodeToByteCode.PUSHM1, pushNumber({ name: 'PUSHM1', value: -1 })],
  ])
  .concat(
    // tslint:disable-next-line: readonly-array
    _.range(OpCodeToByteCode.LDSFLD0, OpCodeToByteCode.LDSFLD6).map<[number, OpObject]>((idx) => {
      const value = idx - OpCodeToByteCode.LDSFLD0 - 1;

      return [
        idx,
        loadFromSlot({ name: `LDSFLD${value}` as OpCode, index: value, getSlot: (ctx) => ctx.staticFields }),
      ];
    }),
  )
  .concat(
    // tslint:disable-next-line: readonly-array
    _.range(OpCodeToByteCode.STSFLD0, OpCodeToByteCode.STSFLD6).map<[number, OpObject]>((idx) => {
      const value = idx - OpCodeToByteCode.STSFLD0 - 1;

      return [idx, storeToSlot({ name: `STSFLD${value}` as OpCode, index: value, getSlot: (ctx) => ctx.staticFields })];
    }),
  )
  .concat(
    // tslint:disable-next-line: readonly-array
    _.range(OpCodeToByteCode.LDLOC0, OpCodeToByteCode.LDLOC6).map<[number, OpObject]>((idx) => {
      const value = idx - OpCodeToByteCode.LDLOC0 - 1;

      return [
        idx,
        loadFromSlot({ name: `LDLOC${value}` as OpCode, index: value, getSlot: (ctx) => ctx.localVariables }),
      ];
    }),
  )
  .concat(
    // tslint:disable-next-line: readonly-array
    _.range(OpCodeToByteCode.STLOC0, OpCodeToByteCode.STLOC6).map<[number, OpObject]>((idx) => {
      const value = idx - OpCodeToByteCode.STLOC0 - 1;

      return [
        idx,
        storeToSlot({ name: `STLOC${value}` as OpCode, index: value, getSlot: (ctx) => ctx.localVariables }),
      ];
    }),
  )
  .concat(
    // tslint:disable-next-line: readonly-array
    _.range(OpCodeToByteCode.LDARG0, OpCodeToByteCode.LDARG6).map<[number, OpObject]>((idx) => {
      const value = idx - OpCodeToByteCode.LDARG0 - 1;

      return [idx, loadFromSlot({ name: `LDARG${value}` as OpCode, index: value, getSlot: (ctx) => ctx.arguments })];
    }),
  )
  .concat(
    // tslint:disable-next-line: readonly-array
    _.range(OpCodeToByteCode.STARG0, OpCodeToByteCode.STARG6).map<[number, OpObject]>((idx) => {
      const value = idx - OpCodeToByteCode.STARG0 - 1;

      return [idx, storeToSlot({ name: `STARG${value}` as OpCode, index: value, getSlot: (ctx) => ctx.arguments })];
    }),
  )
  .concat(
    // tslint:disable-next-line: readonly-array
    _.range(OpCodeToByteCode.PUSH0, OpCodeToByteCode.PUSH16).map<[number, OpObject]>((idx) => {
      const value = idx - OpCodeToByteCode.PUSH0 - 1;

      return [idx, pushNumber({ name: `PUSH${value}` as OpCode, value })];
    }),
  )
  .concat([
    [OpCodeToByteCode.LDSFLD, loadFromSlot({ name: 'LDSFLD', getSlot: (ctx) => ctx.staticFields })],
    [OpCodeToByteCode.LDLOC, loadFromSlot({ name: 'LDLOC', getSlot: (ctx) => ctx.localVariables })],
    [OpCodeToByteCode.LDARG, loadFromSlot({ name: 'LDARG', getSlot: (ctx) => ctx.arguments })],
    [OpCodeToByteCode.STSFLD, storeToSlot({ name: 'STSFLD', getSlot: (ctx) => ctx.staticFields })],
    [OpCodeToByteCode.STLOC, storeToSlot({ name: 'STLOC', getSlot: (ctx) => ctx.localVariables })],
    [OpCodeToByteCode.STARG, storeToSlot({ name: 'STARG', getSlot: (ctx) => ctx.arguments })],
  ])
  .concat([
    [
      OpCodeToByteCode.PUSHA,
      createOp({
        name: 'PUSHA',
        out: 1,
        invoke: ({ context }) => {
          const { pc } = context;
          const position = pc + context.code.readInt32LE(pc);
          if (position < 0 || position > context.code.length) {
            throw new Error(`Bad pointer address: ${position}`);
          }

          return {
            context: { ...context, pc: pc + 4 },
            results: [new PointerStackItem({ script: new Script(context.code), position })],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.PUSHNULL,
      createOp({
        name: 'PUSHNULL',
        out: 1,
        invoke: ({ context }) => ({ context, results: [new NullStackItem()] }),
      }),
    ],
    [
      OpCodeToByteCode.NOP,
      createOp({
        name: 'NOP',
        invoke: ({ context }) => ({ context }),
      }),
    ],
    [OpCodeToByteCode.JMP, JMP],
    [OpCodeToByteCode.JMP_L, jump({ name: 'JMP_L', long: true })],
    [OpCodeToByteCode.JMPIF, jump({ name: 'JMPIF', long: false, checkTrue: true })],
    [OpCodeToByteCode.JMPIF_L, jump({ name: 'JMPIF_L', long: true, checkTrue: true })],
    [OpCodeToByteCode.JMPIFNOT, jump({ name: 'JMPIFNOT', long: false, checkTrue: false })],
    [OpCodeToByteCode.JMPIFNOT_L, jump({ name: 'JMPIFNOT_L', long: true, checkTrue: false })],
    [
      OpCodeToByteCode.JMPEQ,
      jump({
        name: 'JMPEQ',
        long: false,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[0].getInteger().eq(argsIn[1].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPEQ_L,
      jump({
        name: 'JMPEQ_L',
        long: true,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[0].getInteger().eq(argsIn[1].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPNE,
      jump({
        name: 'JMPNE',
        long: false,
        checkTrue: false,
        jmpCheck: (argsIn) => !argsIn[0].getInteger().eq(argsIn[1].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPNE_L,
      jump({
        name: 'JMPNE_L',
        long: true,
        checkTrue: false,
        jmpCheck: (argsIn) => !argsIn[0].getInteger().eq(argsIn[1].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPGT,
      jump({
        name: 'JMPGT',
        long: false,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[1].getInteger().gt(argsIn[0].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPGT_L,
      jump({
        name: 'JMPGT_L',
        long: true,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[1].getInteger().gt(argsIn[0].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPGE,
      jump({
        name: 'JMPGE',
        long: false,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[1].getInteger().gte(argsIn[0].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPGE_L,
      jump({
        name: 'JMPGE_L',
        long: true,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[1].getInteger().gte(argsIn[0].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPLT,
      jump({
        name: 'JMPLT',
        long: false,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[1].getInteger().lt(argsIn[0].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPLT_L,
      jump({
        name: 'JMPLT_L',
        long: true,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[1].getInteger().lt(argsIn[0].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPLE,
      jump({
        name: 'JMPLE',
        long: false,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[1].getInteger().lte(argsIn[0].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.JMPLE_L,
      jump({
        name: 'JMPLE_L',
        long: true,
        checkTrue: true,
        jmpCheck: (argsIn) => argsIn[1].getInteger().lte(argsIn[0].getInteger()),
      }),
    ],
    [
      OpCodeToByteCode.CALL,
      createOp({
        name: 'CALL',
        invocation: 1,
        invoke: async ({ context }) => {
          const { pc } = context;
          // High level:
          // Execute JMP in place of current op codes pc using same context
          // Continue running after JMP until done
          // Set current pc to pc + 2
          const { op } = JMP;
          const { context: startContext } = await op.invoke({
            context: {
              ...context,
              callingScriptHash: context.scriptHash,
            },
            args: [],
            argsTry: [],
          });

          const resultContext = await context.engine.run({
            context: {
              ...startContext,
              depth: context.depth + 1,
            },
          });

          return {
            context: {
              ...resultContext,
              callingScriptHash: context.callingScriptHash,
              pc: pc + 2,
              state: resultContext.state === VMState.FAULT ? VMState.FAULT : VMState.NONE,
              depth: context.depth,
            },
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.RET,
      createOp({
        name: 'RET',
        invoke: ({ context }) => ({
          context: { ...context, state: VMState.HALT },
        }),
      }),
    ],
    [
      OpCodeToByteCode.SYSCALL,
      {
        type: 'create',
        create: ({ context }) => {
          const sysCall = lookupSysCall({ context });

          return {
            op: {
              name: 'SYSCALL',
              in: sysCall.in,
              inTry: sysCall.inTry,
              out: sysCall.out,
              outTry: sysCall.outTry,
              invocation: sysCall.invocation,
              fee: sysCall.fee,
              invoke: sysCall.invoke,
            },
            context: sysCall.context,
          };
        },
      },
    ],
    [
      OpCodeToByteCode.XDROP,
      createOp({
        name: 'XDROP',
        in: 1,
        invoke: ({ context, args }) => {
          const n = vmUtils.toNumber(context, args[0].getBigIntegerUnsafe());
          if (n < 0) {
            throw new XDropNegativeError(context);
          }

          const { stack } = context;

          if (n >= stack.length) {
            throw new XDropUnderflowError(context);
          }

          return {
            context: {
              ...context,
              stack: stack.slice(0, n).concat(stack.slice(n + 1)),
              stackCount: context.stackCount + stack[n].decrement(),
            },
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.CLEAR,
      createOp({
        name: 'CLEAR',
        out: 0,
        invoke: ({ context }) => ({
          context,
          results: [],
        }),
      }),
    ],
    [
      OpCodeToByteCode.DEPTH,
      createOp({
        name: 'DEPTH',
        out: 1,
        invoke: ({ context }) => ({
          context,
          results: [new IntegerStackItem(new BN(context.stack.length))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.DROP,
      createOp({
        name: 'DROP',
        in: 1,
        invoke: ({ context }) => ({ context }),
      }),
    ],
    [
      OpCodeToByteCode.DUP,
      createOp({
        name: 'DUP',
        in: 1,
        out: 2,
        invoke: ({ context, args }) => ({
          context,
          results: [args[0], args[0]],
        }),
      }),
    ],
    [
      OpCodeToByteCode.NIP,
      createOp({
        name: 'NIP',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [args[0]],
        }),
      }),
    ],
    [
      OpCodeToByteCode.OVER,
      createOp({
        name: 'OVER',
        in: 2,
        out: 3,
        invoke: ({ context, args }) => ({
          context,
          results: [args[1], args[0], args[1]],
        }),
      }),
    ],
    [
      OpCodeToByteCode.PICK,
      createOp({
        name: 'PICK',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const n = vmUtils.toNumber(context, args[0].getBigIntegerUnsafe());
          if (n < 0) {
            throw new PickNegativeError(context);
          }
          if (n >= context.stack.length) {
            throw new StackUnderflowError(context, 'PICK', context.stack.length, n + 1);
          }

          return { context, results: [context.stack[n]] };
        },
      }),
    ],
    [
      OpCodeToByteCode.ROLL,
      createOp({
        name: 'ROLL',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const n = vmUtils.toNumber(context, args[0].getBigIntegerUnsafe());
          if (n < 0) {
            throw new RollNegativeError(context);
          }
          if (n >= context.stack.length) {
            throw new StackUnderflowError(context, 'ROLL', context.stack.length, n + 1);
          }

          const { stack } = context;

          return {
            context: {
              ...context,
              stack: stack.slice(0, n).concat(stack.slice(n + 1)),
              stackCount: context.stackCount + stack[n].decrement(),
            },
            results: [context.stack[n]],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.ROT,
      createOp({
        name: 'ROT',
        in: 3,
        out: 3,
        invoke: ({ context, args }) => ({
          context,
          results: [args[1], args[0], args[2]],
        }),
      }),
    ],
    [
      OpCodeToByteCode.SWAP,
      createOp({
        name: 'SWAP',
        in: 2,
        out: 2,
        invoke: ({ context, args }) => ({
          context,
          results: [args[0], args[1]],
        }),
      }),
    ],
    [
      OpCodeToByteCode.TUCK,
      createOp({
        name: 'TUCK',
        in: 2,
        out: 3,
        invoke: ({ context, args }) => ({
          context,
          results: [args[0], args[1], args[0]],
        }),
      }),
    ],
    [
      OpCodeToByteCode.CAT,
      createOp({
        name: 'CAT',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => {
          const result = Buffer.concat([args[1].getBuffer(), args[0].getBuffer()]);
          if (result.length > MAX_ITEM_SIZE) {
            throw new ItemTooLargeError(context);
          }

          return {
            context,
            results: [new BufferStackItem(result)],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.REVERSE3,
      createOp({
        name: 'REVERSE3',
        in: 3,
        out: 3,
        invoke: ({ context, args }) => ({
          context,
          results: [args[2], args[1], args[0]],
        }),
      }),
    ],
    [
      OpCodeToByteCode.REVERSE4,
      createOp({
        name: 'REVERSE4',
        in: 4,
        out: 4,
        invoke: ({ context, args }) => ({
          context,
          results: [args[3], args[2], args[1], args[0]],
        }),
      }),
    ],
    [
      OpCodeToByteCode.REVERSEN,
      {
        type: 'create',
        create: ({ context: contextIn }) => {
          const { stack } = contextIn;
          const num = stack[0].getInteger().toNumber();

          if (num < 0 || num > stack.length) {
            throw new Error('Argument out of range');
          }

          const { op } = createOp({
            name: 'REVERSEN',
            in: num + 1,
            out: num,
            invoke: ({ context, args }) => ({ context, results: args.slice(1, num).reverse() }),
          });

          return { op, context: contextIn };
        },
      },
    ],
    [
      OpCodeToByteCode.INITSLOT,
      createOp({
        name: 'INITSLOT',
        invoke: ({ context, args }) => {
          if (context.localVariables !== undefined || context.arguments !== undefined) {
            throw new Error('INITSLOT cannot be executed twice.');
          }
          const { pc, code } = context;
          const firstCheck = code.readUInt16LE(pc);
          if (firstCheck === 0) {
            throw new Error();
          }
          const localVariablesCount = code.readUInt8(pc);
          let newLocalVariables: StackItem[] | undefined = context.localVariables;
          if (localVariablesCount > 0) {
            // tslint:disable-next-line: prefer-array-literal
            newLocalVariables = new Array(localVariablesCount);
          }
          const argumentsCount = code.readUInt8(pc + 1);
          let newArguments: StackItem[] | undefined = context.arguments;
          if (argumentsCount > 0) {
            newArguments = [];
            // tslint:disable-next-line: no-loop-statement
            for (let i = 0; i < argumentsCount; i += 1) {
              // tslint:disable-next-line: no-array-mutation
              newArguments.push(args[i]);
            }
          }

          return {
            context: { ...context, localVariables: newLocalVariables, arguments: newArguments, pc: pc + 2 },
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.INITSSLOT,
      createOp({
        name: 'INITSSLOT',
        invoke: ({ context }) => {
          if (context.staticFields !== undefined) {
            throw new Error('INITSSLOT cannot be executed twice.');
          }
          const { pc } = context;
          const num = context.code.readUInt8(pc);
          if (num === 0) {
            throw new Error('The operand is invalid');
          }

          return {
            // tslint:disable-next-line: prefer-array-literal
            context: { ...context, pc: pc + 1, staticFields: new Array(num) },
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.SUBSTR,
      createOp({
        name: 'SUBSTR',
        in: 3,
        out: 1,
        invoke: ({ context, args }) => {
          const end = vmUtils.toNumber(context, args[0].getBigIntegerUnsafe());
          if (end < 0) {
            throw new SubstrNegativeEndError(context);
          }

          const start = vmUtils.toNumber(context, args[1].getBigIntegerUnsafe());
          if (start < 0) {
            throw new SubstrNegativeStartError(context);
          }

          return {
            context,
            results: [new BufferStackItem(args[2].getBuffer().slice(start, start + end))],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.LEFT,
      createOp({
        name: 'LEFT',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => {
          const count = vmUtils.toNumber(context, args[0].getBigIntegerUnsafe());
          if (count < 0) {
            throw new LeftNegativeError(context);
          }

          return {
            context,
            results: [new BufferStackItem(args[1].getBuffer().slice(0, count))],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.RIGHT,
      createOp({
        name: 'RIGHT',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => {
          const count = vmUtils.toNumber(context, args[0].getBigIntegerUnsafe());
          if (count < 0) {
            throw new RightNegativeError(context);
          }

          const value = args[1].getBuffer();
          if (value.length < count) {
            throw new RightLengthError(context);
          }

          return {
            context,
            results: [new BufferStackItem(value.slice(value.length - count, value.length))],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.SIZE,
      createOp({
        name: 'SIZE',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(new BN(args[0].size))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.INVERT,
      createOp({
        name: 'INVERT',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new IntegerStackItem(
              utils.fromSignedBuffer(bitwise.buffer.not(utils.toSignedBuffer(args[0].getBigIntegerUnsafe()))),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.AND,
      createOp({
        name: 'AND',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new IntegerStackItem(
              vmUtils.bitwiseOp(bitwise.buffer.and, args[0].getBigIntegerUnsafe(), args[1].getBigIntegerUnsafe()),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.OR,
      createOp({
        name: 'OR',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new IntegerStackItem(
              vmUtils.bitwiseOp(bitwise.buffer.or, args[0].getBigIntegerUnsafe(), args[1].getBigIntegerUnsafe()),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.XOR,
      createOp({
        name: 'XOR',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new IntegerStackItem(
              vmUtils.bitwiseOp(bitwise.buffer.xor, args[0].getBigIntegerUnsafe(), args[1].getBigIntegerUnsafe()),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.EQUAL,
      createOp({
        name: 'EQUAL',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(args[0].equals(args[1]))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.NOTEQUAL,
      createOp({
        name: 'NOTEQUAL',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(!args[0].equals(args[1]))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.INC,
      createOp({
        name: 'INC',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[0].getInteger().add(utils.ONE))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.DEC,
      createOp({
        name: 'DEC',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[0].getInteger().sub(utils.ONE))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.SIGN,
      createOp({
        name: 'SIGN',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const value = args[0].getBigIntegerUnsafe();
          const mutableResults = [];
          if (value.isZero()) {
            mutableResults.push(new IntegerStackItem(utils.ZERO));
          } else if (value.isNeg()) {
            mutableResults.push(new IntegerStackItem(utils.NEGATIVE_ONE));
          } else {
            mutableResults.push(new IntegerStackItem(utils.ONE));
          }

          return { context, results: mutableResults };
        },
      }),
    ],
    [
      OpCodeToByteCode.NEGATE,
      createOp({
        name: 'NEGATE',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[0].getBigIntegerUnsafe().neg())],
        }),
      }),
    ],
    [
      OpCodeToByteCode.ABS,
      createOp({
        name: 'ABS',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[0].getBigIntegerUnsafe().abs())],
        }),
      }),
    ],
    [
      OpCodeToByteCode.NOT,
      createOp({
        name: 'NOT',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(!args[0].getBoolean())],
        }),
      }),
    ],
    [
      OpCodeToByteCode.NZ,
      createOp({
        name: 'NZ',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(!args[0].getBigIntegerUnsafe().isZero())],
        }),
      }),
    ],
    [
      OpCodeToByteCode.ADD,
      createOp({
        name: 'ADD',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[1].getInteger().add(args[0].getInteger()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.SUB,
      createOp({
        name: 'SUB',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[1].getInteger().sub(args[0].getInteger()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.MUL,
      createOp({
        name: 'MUL',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[1].getInteger().mul(args[0].getInteger()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.DIV,
      createOp({
        name: 'DIV',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[1].getInteger().div(args[0].getInteger()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.MOD,
      createOp({
        name: 'MOD',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[1].getInteger().mod(args[0].getInteger()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.SHL,
      createOp({
        name: 'SHL',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => {
          const shift = args[0].getBigIntegerUnsafe();
          if (shift.toNumber() > MAX_SHL_SHR || shift.toNumber() < MIN_SHL_SHR) {
            throw new ShiftTooLargeError(context);
          }

          const value = args[1].getBigIntegerUnsafe();
          const result = new IntegerStackItem(vmUtils.shiftLeft(value, shift));

          return {
            context,
            results: [result],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.POW,
      createOp({
        name: 'POW',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => {
          const exp = args[0].getInteger();
          const val = args[1].getInteger();

          return {
            context,
            results: [new IntegerStackItem(val.pow(exp))],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.SQRT,
      createOp({
        name: 'SQRT',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(args[0].getInteger().sqr())],
        }),
      }),
    ],
    [
      OpCodeToByteCode.SHR,
      createOp({
        name: 'SHR',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => {
          const shift = args[0].getBigIntegerUnsafe();
          if (shift.toNumber() > MAX_SHL_SHR || shift.toNumber() < MIN_SHL_SHR) {
            throw new ShiftTooLargeError(context);
          }

          const value = args[1].getBigIntegerUnsafe();
          const result = new IntegerStackItem(vmUtils.shiftRight(value, shift));

          return {
            context,
            results: [result],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.BOOLAND,
      createOp({
        name: 'BOOLAND',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(args[0].getBoolean() && args[1].getBoolean())],
        }),
      }),
    ],
    [
      OpCodeToByteCode.BOOLOR,
      createOp({
        name: 'BOOLOR',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(args[0].getBoolean() || args[1].getBoolean())],
        }),
      }),
    ],
    [
      OpCodeToByteCode.NUMEQUAL,
      createOp({
        name: 'NUMEQUAL',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(args[0].getBigIntegerUnsafe().eq(args[1].getBigIntegerUnsafe()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.NUMNOTEQUAL,
      createOp({
        name: 'NUMNOTEQUAL',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(!args[0].getBigIntegerUnsafe().eq(args[1].getBigIntegerUnsafe()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.LT,
      createOp({
        name: 'LT',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new BooleanStackItem(
              args[1].isNull || args[0].isNull
                ? false
                : args[1].getBigIntegerUnsafe().lt(args[0].getBigIntegerUnsafe()),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.GT,
      createOp({
        name: 'GT',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new BooleanStackItem(
              args[1].isNull || args[0].isNull
                ? false
                : args[1].getBigIntegerUnsafe().gt(args[0].getBigIntegerUnsafe()),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.LE,
      createOp({
        name: 'LE',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new BooleanStackItem(
              args[1].isNull || args[0].isNull
                ? false
                : args[1].getBigIntegerUnsafe().lte(args[0].getBigIntegerUnsafe()),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.GE,
      createOp({
        name: 'GE',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new BooleanStackItem(
              args[1].isNull || args[0].isNull
                ? false
                : args[1].getBigIntegerUnsafe().gte(args[0].getBigIntegerUnsafe()),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.MIN,
      createOp({
        name: 'MIN',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(BN.min(args[1].getBigIntegerUnsafe(), args[0].getBigIntegerUnsafe()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.MAX,
      createOp({
        name: 'MAX',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new IntegerStackItem(BN.max(args[1].getBigIntegerUnsafe(), args[0].getBigIntegerUnsafe()))],
        }),
      }),
    ],
    [
      OpCodeToByteCode.WITHIN,
      createOp({
        name: 'WITHIN',
        in: 3,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [
            new BooleanStackItem(
              args[1].getBigIntegerUnsafe().lte(args[2].getBigIntegerUnsafe()) &&
                args[2].getBigIntegerUnsafe().lt(args[0].getBigIntegerUnsafe()),
            ),
          ],
        }),
      }),
    ],
    [
      OpCodeToByteCode.PACK,
      {
        type: 'create',
        create: ({ context: contextIn }) => {
          const { stack } = contextIn;
          const top = stack[0] as StackItem | undefined;
          let _in;
          if (top === undefined) {
            // This will cause the op to throw once it's executed.
            _in = 1;
          } else {
            _in = vmUtils.toNumber(contextIn, top.getBigIntegerUnsafe()) + 1;

            if (_in < 0) {
              throw new InvalidPackCountError(contextIn);
            }

            if (_in > MAX_ARRAY_SIZE) {
              throw new ContainerTooLargeError(contextIn);
            }
          }

          const { op } = createOp({
            name: 'PACK',
            in: _in,
            out: 1,
            invoke: ({ context, args }) => ({
              context,
              results: [new ArrayStackItem(args.slice(1))],
            }),
          });

          return { op, context: contextIn };
        },
      },
    ],
    [
      OpCodeToByteCode.UNPACK,
      {
        type: 'create',
        create: ({ context: contextIn }) => {
          const { stack } = contextIn;
          const top = stack[0] as StackItem | undefined;
          const out = top === undefined ? 1 : top.getArray().length + 1;
          const { op } = createOp({
            name: 'UNPACK',
            in: 1,
            out,
            invoke: ({ context, args }) => {
              const arr = args[0].getArray();
              const mutableResults = [];
              // tslint:disable-next-line no-loop-statement
              for (let i = arr.length - 1; i >= 0; i -= 1) {
                mutableResults.push(arr[i]);
              }
              mutableResults.push(new IntegerStackItem(new BN(arr.length)));

              return { context, results: mutableResults };
            },
          });

          return { op, context: contextIn };
        },
      },
    ],
    [
      OpCodeToByteCode.PICKITEM,
      createOp({
        name: 'PICKITEM',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => {
          const key = assertPrimitiveStackItem(args[0]);
          if (args[1].isArray()) {
            const index = vmUtils.toNumber(context, key.getBigIntegerUnsafe());
            const val = args[1].getArray();
            if (index < 0 || index >= val.length) {
              throw new InvalidPickItemKeyError(context, `${index}`, JSON.stringify(args[1].convertJSON()));
            }

            const arrayValue = val[index];

            return {
              context,
              results: [arrayValue],
            };
          }

          const value = assertMapStackItem(args[1]);
          if (!value.has(key)) {
            throw new InvalidPickItemKeyError(context, key.toStructuralKey(), JSON.stringify(args[1].convertJSON()));
          }

          const mapValue = value.get(key);

          return {
            context,
            results: [mapValue],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.SETITEM,
      createOp({
        name: 'SETITEM',
        in: 3,
        invoke: ({ context, args }) => {
          let newItem = args[0];
          const key = assertPrimitiveStackItem(args[1]);
          if (newItem instanceof StructStackItem) {
            newItem = newItem.clone();
          }
          if (args[2].isArray()) {
            const index = vmUtils.toNumber(context, key.getBigIntegerUnsafe());
            const mutableValue = args[2].getArray();
            if (index < 0 || index >= mutableValue.length) {
              throw new InvalidSetItemIndexError(context);
            }

            const existing = mutableValue[index];
            mutableValue[index] = newItem;
            const innerSeen = new Set([args[2]]);

            return {
              context: {
                ...context,
                stackCount:
                  context.stackCount +
                  (args[2].referenceCount > 0 ? existing.decrement(innerSeen) + newItem.increment(innerSeen) : 0),
              },
            };
          }

          const value = assertMapStackItem(args[2]);
          const existingValue = value.has(key) ? value.get(key) : undefined;
          value.set(key, newItem);

          if (value.size > MAX_ARRAY_SIZE) {
            throw new ContainerTooLargeError(context);
          }
          const seen = new Set([args[2]]);

          return {
            context: {
              ...context,
              stackCount:
                context.stackCount +
                (args[2].referenceCount > 0
                  ? (existingValue === undefined ? key.increment(seen) : existingValue.decrement()) +
                    newItem.increment(seen)
                  : 0),
            },
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.NEWARRAY0,
      createOp({
        name: 'NEWARRAY0',
        out: 1,
        invoke: ({ context }) => ({
          context,
          results: [new ArrayStackItem([])],
        }),
      }),
    ],
    [
      OpCodeToByteCode.NEWSTRUCT0,
      createOp({
        name: 'NEWSTRUCT0',
        out: 1,
        invoke: ({ context }) => ({
          context,
          results: [new StructStackItem([])],
        }),
      }),
    ],
    [OpCodeToByteCode.NEWARRAY, newArrayOrStruct({ name: 'NEWARRAY' })],
    [OpCodeToByteCode.NEWSTRUCT, newArrayOrStruct({ name: 'NEWSTRUCT' })],
    [
      OpCodeToByteCode.NEWARRAY_T,
      createOp({
        name: 'NEWARRAY_T',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const { pc, code } = context;
          const num = args[0].getInteger().toNumber();
          if (num < 0 || num > MAX_STACK_SIZE) {
            throw new InvalidStackItemError();
          }

          let item: StackItem = new NullStackItem();

          const type = assertStackItemType(code.readUInt8(pc));
          switch (type) {
            case StackItemType.Boolean:
              item = new BooleanStackItem(false);
              break;
            case StackItemType.Integer:
              item = new IntegerStackItem(new BN(0));
              break;
            case StackItemType.ByteString:
              item = new ByteStringStackItem(Buffer.from([]));
              break;
            default:
              item = new NullStackItem();
          }

          return { context: { ...context, pc: pc + 1 }, results: [item] };
        },
      }),
    ],
    [
      OpCodeToByteCode.NEWBUFFER,
      createOp({
        name: 'NEWBUFFER',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const length = args[0].getInteger().toNumber();
          if (length > MAX_ITEM_SIZE) {
            throw new Error('Max');
          }

          return { context, results: [new BufferStackItem(Buffer.alloc(length))] };
        },
      }),
    ],
    [
      OpCodeToByteCode.MEMCPY,
      createOp({
        name: 'MEMCPY',
        in: 5,
        invoke: ({ context, args }) => {
          const count = args[0].getInteger().toNumber();
          if (count < 0) {
            throw new Error();
          }
          const startIndex = args[1].getInteger().toNumber();
          if (startIndex < 0) {
            throw new Error();
          }
          const source = args[2].getBuffer();
          if (startIndex + count > source.length) {
            throw new Error();
          }
          const destinationIndex = args[3].getInteger().toNumber();
          if (destinationIndex < 0) {
            throw new Error();
          }
          const destination = assertBufferStackItem(args[4]);
          if (destinationIndex + count > destination.size) {
            throw new Error();
          }

          destination.copy({ source, startIndex, destinationIndex, count });

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.NEWMAP,
      createOp({
        name: 'NEWMAP',
        out: 1,
        invoke: ({ context }) => ({
          context,
          results: [new MapStackItem(new Map())],
        }),
      }),
    ],
    [
      OpCodeToByteCode.APPEND,
      createOp({
        name: 'APPEND',
        in: 2,
        invoke: ({ context, args }) => {
          let newItem = args[0];
          if (newItem instanceof StructStackItem) {
            newItem = newItem.clone();
          }
          const mutableValue = args[1].getArray();
          mutableValue.push(newItem);

          if (mutableValue.length > MAX_ARRAY_SIZE) {
            throw new ContainerTooLargeError(context);
          }

          return {
            context: {
              ...context,
              stackCount: context.stackCount + (args[1].referenceCount > 0 ? newItem.increment(new Set([args[1]])) : 0),
            },
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.CLEARITEMS,
      createOp({
        name: 'CLEARITEMS',
        in: 1,
        invoke: ({ context, args }) => {
          const item = assertCompoundStackItem(args[0]);
          item.clear();

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.POPITEM,
      createOp({
        name: 'POPITEM',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const array = assertArrayStackItem(args[0]);

          return { context, results: [array.pop()] };
        },
      }),
    ],
    [
      OpCodeToByteCode.REVERSEITEMS,
      createOp({
        name: 'REVERSEITEMS',
        in: 1,
        invoke: ({ context, args }) => {
          const mutableValue = args[0].getArray();
          mutableValue.reverse();

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.REMOVE,
      createOp({
        name: 'REMOVE',
        in: 2,
        invoke: ({ context, args }) => {
          const key = assertPrimitiveStackItem(args[0]);
          if (args[1].isArray()) {
            const index = vmUtils.toNumber(context, key.getBigIntegerUnsafe());
            const mutableValue = args[1].getArray();
            if (index < 0 || index >= mutableValue.length) {
              throw new InvalidRemoveIndexError(context, index);
            }
            const existing = mutableValue[index];
            mutableValue.splice(index, 1);

            return {
              context: {
                ...context,
                stackCount:
                  context.stackCount + (existing.referenceCount > 0 ? existing.decrement(new Set([args[1]])) : 0),
              },
            };
          }

          const value = assertMapStackItem(args[1]);
          if (value.has(key)) {
            const val = value.get(key);
            value.delete(key);

            const seen = new Set([args[1]]);

            return {
              context: {
                ...context,
                stackCount:
                  context.stackCount +
                  (key.referenceCount > 0 ? key.decrement(seen) : 0) +
                  (val.referenceCount > 0 ? val.decrement(seen) : 0),
              },
            };
          }

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.HASKEY,
      createOp({
        name: 'HASKEY',
        in: 2,
        out: 1,
        invoke: ({ context, args }) => {
          const key = assertPrimitiveStackItem(args[0]);
          if (args[1].isArray()) {
            const index = vmUtils.toNumber(context, key.getBigIntegerUnsafe());
            const val = args[1].getArray();
            if (index < 0) {
              throw new InvalidHasKeyIndexError(context);
            }

            return {
              context,
              results: [new BooleanStackItem(index < val.length)],
            };
          }

          const value = assertMapStackItem(args[1]);

          return {
            context,
            results: [new BooleanStackItem(value.has(key))],
          };
        },
      }),
    ],
    [
      OpCodeToByteCode.KEYS,
      createOp({
        name: 'KEYS',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const value = assertMapStackItem(args[0]);

          return { context, results: [value.keys()] };
        },
      }),
    ],
    [
      OpCodeToByteCode.VALUES,
      createOp({
        name: 'VALUES',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const values = args[0].isArray() ? args[0].getArray() : assertMapStackItem(args[0]).valuesArray();

          const newValues = values.map((value) => (value instanceof StructStackItem ? value.clone() : value));

          return { context, results: [new ArrayStackItem(newValues)] };
        },
      }),
    ],
    [
      OpCodeToByteCode.ABORT,
      createOp({
        name: 'ABORT',
        invoke: ({ context }) => {
          throw new ThrowError(context);
        },
      }),
    ],
    [
      OpCodeToByteCode.ASSERT,
      createOp({
        name: 'ASSERT',
        in: 1,
        invoke: ({ context, args }) => {
          const item = args[0].getBoolean();

          if (!item) {
            throw new Error('ASSERT is executed with false result.');
          }

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.THROW,
      createOp({
        name: 'THROW',
        in: 1,
        invoke: ({ context, args }) => {
          const item = args[0];

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.TRY,
      createOp({
        name: 'TRY',
        invoke: ({ context }) => {
          const catchOffset = context.code.readInt8(context.pc);
          const finallyOffset = context.code.readInt8(context.pc + 1);

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.TRY_L,
      createOp({
        name: 'TRY_L',
        invoke: ({ context }) => {
          const catchOffset = context.code.readInt32LE(context.pc);
          const finallyOffset = context.code.readInt32LE(context.pc + 4);

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.ENDTRY,
      createOp({
        name: 'ENDTRY',
        invoke: ({ context }) => {
          const endOffset = context.code.readInt8(context.pc);

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.ENDTRY_L,
      createOp({
        name: 'ENDTRY_L',
        invoke: ({ context }) => {
          const endOffset = context.code.readInt32LE(context.pc);

          return { context };
        },
      }),
    ],
    [
      OpCodeToByteCode.ISNULL,
      createOp({
        name: 'ISNULL',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => ({
          context,
          results: [new BooleanStackItem(args[0].isNull)],
        }),
      }),
    ],
    [
      OpCodeToByteCode.ISTYPE,
      createOp({
        name: 'ISTYPE',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const item = args[0];
          const { code, pc } = context;
          const type = code.readUInt8(pc);
          if (type === StackItemType.Any || !isStackItemType(type)) {
            throw new InvalidStackItemTypeError(context, type);
          }

          return { context: { ...context, pc: pc + 1 }, results: [new BooleanStackItem(type === item.type)] };
        },
      }),
    ],
    [
      OpCodeToByteCode.CONVERT,
      createOp({
        name: 'CONVERT',
        in: 1,
        out: 1,
        invoke: ({ context, args }) => {
          const item = args[0];
          const { code, pc } = context;
          const type = assertStackItemType(code.readUInt8(pc));

          return { context, results: [item.convertTo(type)] };
        },
      }),
    ],
  ]);

export const OPCODES = _.fromPairs(OPCODE_PAIRS) as { readonly [Byte in number]?: OpObject };
// tslint:disable-next-line: readonly-array
const STATIC_OPCODES = _.fromPairs(OPCODE_PAIRS.filter((value): value is [number, OpStatic] => value[1].type === 'op'));
const CREATE_OPCODES = _.fromPairs(
  // tslint:disable-next-line: readonly-array
  OPCODE_PAIRS.filter((value): value is [number, OpCreate] => value[1].type === 'create'),
);

export const lookupOp = ({ context }: { readonly context: ExecutionContext }) => {
  const opCode = context.code[context.pc];
  const op = STATIC_OPCODES[opCode] as OpStatic | undefined;
  const newContext = {
    ...context,
    pc: context.pc + 1,
  };
  if (op !== undefined) {
    return { op: op.op, context: newContext };
  }

  const opCreate = CREATE_OPCODES[opCode] as OpCreate | undefined;
  if (opCreate === undefined) {
    throw new UnknownOpError(context, `${opCode}`);
  }

  return opCreate.create({ context: newContext });
};
