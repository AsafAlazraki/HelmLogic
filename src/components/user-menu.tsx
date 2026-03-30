
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/firebase/provider";
import { signOut } from "firebase/auth";
import { useUser } from "@/firebase/auth/use-user";
import { useRouter } from "next/navigation";

export function UserMenu({ minimal }: { minimal?: boolean }) {
  const auth = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const getFallback = () => {
    if (!user) return "U";
    if (user.displayName) return user.displayName.charAt(0).toUpperCase();
    if (user.email) return user.email.charAt(0).toUpperCase();
    return "U";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary hover:text-white transition-all active:scale-95 border border-primary/10 shadow-sm h-9 w-9 overflow-hidden">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || "User avatar"} />
            <AvatarFallback>{getFallback()}</AvatarFallback>
          </Avatar>
          <span className="sr-only">Toggle user menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user?.email || 'My Account'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!minimal && (
          <>
            <DropdownMenuItem onClick={() => router.push('/settings')}>Settings</DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
