import { GameEvents, IError } from "@/lib/events";

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

// Callers await waitForLocalStorageKey() before building headers, so the
// token is present by the time this runs.
export const getAuthHeaders = (): Record<string, string> => ({
  accesstoken: sessionStorage.getItem('accesstoken') as string
});

export const request = async <T>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown
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
      }
    });

    if (response.ok) {
      // Some endpoints might return empty body (e.g. DELETE)
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    GameEvents.ERROR.push(JSON.parse(await response.text()));
    return null;
  } catch (error) {
    GameEvents.ERROR.push(error as IError);
    console.error('Network Error:', error);
    return null;
  }
};
