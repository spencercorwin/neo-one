import { Header } from '@neo-one/node-core';
import { EquatableKeyStackItem } from './EquatableKeyStackItem';

export class HeaderStackItem extends EquatableKeyStackItem<Header> {
  public asHeader(): Header {
    return this.value;
  }
}
