// Registers the CAT-AUDIO actors: dog, cloud, leaf, grandma, yarn. Set pieces build them with actors.get(id).build().
import { actors } from '../core/registry';
import { dogActor } from './dog';
import { grandmaActor, yarnActor } from './friends';
import { cloudActor, leafActor } from './puff';

export function registerActors(): void {
  actors.add({ id: 'dog', build: dogActor });
  actors.add({ id: 'cloud', build: cloudActor });
  actors.add({ id: 'leaf', build: leafActor });
  actors.add({ id: 'grandma', build: grandmaActor });
  actors.add({ id: 'yarn', build: yarnActor });
}
