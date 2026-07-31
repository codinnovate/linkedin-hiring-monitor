/**
 * Init script applied to every page to reduce automated-browser signals.
 * Uses only standard browser APIs; runs before any page script.
 */
export const STEALTH_INIT_SCRIPT = `
(() => {
  try {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) => {
        if (parameters && parameters.name === "notifications") {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery(parameters);
      };
    }
    if (!window.chrome) {
      Object.defineProperty(window, "chrome", { get: () => ({ runtime: {} }) });
    }
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 });
  } catch (error) {
    // Never let the init script break page execution.
  }
})();
`;
