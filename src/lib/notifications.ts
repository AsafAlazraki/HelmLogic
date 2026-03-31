import { Firestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function sendNotification(
  firestore: Firestore,
  userId: string,
  message: string,
  metadata?: Record<string, any>
) {
  await addDoc(collection(firestore, `users/${userId}/notifications`), {
    message,
    isRead: false,
    createdAt: serverTimestamp(),
    ...(metadata || {}),
  });
}
