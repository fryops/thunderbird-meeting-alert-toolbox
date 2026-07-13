import { createProvider, isHttpUrl } from "./create-provider.js";

export const jitsiProvider = createProvider({
  id: "jitsi",
  displayName: "Jitsi Meet",
  icon: "jitsi",
  detectionPatterns: [/^https?:\/\/meet\.jit\.si\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return u.hostname.toLowerCase() === "meet.jit.si" && u.pathname.length > 1;
    } catch {
      return false;
    }
  },
});
