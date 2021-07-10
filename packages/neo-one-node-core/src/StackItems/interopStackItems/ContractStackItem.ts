import { Contract } from '../../Contract';
import { EquatableKeyStackItem } from './EquatableKeyStackItem';

export class ContractStackItem extends EquatableKeyStackItem<Contract> {
  public asContract(): Contract {
    return this.value;
  }
}
