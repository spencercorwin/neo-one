import { Block } from '../../Block';
import { Header } from '../../Header';
import { EquatableKeyStackItem } from './EquatableKeyStackItem';

export class BlockStackItem extends EquatableKeyStackItem<Block> {
  public asBlock(): Block {
    return this.value;
  }

  public asHeader(): Header {
    return this.value.header;
  }
}
