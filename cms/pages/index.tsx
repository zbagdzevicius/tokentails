'use client';

import { useProfile } from '@/context/ProfileContext';
import { Cat, House, Quote, Users2 } from 'lucide-react';
import Link from 'next/link';

export default function BlessingsPage() {
  const { profile } = useProfile();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-5xl md:text-7xl font-paws text-center">WELCOME</h1>
      <nav className="grid gap-6 text-lg font-medium items-center justify-center">
        <Link
          href="/blessings"
          className="flex items-center gap-2 text-foreground bg-white hover:bg-gray-200 w-fit uppercase rounded-lg px-2 md:px-8 py-2 font-primary"
        >
          <Cat className="h-5 w-5" />
          Manage MY Shelter Cats
        </Link>
        {(profile?.permission || 0) >= 3 && (
          <>
            <Link
              href="/users"
              className="flex items-center gap-2 text-foreground bg-white hover:bg-gray-200 w-fit uppercase rounded-lg px-2 md:px-8 py-2 font-primary"
            >
              <Users2 className="h-5 w-5" />
              Manage Users
            </Link>
            <Link
              href="/shelters"
              className="flex items-center gap-2 text-foreground bg-white hover:bg-gray-200 w-fit uppercase rounded-lg px-2 md:px-8 py-2 font-primary"
            >
              <House className="h-5 w-5" />
              Manage shelters
            </Link>
            <Link
              href="/quests"
              className="flex items-center gap-2 text-foreground bg-white hover:bg-gray-200 w-fit uppercase rounded-lg px-2 md:px-8 py-2 font-primary"
            >
              <Quote className="h-5 w-5" />
              Manage Quests
            </Link>
            <Link
              href="/tickets"
              className="flex items-center gap-2 text-foreground bg-white hover:bg-gray-200 w-fit uppercase rounded-lg px-2 md:px-8 py-2 font-primary"
            >
              <Quote className="h-5 w-5" />
              Manage Tickets
            </Link>
            <Link
              href="/giveaway"
              className="flex items-center gap-2 text-foreground bg-white hover:bg-gray-200 w-fit uppercase rounded-lg px-2 md:px-8 py-2 font-primary"
            >
              <Quote className="h-5 w-5" />
              Manage Giveaways
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}
