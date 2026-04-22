'use client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/components/ui/table';
import { IBlessing } from '@/models/blessing';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

export default function Blessing({
  blessing,
  onDelete,
  custom
}: {
  blessing: IBlessing;
  onDelete: () => void;
  custom?: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-bold text-lg">{blessing.name}</TableCell>
      <TableCell className="font-medium">
        <img
          src={blessing.image?.url}
          className="w-64 rounded-2xl object-contain"
        />
      </TableCell>
      <TableCell className="font-medium">
        <img
          src={blessing.cat?.cardImg}
          className="w-auto h-[500px] object-contain"
        />
      </TableCell>
      <TableCell className="font-medium">{blessing.creator?.name}</TableCell>
      <TableCell>{new Date(blessing?.createdAt!).toDateString()}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-haspopup="true" size="icon" variant="ghost">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <Link
              href={
                custom
                  ? `/individual/${blessing._id}`
                  : `/blessings/${blessing._id}`
              }
            >
              <DropdownMenuItem>Edit</DropdownMenuItem>
            </Link>
            <DropdownMenuItem>
              <button type="submit" onClick={onDelete}>
                Delete
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
