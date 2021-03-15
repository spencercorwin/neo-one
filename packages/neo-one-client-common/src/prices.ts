import BigNumber from 'bignumber.js';
import { Op } from './models';

export const ECDsaVerifyPrice = new BigNumber(1000000);

const opCodePrices: Record<Op, BigNumber | undefined> = {
  [Op.PUSHINT8]: new BigNumber(30),
  [Op.PUSHINT16]: new BigNumber(30),
  [Op.PUSHINT32]: new BigNumber(30),
  [Op.PUSHINT64]: new BigNumber(30),
  [Op.PUSHINT128]: new BigNumber(120),
  [Op.PUSHINT256]: new BigNumber(120),
  [Op.PUSHA]: new BigNumber(120),
  [Op.PUSHNULL]: new BigNumber(30),
  [Op.PUSHDATA1]: new BigNumber(180),
  [Op.PUSHDATA2]: new BigNumber(13000),
  [Op.PUSHDATA4]: new BigNumber(110000),
  [Op.PUSHM1]: new BigNumber(30),
  [Op.PUSH0]: new BigNumber(30),
  [Op.PUSH1]: new BigNumber(30),
  [Op.PUSH2]: new BigNumber(30),
  [Op.PUSH3]: new BigNumber(30),
  [Op.PUSH4]: new BigNumber(30),
  [Op.PUSH5]: new BigNumber(30),
  [Op.PUSH6]: new BigNumber(30),
  [Op.PUSH7]: new BigNumber(30),
  [Op.PUSH8]: new BigNumber(30),
  [Op.PUSH9]: new BigNumber(30),
  [Op.PUSH10]: new BigNumber(30),
  [Op.PUSH11]: new BigNumber(30),
  [Op.PUSH12]: new BigNumber(30),
  [Op.PUSH13]: new BigNumber(30),
  [Op.PUSH14]: new BigNumber(30),
  [Op.PUSH15]: new BigNumber(30),
  [Op.PUSH16]: new BigNumber(30),
  [Op.NOP]: new BigNumber(30),
  [Op.JMP]: new BigNumber(70),
  [Op.JMP_L]: new BigNumber(70),
  [Op.JMPIF]: new BigNumber(70),
  [Op.JMPIF_L]: new BigNumber(70),
  [Op.JMPIFNOT]: new BigNumber(70),
  [Op.JMPIFNOT_L]: new BigNumber(70),
  [Op.JMPEQ]: new BigNumber(70),
  [Op.JMPEQ_L]: new BigNumber(70),
  [Op.JMPNE]: new BigNumber(70),
  [Op.JMPNE_L]: new BigNumber(70),
  [Op.JMPGT]: new BigNumber(70),
  [Op.JMPGT_L]: new BigNumber(70),
  [Op.JMPGE]: new BigNumber(70),
  [Op.JMPGE_L]: new BigNumber(70),
  [Op.JMPLT]: new BigNumber(70),
  [Op.JMPLT_L]: new BigNumber(70),
  [Op.JMPLE]: new BigNumber(70),
  [Op.JMPLE_L]: new BigNumber(70),
  [Op.CALL]: new BigNumber(22000),
  [Op.CALL_L]: new BigNumber(22000),
  [Op.CALLA]: new BigNumber(22000),
  [Op.ABORT]: new BigNumber(30),
  [Op.ASSERT]: new BigNumber(30),
  [Op.THROW]: new BigNumber(22000),
  [Op.TRY]: new BigNumber(100),
  [Op.TRY_L]: new BigNumber(100),
  [Op.ENDTRY]: new BigNumber(100),
  [Op.ENDTRY_L]: new BigNumber(100),
  [Op.ENDFINALLY]: new BigNumber(100),
  [Op.RET]: new BigNumber(0),
  [Op.SYSCALL]: new BigNumber(0),
  [Op.DEPTH]: new BigNumber(60),
  [Op.DROP]: new BigNumber(60),
  [Op.NIP]: new BigNumber(60),
  [Op.XDROP]: new BigNumber(400),
  [Op.CLEAR]: new BigNumber(400),
  [Op.DUP]: new BigNumber(60),
  [Op.OVER]: new BigNumber(60),
  [Op.PICK]: new BigNumber(60),
  [Op.TUCK]: new BigNumber(60),
  [Op.SWAP]: new BigNumber(60),
  [Op.ROT]: new BigNumber(60),
  [Op.ROLL]: new BigNumber(400),
  [Op.REVERSE3]: new BigNumber(60),
  [Op.REVERSE4]: new BigNumber(60),
  [Op.REVERSEN]: new BigNumber(400),
  [Op.INITSSLOT]: new BigNumber(400),
  [Op.INITSLOT]: new BigNumber(1600),
  [Op.LDSFLD0]: new BigNumber(60),
  [Op.LDSFLD1]: new BigNumber(60),
  [Op.LDSFLD2]: new BigNumber(60),
  [Op.LDSFLD3]: new BigNumber(60),
  [Op.LDSFLD4]: new BigNumber(60),
  [Op.LDSFLD5]: new BigNumber(60),
  [Op.LDSFLD6]: new BigNumber(60),
  [Op.LDSFLD]: new BigNumber(60),
  [Op.STSFLD0]: new BigNumber(60),
  [Op.STSFLD1]: new BigNumber(60),
  [Op.STSFLD2]: new BigNumber(60),
  [Op.STSFLD3]: new BigNumber(60),
  [Op.STSFLD4]: new BigNumber(60),
  [Op.STSFLD5]: new BigNumber(60),
  [Op.STSFLD6]: new BigNumber(60),
  [Op.STSFLD]: new BigNumber(60),
  [Op.LDLOC0]: new BigNumber(60),
  [Op.LDLOC1]: new BigNumber(60),
  [Op.LDLOC2]: new BigNumber(60),
  [Op.LDLOC3]: new BigNumber(60),
  [Op.LDLOC4]: new BigNumber(60),
  [Op.LDLOC5]: new BigNumber(60),
  [Op.LDLOC6]: new BigNumber(60),
  [Op.LDLOC]: new BigNumber(60),
  [Op.STLOC0]: new BigNumber(60),
  [Op.STLOC1]: new BigNumber(60),
  [Op.STLOC2]: new BigNumber(60),
  [Op.STLOC3]: new BigNumber(60),
  [Op.STLOC4]: new BigNumber(60),
  [Op.STLOC5]: new BigNumber(60),
  [Op.STLOC6]: new BigNumber(60),
  [Op.STLOC]: new BigNumber(60),
  [Op.LDARG0]: new BigNumber(60),
  [Op.LDARG1]: new BigNumber(60),
  [Op.LDARG2]: new BigNumber(60),
  [Op.LDARG3]: new BigNumber(60),
  [Op.LDARG4]: new BigNumber(60),
  [Op.LDARG5]: new BigNumber(60),
  [Op.LDARG6]: new BigNumber(60),
  [Op.LDARG]: new BigNumber(60),
  [Op.STARG0]: new BigNumber(60),
  [Op.STARG1]: new BigNumber(60),
  [Op.STARG2]: new BigNumber(60),
  [Op.STARG3]: new BigNumber(60),
  [Op.STARG4]: new BigNumber(60),
  [Op.STARG5]: new BigNumber(60),
  [Op.STARG6]: new BigNumber(60),
  [Op.STARG]: new BigNumber(60),
  [Op.NEWBUFFER]: new BigNumber(80000),
  [Op.MEMCPY]: new BigNumber(80000),
  [Op.CAT]: new BigNumber(80000),
  [Op.SUBSTR]: new BigNumber(80000),
  [Op.LEFT]: new BigNumber(80000),
  [Op.RIGHT]: new BigNumber(80000),
  [Op.INVERT]: new BigNumber(100),
  [Op.AND]: new BigNumber(200),
  [Op.OR]: new BigNumber(200),
  [Op.XOR]: new BigNumber(200),
  [Op.EQUAL]: new BigNumber(1000),
  [Op.NOTEQUAL]: new BigNumber(1000),
  [Op.SIGN]: new BigNumber(100),
  [Op.ABS]: new BigNumber(100),
  [Op.NEGATE]: new BigNumber(100),
  [Op.INC]: new BigNumber(100),
  [Op.DEC]: new BigNumber(100),
  [Op.ADD]: new BigNumber(200),
  [Op.SUB]: new BigNumber(200),
  [Op.MUL]: new BigNumber(300),
  [Op.DIV]: new BigNumber(300),
  [Op.MOD]: new BigNumber(300),
  [Op.SHL]: new BigNumber(300),
  [Op.SHR]: new BigNumber(300),
  [Op.NOT]: new BigNumber(100),
  [Op.BOOLAND]: new BigNumber(200),
  [Op.BOOLOR]: new BigNumber(200),
  [Op.NZ]: new BigNumber(100),
  [Op.NUMEQUAL]: new BigNumber(200),
  [Op.NUMNOTEQUAL]: new BigNumber(200),
  [Op.LT]: new BigNumber(200),
  [Op.LE]: new BigNumber(200),
  [Op.GT]: new BigNumber(200),
  [Op.GE]: new BigNumber(200),
  [Op.MIN]: new BigNumber(200),
  [Op.MAX]: new BigNumber(200),
  [Op.WITHIN]: new BigNumber(200),
  [Op.PACK]: new BigNumber(15000),
  [Op.UNPACK]: new BigNumber(15000),
  [Op.NEWARRAY0]: new BigNumber(400),
  [Op.NEWARRAY]: new BigNumber(15000),
  [Op.NEWARRAY_T]: new BigNumber(15000),
  [Op.NEWSTRUCT0]: new BigNumber(400),
  [Op.NEWSTRUCT]: new BigNumber(15000),
  [Op.NEWMAP]: new BigNumber(200),
  [Op.SIZE]: new BigNumber(150),
  [Op.HASKEY]: new BigNumber(270000),
  [Op.KEYS]: new BigNumber(500),
  [Op.VALUES]: new BigNumber(270000),
  [Op.PICKITEM]: new BigNumber(270000),
  [Op.APPEND]: new BigNumber(270000),
  [Op.SETITEM]: new BigNumber(270000),
  [Op.REVERSEITEMS]: new BigNumber(270000),
  [Op.REMOVE]: new BigNumber(500),
  [Op.CLEARITEMS]: new BigNumber(400),
  [Op.ISNULL]: new BigNumber(60),
  [Op.ISTYPE]: new BigNumber(60),
  [Op.CONVERT]: new BigNumber(80000),
};

// tslint:disable-next-line: export-name
export const getOpCodePrice = (value: Op): BigNumber => {
  const fee = opCodePrices[value];
  if (fee === undefined) {
    throw new Error(`unknown Opcode: ${value}`);
  }

  return fee;
};

export const signatureContractCost = getOpCodePrice(Op.PUSHDATA1)
  .multipliedBy(2)
  .plus(getOpCodePrice(Op.PUSHNULL))
  .plus(getOpCodePrice(Op.SYSCALL))
  .plus(ECDsaVerifyPrice);

export const multiSignatureContractCost = (m: number, n: number) =>
  getOpCodePrice(Op.PUSHDATA1)
    .multipliedBy(m + n)
    .plus(getOpCodePrice(Op.PUSHINT8).multipliedBy(2))
    .plus(getOpCodePrice(Op.PUSHNULL))
    .plus(getOpCodePrice(Op.SYSCALL))
    .plus(ECDsaVerifyPrice.multipliedBy(n));