import { IImage } from '@/models/image';
import { waitForLocalStorageKey, apiUrl, getAuthHeaders } from './api';

async function uploadImage(
  blob: File,
  { name }: { name?: string } = {}
): Promise<IImage> {
  await waitForLocalStorageKey();
  const formData: FormData = new FormData();
  formData.append('file', blob);
  formData.append('name', name || '');

  return fetch(`${apiUrl}/image`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...getAuthHeaders()
    } as any,
    body: formData
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return null;
  });
}

export const IMAGE_API = {
  uploadImage
};
