import type { MatchInfo } from "./types";

export function durationMinutes(bestOf?: 1 | 3 | 5): number {
  switch (bestOf) {
    case 1:
      return 75;
    case 5:
      return 300;
    default:
      return 180;
  }
}

function gcalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** "FLY vs NV - Americas" (falls back to full names / no region). */
export function buildTitle(m: MatchInfo): string {
  const t = `${m.tag1 || m.team1} vs ${m.tag2 || m.team2}`;
  return m.region ? `${t} - ${m.region}` : t;
}

/**
 * Full team names
 * Full event name
 *
 * VLR match link
 */
export function buildDetails(m: MatchInfo): string {
  const head = [`${m.team1} vs ${m.team2}`, m.event].filter(Boolean).join("\n");
  return `${head}\n\n${m.url}`;
}

export function buildGoogleUrl(m: MatchInfo): string {
  const end = new Date(m.startUtc.getTime() + durationMinutes(m.bestOf) * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: buildTitle(m),
    dates: `${gcalDate(m.startUtc)}/${gcalDate(end)}`,
    details: buildDetails(m),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
