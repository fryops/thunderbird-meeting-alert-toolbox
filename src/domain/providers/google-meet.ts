import { createProvider, isHttpUrl } from "./create-provider.js";

export const googleMeetProvider = createProvider({
  id: "google-meet",
  displayName: "Google Meet",
  icon: "google-meet",
  detectionPatterns: [/^https?:\/\/meet\.google\.com\/[a-z0-9-]+/i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return (
        u.hostname.toLowerCase() === "meet.google.com" &&
        /^\/[a-z0-9-]+/i.test(u.pathname)
      );
    } catch {
      return false;
    }
  },
});
