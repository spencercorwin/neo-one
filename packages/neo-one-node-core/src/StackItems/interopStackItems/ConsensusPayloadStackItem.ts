import { ConsensusPayload } from '../../consensus';
import { EquatableKeyStackItem } from './EquatableKeyStackItem';

export class ConsensusPayloadStackItem extends EquatableKeyStackItem<ConsensusPayload> {
  public asConsensusPayload(): ConsensusPayload {
    return this.value;
  }
}
