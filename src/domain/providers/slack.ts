import { createProvider, isHttpUrl } from "./create-provider.js";

export const slackProvider = createProvider({
  id: "slack",
  displayName: "Slack",
  icon: "slack",
  detectionPatterns: [/^https?:\/\/app\.slack\.com\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return (
        u.hostname.toLowerCase() === "app.slack.com" &&
        (/^\/huddle\//i.test(u.pathname) || /^\/client\//i.test(u.pathname))
      );
    } catch {
      return false;
    }
  },
});
