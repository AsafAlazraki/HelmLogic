'use client';
import { ref, uploadBytes, getDownloadURL, type Storage } from 'firebase/storage';

export async function uploadFile(storage: Storage, file: File, path: string): Promise<string> {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
}
