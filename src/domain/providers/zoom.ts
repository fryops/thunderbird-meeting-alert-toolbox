import { createProvider, isHttpUrl } from "./create-provider.js";

export const zoomProvider = createProvider({
  id: "zoom",
  displayName: "Zoom",
  icon: "zoom",
  detectionPatterns: [
    /^zoommtg:\/\//i,
    /^https?:\/\/([\w-]+\.)?zoom\.us\/j\//i,
  ],
  validate: (url) => {
    if (url.toLowerCase().startsWith("zoommtg://")) return true;
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return /(\.|^)zoom\.us$/i.test(u.hostname) && /\/j\//i.test(u.pathname);
    } catch {
      return false;
    }
  },
});
