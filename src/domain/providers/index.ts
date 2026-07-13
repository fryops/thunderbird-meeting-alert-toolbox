import type { MeetingProvider } from "../meeting-provider.js";
import { discordProvider } from "./discord.js";
import { googleMeetProvider } from "./google-meet.js";
import { gotoProvider } from "./goto.js";
import { jitsiProvider } from "./jitsi.js";
import { slackProvider } from "./slack.js";
import { teamsProvider } from "./teams.js";
import { webexProvider } from "./webex.js";
import { zoomProvider } from "./zoom.js";

export function createDefaultProviders(): MeetingProvider[] {
  return [
    zoomProvider,
    teamsProvider,
    googleMeetProvider,
    webexProvider,
    gotoProvider,
    slackProvider,
    discordProvider,
    jitsiProvider,
  ];
}
