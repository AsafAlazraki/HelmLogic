
import { ref, uploadBytes, getDownloadURL, Storage, uploadBytesResumable, UploadTaskSnapshot } from 'firebase/storage';

export async function uploadFileToStorage(
  storage: Storage,
  file: File,
  path: string
): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);
  return downloadURL;
}

export function uploadFileWithProgress(
  storage: Storage,
  file: File,
  path: string,
  onProgress: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      },
      (error) => {
        reject(error);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref)
          .then(downloadURL => resolve(downloadURL))
          .catch(error => reject(error));
      }
    );
  });
}
