'use client';

import { Button } from "@/components/ui/button";
import { useUser } from "@/firebase/auth/use-user";
import { useFirestore } from "@/firebase/provider";
import { doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export default function SettingsPage() {
    const { user, loading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const handleBecomeAdmin = () => {
        if (!user) {
            toast({
                variant: "destructive",
                title: "Not logged in",
                description: "You must be logged in to become an admin.",
            });
            return;
        }

        const userRef = doc(firestore, "users", user.uid);
        
        const userData = {
            role: 'admin'
        };

        setDoc(userRef, userData, { merge: true })
            .then(() => {
                toast({
                    title: "Success!",
                    description: "You are now a HelmLogic Admin.",
                });
            })
            .catch((serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: userRef.path,
                    operation: 'update',
                    requestResourceData: userData,
                });
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p>This is the settings page.</p>
        <Button onClick={handleBecomeAdmin} disabled={loading || !user}>Become HelmLogic Admin</Button>
      </div>
    );
}
