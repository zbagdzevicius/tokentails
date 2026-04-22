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
import { IQuest } from '@/models/quest';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

export default function Quest({
  quest,
  onDelete
}: {
  quest: IQuest;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{quest.name}</TableCell>
      <TableCell className="font-medium">
        <img src={quest.image?.url} className="w-auto h-32 object-contain" />
      </TableCell>
      <TableCell className="font-medium">
        <a
          href={quest.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          {quest.link}
        </a>
      </TableCell>
      <TableCell className="font-medium">{quest.catpoints}</TableCell>
      <TableCell className="font-medium">{quest.tails}</TableCell>
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
            <Link href={`/quests/${quest._id}`}>
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
