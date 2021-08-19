import ts from 'typescript';
import { ScriptBuilder } from '../../sb';
import { VisitOptions } from '../../types';
import { Helper } from '../Helper';

export interface RawArraySomeBaseHelperOptions {
  readonly each: (options: VisitOptions) => void;
}

// Input: [array]
// Output: [boolean]
export class RawArraySomeBaseHelper extends Helper {
  private readonly each: (options: VisitOptions) => void;

  public constructor(options: RawArraySomeBaseHelperOptions) {
    super();
    this.each = options.each;
  }

  public emit(sb: ScriptBuilder, node: ts.Node, optionsIn: VisitOptions): void {
    const options = sb.pushValueOptions(optionsIn);

    // [array, array]
    sb.emitOp(node, 'DUP');
    // [size, array]
    sb.emitOp(node, 'SIZE');
    // [idx, size, array]
    sb.emitPushInt(node, 0);
    // [size, idx, array]
    sb.emitOp(node, 'SWAP');
    // [result, size, idx, array]
    sb.emitPushBoolean(node, false);

    sb.emitHelper(
      node,
      options,
      sb.helpers.forLoop({
        condition: () => {
          // want: [size, idx, result, array]
          // [array, result]
          sb.emitOp(node, 'SWAP');
          // [array, result, array]
          sb.emitOp(node, 'TUCK');
          // [result, array, result, array]
          sb.emitOp(node, 'OVER');
          // [!result, array, result, array]
          sb.emitOp(node, 'NOT');
          // [array, !result, result, array]
          sb.emitOp(node, 'SWAP');
          // [boolean, !result, result, array]
          sb.emitSysCall(node, 'System.Iterator.Next');
          // [boolean, result, array]
          sb.emitOp(node, 'BOOLAND');
        },
        each: (innerOptions) => {
          // [array]
          sb.emitOp(node, 'DROP');
          // [array, array]
          sb.emitOp(node, 'DUP');
          // [result, array]
          this.each(sb.pushValueOptions(innerOptions));
        },
        handleReturn: () => {
          // [array]
          sb.emitOp(node, 'DROP');
          // []
          sb.emitOp(node, 'DROP');
        },
        cleanup: () => {
          // [result]
          sb.emitOp(node, 'NIP');

          if (!optionsIn.pushValue) {
            // []
            sb.emitOp(node, 'DROP');
          }
        },
      }),
    );
  }
}
