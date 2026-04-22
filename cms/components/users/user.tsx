import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useProfile } from '@/context/ProfileContext';
import Image from 'next/image';

export function User() {
  const { profile } = useProfile();
  const {logout, showSignInPopup} = useFirebaseAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="overflow-hidden rounded-full"
        >
          <Image
            src={'/placeholder-user.jpg'}
            width={36}
            height={36}
            alt="Avatar"
            className="overflow-hidden rounded-full"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSeparator />
        {profile ? (
          <DropdownMenuItem>
            <button onClick={logout}>Sign Out</button>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem>
            <button onClick={showSignInPopup}>Sign In</button>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
