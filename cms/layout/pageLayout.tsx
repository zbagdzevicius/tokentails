'use client';

import { Cat, PanelLeft, Users2, Home, Quote, Settings } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { User } from '@/components/users/user';
import { NavItem } from './nav-item';

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      className="flex min-h-screen w-full flex-col relative"
    >
      <div className='fixed inset-0 bg-[url(/bg-5.webp)] bg-cover bg-center bg-no-repeat fixed h-screen w-screen z-0' />
      <DesktopNav />
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14 relative z-10">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between md:justify-end gap-4 px-4 sm:static bg-background/25 sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <MobileNav />
          <User />
        </header>
        <Link href='/' className="flex items-center gap-4 justify-center items-center">
          <img src="/logo.webp" className="w-12 md:w-20"/>
          <div className="font-primary font-bold tracking-widest uppercase text-2xl md:text-4xl w-fit flex flex-col">
            <div>Token Tails</div>
            <div className='text-sm text-center'>FOR CATS SHELTERS</div>
            
            </div>
        </Link>
        <main className="grid flex-1 items-start gap-2 p-4 sm:px-6 sm:py-0 md:gap-4">
          {children}
        </main>
      </div>
    </main>
  );
}

function DesktopNav() {
  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col bg-background/25 bg-opacity-10 sm:flex z-20">
      <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
        <NavItem href="/blessings" label="Shelter Cats">
          <Cat className="h-5 w-5" />
        </NavItem>

        <NavItem href="/users" label="Users">
          <Users2 className="h-5 w-5" />
        </NavItem>

        <NavItem href="/shelters" label="Home">
          <Home className="h-5 w-5" />
        </NavItem>

        <NavItem href="/quests" label="Quests">
          <Quote className="h-5 w-5" />
        </NavItem>

        <NavItem href="/individual" label="Individual">
          <Settings className="h-5 w-5" />
        </NavItem>
      </nav>
    </aside>
  );
}

function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon" variant="outline" className="sm:hidden">
          <PanelLeft className="h-5 w-5" />
          <span className="sr-only">Toggle Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="sm:max-w-xs">
        <nav className="grid gap-6 text-lg font-medium">
          <Link
            href="/blessings"
            className="flex items-center gap-4 px-2.5 text-foreground"
          >
            <Cat className="h-5 w-5" />
            Blessings
          </Link>
          <Link
            href="/users"
            className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground"
          >
            <Users2 className="h-5 w-5" />
            Users
          </Link>
          <Link
            href="/shelters"
            className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground"
          >
            <Users2 className="h-5 w-5" />
            Shelters
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
