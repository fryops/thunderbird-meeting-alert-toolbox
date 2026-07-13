import { createProvider, isHttpUrl } from "./create-provider.js";

export const gotoProvider = createProvider({
  id: "goto",
  displayName: "GoTo Meeting",
  icon: "goto",
  detectionPatterns: [/^https?:\/\/meet\.goto\.com\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      return new URL(url).hostname.toLowerCase() === "meet.goto.com";
    } catch {
      return false;
    }
  },
});
