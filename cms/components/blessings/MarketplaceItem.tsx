import { IBlessing } from '@/models/blessing';
import { cardsColor } from '@/models/cat';
import { BlessingStatus, BlessingStatuses, ICat } from '@/models/cats';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { useState } from 'react';
import { TailsCardModal } from '../tailsCard/TailsCardModal';
import { Button } from '../ui/button';

export const MarketplaceItem = ({
  blessing,
  custom,
  onUpdateStatus
}: {
  cat?: ICat;
  blessing?: IBlessing;
  custom?: boolean;
  onUpdateStatus: (id: string, status: BlessingStatus) => void;
}) => {
  const item = blessing?.cat;
  const status = blessing?.status || 'UNKNOWN';
  const [isModalOpen, setIsModalOpen] = useState(false);
  if (!item) return null;

  return (
    <div className="relative group flex flex-col">
      <Link
        href={
          custom
            ? `/individual/${blessing!._id}`
            : `/blessings/${blessing!._id}`
        }
        className="relative overflow-hidden w-48 rounded-2xl rem:border-[7px] min-w-[12rem] block"
        style={{ borderColor: cardsColor[item.type] }}
      >
        <div className="relative z-10 items-center flex flex-col h-full">
          <img
            draggable={false}
            className="w-20 z-10 pixelated -mt-2 -m-2 absolute bottom-6 left-0"
            src={item.catImg}
            loading="lazy"
            alt={item.name}
          />
          {(item?.blessings?.length || blessing) && (
            <img
              draggable={false}
              loading="lazy"
              className="w-full max-h-[200px] object-cover mb-2 -mt-4 z-0 rounded-t-2xl group-hover:scale-150 group-hover:rounded-2xl transition-all duration-300"
              src={blessing?.image?.url || item.blessings?.[0]?.image?.url}
              alt={`${item.type} icon`}
            />
          )}
          <div
            className="text-p4 font-secondary mb-4 text-center border-yellow-300 absolute bottom-0 font-bold mb-2 w-[92%] rounded-full tracking-wider"
            style={{ background: cardsColor[item.type] }}
          >
            {item.name}
          </div>
          <div
            className="text-p4 font-secondary text-center border-yellow-300 absolute -top-0 w-full font-bold mb-2 tracking-wider"
            style={{ background: cardsColor[item.type] }}
          >
            {status}
          </div>
        </div>
      </Link>
      <Button className="mb-2" onClick={() => setIsModalOpen(true)}>
        Show Card
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button aria-haspopup="true" variant="outline">
            UPDATE STATUS
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>SELECT NEW STATUS</DropdownMenuLabel>
          {BlessingStatuses.map((status) => (
            <DropdownMenuItem
              className={`${status === (blessing?.status as unknown) ? 'bg-primary text-primary-foreground' : ''}`}
              key={status}
              onClick={() => onUpdateStatus?.(blessing?._id!, status)}
            >
              <button type="submit">{status}</button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {isModalOpen && (
        <TailsCardModal
          onClose={() => setIsModalOpen(false)}
          cat={{ ...blessing?.cat, blessing } as unknown as ICat}
        />
      )}
    </div>
  );
};
