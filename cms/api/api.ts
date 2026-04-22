import { GameEvents } from "@/lib/events";

export const apiUrl = process.env.NEXT_PUBLIC_BE_URL;

export function waitForLocalStorageKey(key: string = 'accesstoken') {
  return new Promise((resolve) => {
    const checkKey = () => {
      if (sessionStorage.getItem(key) !== null) {
        resolve(sessionStorage.getItem(key));
      } else {
        setTimeout(checkKey, 1000); // Check every 100ms
      }
    };
    checkKey();
  });
}

export const getAuthHeaders = () => ({
  accesstoken: sessionStorage.getItem('accesstoken')
});

export const request = async <T>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: any
): Promise<T | null> => {
  await waitForLocalStorageKey();
  try {
    const response = await fetch(`${apiUrl}${url}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      } as any
    });

    if (response.ok) {
      // Some endpoints might return empty body (e.g. DELETE)
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    GameEvents.ERROR.push(JSON.parse(await response.text()));
    return null;
  } catch (error) {
    GameEvents.ERROR.push(error as any);
    console.error('Network Error:', error);
    return null;
  }
};
