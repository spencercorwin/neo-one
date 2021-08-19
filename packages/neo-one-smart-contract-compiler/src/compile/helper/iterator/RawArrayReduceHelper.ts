import ts from 'typescript';
import { ScriptBuilder } from '../../sb';
import { VisitOptions } from '../../types';
import { Helper } from '../Helper';

export interface RawArrayReduceHelperOptions {
  readonly each: (options: VisitOptions) => void;
}

// Input: [accum, arr]
// Output: [accum]
export class RawArrayReduceHelper extends Helper {
  private readonly each: (options: VisitOptions) => void;

  public constructor(options: RawArrayReduceHelperOptions) {
    super();
    this.each = options.each;
  }

  public emit(sb: ScriptBuilder, node: ts.Node, optionsIn: VisitOptions): void {
    const options = sb.pushValueOptions(optionsIn);

    // [arr, accum, arr]
    sb.emitOp(node, 'OVER');
    // [size, accum, arr]
    sb.emitOp(node, 'SIZE');
    // [idx, size, accum, arr]
    sb.emitPushInt(node, 0);
    // [size, idx, accum, arr]
    sb.emitOp(node, 'SWAP');

    sb.emitHelper(
      node,
      options,
      sb.helpers.forLoop({
        condition: () => {
          // [size, idx, size, accum, arr]
          sb.emitOp(node, 'TUCK');
          // [idx, size, idx, size, accum, arr]
          sb.emitOp(node, 'OVER');
          // [size > idx, idx, size, accum, arr]
          sb.emitOp(node, 'GT');
        },
        each: (innerOptions) => {
          // [accum, idx, size, arr]
          sb.emitOp(node, 'ROT');
          // [arr, size, idx, accum]
          sb.emitOp(node, 'REVERSE4');
          // [arr, arr, size, idx, accum]
          sb.emitOp(node, 'DUP');
          // [size, arr, arr, idx, accum]
          sb.emitOp(node, 'ROT');
          // [idx, arr, arr, size, accum]
          sb.emitOp(node, 'REVERSE4');
          // [idx, arr, idx, arr, size, accum]
          sb.emitOp(node, 'TUCK');
          // [value, idx, arr, size, accum]
          sb.emitOp(node, 'PICKITEM');
          // [idx, value, idx, arr, size, accum]
          sb.emitOp(node, 'OVER');
          // [5, idx, value, idx, arr, size, accum]
          sb.emitPushInt(node, 5);
          // [accum, idx, value, idx, arr, size, accum]
          sb.emitOp(node, 'PICK');
          // [accum, idx, arr, size, accum]
          this.each(sb.pushValueOptions(innerOptions));
          // [idx, arr, size, accum]
          sb.emitOp(node, 'DROP');
          // [size, idx, arr, accum]
          sb.emitOp(node, 'ROT');
          // [accum, arr, idx, size]
          sb.emitOp(node, 'REVERSE4');
          // [arr, accum, idx, size]
          sb.emitOp(node, 'SWAP');
          // [size, idx, accum, arr]
          sb.emitOp(node, 'REVERSE4');
        },
        handleReturn: () => {
          // [idx, accum, arr]
          sb.emitOp(node, 'DROP');
          // [accum, arr]
          sb.emitOp(node, 'DROP');
          // [arr]
          sb.emitOp(node, 'DROP');
          // []
          sb.emitOp(node, 'DROP');
        },
        cleanup: () => {
          // [idx, accum, arr]
          sb.emitOp(node, 'DROP');
          // [accum, arr]
          sb.emitOp(node, 'DROP');
          // [accum]
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
