import { createProvider, isHttpUrl } from "./create-provider.js";

export const teamsProvider = createProvider({
  id: "teams",
  displayName: "Microsoft Teams",
  icon: "teams",
  detectionPatterns: [/^https?:\/\/([\w.-]+\.)?teams\.microsoft\.(com|us)\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return /(^|\.)teams\.microsoft\.(com|us)$/i.test(u.hostname);
    } catch {
      return false;
    }
  },
});
