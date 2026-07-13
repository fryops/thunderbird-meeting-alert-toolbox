import { createProvider, isHttpUrl } from "./create-provider.js";

export const discordProvider = createProvider({
  id: "discord",
  displayName: "Discord",
  icon: "discord",
  detectionPatterns: [
    /^https?:\/\/(www\.)?discord\.gg\//i,
    /^https?:\/\/(www\.)?discord\.com\/(invite|channels)\//i,
  ],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (host === "discord.gg" || host === "www.discord.gg") return u.pathname.length > 1;
      if (host === "discord.com" || host === "www.discord.com") {
        return /^\/(invite|channels)\//i.test(u.pathname);
      }
      return false;
    } catch {
      return false;
    }
  },
});
