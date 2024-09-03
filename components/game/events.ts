export const setIsGameLoaded = () => {
  const event = new CustomEvent("game-loaded", {
    detail: { start: true },
  });

  window.dispatchEvent(event);
};
