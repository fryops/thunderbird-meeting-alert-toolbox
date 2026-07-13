import { createProvider, isHttpUrl } from "./create-provider.js";

export const webexProvider = createProvider({
  id: "webex",
  displayName: "Cisco Webex",
  icon: "webex",
  detectionPatterns: [/^https?:\/\/([\w.-]+\.)?webex\.com\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return /(^|\.)webex\.com$/i.test(u.hostname);
    } catch {
      return false;
    }
  },
});
