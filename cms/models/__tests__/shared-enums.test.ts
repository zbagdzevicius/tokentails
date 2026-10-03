import * as shared from '../../shared-contracts/enums';
import { Status, Statuses } from '../blessing';
import { BlessingStatus, BlessingStatuses, CatAbilityType, CatAbilityTypes, Tier } from '../cats';

describe('CMS models use the shared enums', () => {
  it('re-exports the generated enums instead of hand-kept copies', () => {
    expect(BlessingStatus).toBe(shared.BlessingStatus);
    expect(Status).toBe(shared.BlessingStatus);
    expect(CatAbilityType).toBe(shared.CatAbilityType);
    expect(Tier).toBe(shared.Tier);
  });

  it('keeps the value lists the filters and cards rely on', () => {
    expect(BlessingStatuses).toEqual(['WAITING', 'RECOVERING', 'ADOPTED', 'HEAVEN']);
    expect(Statuses).toEqual(BlessingStatuses);
    expect(CatAbilityTypes).toEqual(Object.values(CatAbilityType));
    expect(Object.values(Tier)).toEqual(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']);
  });
});
