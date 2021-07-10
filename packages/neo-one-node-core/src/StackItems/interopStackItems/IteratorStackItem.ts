import { getNextID } from '../referenceCounter';
import { ObjectStackItem } from './ObjectStackItem';
import { StackItemIterator } from './StackItemIterator';

export class IteratorStackItem extends ObjectStackItem<StackItemIterator> {
  private readonly referenceID = getNextID();
  public asIterator(): StackItemIterator {
    return this.value;
  }

  // tslint:disable-next-line no-any
  public equals(other: any): boolean {
    return this === other;
  }

  public toStructuralKey(): string {
    return `${this.referenceID}`;
  }
}
