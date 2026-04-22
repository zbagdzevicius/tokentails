import { BlessingStatus, BlessingStatuses } from '@/models/cats';
import { Button } from '../ui/button';
import { Labeled } from '../ui/labeled';

export interface IProps {
  status: BlessingStatus | null;
  setStatus: (status: BlessingStatus | null) => void;
}

export const BlessingsFilters = ({ status, setStatus }: IProps) => {
  return (
    <Labeled label="CATS STATUS">
      <div className="flex gap-2">
        <Button
          variant={status === null ? 'default' : 'outline'}
          key="allStatus"
          onClick={() => setStatus(null)}
        >
          All
        </Button>
        {BlessingStatuses.map((s) => (
          <Button
            variant={s === status ? 'default' : 'outline'}
            key={s}
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </div>
    </Labeled>
  );
};
