import { BinaryWriter } from '@neo-one/client-common';
import {contractModel} from '../../__data__';

describe('ContractModel - serializeWirebase', () => {
  let writer: BinaryWriter;
  beforeEach(() => {
    writer = new BinaryWriter();
  });

  test('Simple', () => {
    contractModel().serializeWireBase(writer);
    expect(writer.toBuffer()).toMatchSnapshot();
  });
});
