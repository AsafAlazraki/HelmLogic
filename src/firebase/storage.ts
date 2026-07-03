import { ref, uploadBytes, getDownloadURL, type FirebaseStorage as Storage, uploadBytesResumable, UploadTaskSnapshot } from 'firebase/storage';

export async function uploadFileToStorage(
  storage: Storage,
  file: File,
  path: string
): Promise<string> {
  console.log(`[Upload] Starting upload to: ${path}, File: ${file.name}, Size: ${file.size}`);
  if (!storage) {
      console.error('[Upload] Storage instance is null or undefined');
      throw new Error('Storage instance is missing');
  }

  const storageRef = ref(storage, path);
  
  // Use uploadBytes which is standard for File objects
  const uploadPromise = uploadBytes(storageRef, file);
  
  // 60s timeout
  const timeoutPromise = new Promise<any>((_, reject) => 
      setTimeout(() => reject(new Error('Upload timed out after 60 seconds')), 60000)
  );

  try {
    console.log('[Upload] Calling uploadBytes with 60s timeout...');
    const snapshot = await Promise.race([uploadPromise, timeoutPromise]);
    console.log('[Upload] uploadBytes completed. Snapshot:', snapshot);
    
    console.log('[Upload] Calling getDownloadURL...');
    const downloadURL = await getDownloadURL(storageRef);
    console.log('[Upload] getDownloadURL completed:', downloadURL);
    
    return downloadURL;
  } catch (error) {
    console.error('[Upload] Error in uploadFileToStorage:', error);
    throw error;
  }
}

export function uploadFileWithProgress(
  storage: Storage,
  file: File,
  path: string,
  onProgress: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[UploadWithProgress] Starting upload to: ${path}`);
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`[UploadWithProgress] Progress: ${progress}%`);
        onProgress(progress);
      },
      (error) => {
        console.error('[UploadWithProgress] Error:', error);
        reject(error);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref)
          .then(downloadURL => {
              console.log('[UploadWithProgress] Completed. URL:', downloadURL);
              resolve(downloadURL);
          })
          .catch(error => {
              console.error('[UploadWithProgress] Error getting URL:', error);
              reject(error);
          });
      }
    );
  });
}
