export const apiUrl = process.env.NEXT_PUBLIC_BE_URL;

export function waitForLocalStorageKey(key: string = "accesstoken") {
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
  accesstoken: sessionStorage.getItem("accesstoken"),
});
