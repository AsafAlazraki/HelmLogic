'use client';

import { useCollection } from "@/firebase/firestore/use-collection";
import { useUser } from "@/firebase/auth/use-user";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { collection, query, orderBy, doc, updateDoc, writeBatch } from "firebase/firestore";
import { Bell, Check, Trash2, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Notification {
    id: string;
    message: string;
    type: string;
    isRead: boolean;
    createdAt: string;
}

export function NotificationBell() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const notificationsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(
            collection(firestore, `users/${user.uid}/notifications`),
            orderBy('createdAt', 'desc')
        );
    }, [firestore, user]);

    const { data: notifications, loading } = useCollection<Notification>(notificationsQuery);

    const unreadCount = useMemo(() => 
        notifications?.filter(n => !n.isRead).length || 0,
    [notifications]);

    const handleMarkAsRead = async (id: string) => {
        if (!user) return;
        try {
            await updateDoc(doc(firestore, `users/${user.uid}/notifications`, id), {
                isRead: true
            });
        } catch (error) {
            console.error("Failed to mark as read:", error);
        }
    };

    const handleMarkAllRead = async () => {
        if (!user || !notifications) return;
        const batch = writeBatch(firestore);
        notifications.forEach(n => {
            if (!n.isRead) {
                batch.update(doc(firestore, `users/${user.uid}/notifications`, n.id), { isRead: true });
            }
        });
        try {
            await batch.commit();
            toast({ title: "All notifications marked as read." });
        } catch (error) {
            console.error("Failed to mark all as read:", error);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                            {unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between p-4 pb-2">
                    <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
                    {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary" onClick={handleMarkAllRead}>
                            Mark all as read
                        </Button>
                    )}
                </div>
                <DropdownMenuSeparator />
                <div className="max-h-[400px] overflow-auto">
                    {loading ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
                    ) : notifications && notifications.length > 0 ? (
                        notifications.map(n => (
                            <DropdownMenuItem 
                                key={n.id} 
                                className={cn(
                                    "flex flex-col items-start p-4 gap-1 cursor-default focus:bg-accent",
                                    !n.isRead && "bg-accent/30 font-medium"
                                )}
                                onClick={() => !n.isRead && handleMarkAsRead(n.id)}
                            >
                                <div className="flex w-full items-start justify-between gap-2">
                                    <span className="text-sm line-clamp-2">{n.message}</span>
                                    {!n.isRead && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                                </div>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                    {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : 'Recently'}
                                </span>
                            </DropdownMenuItem>
                        ))
                    ) : (
                        <div className="p-8 text-center flex flex-col items-center gap-2 text-muted-foreground">
                            <MailOpen className="h-8 w-8 opacity-20" />
                            <p className="text-sm">No new notifications.</p>
                        </div>
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}