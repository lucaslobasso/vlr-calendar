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

export function buildGoogleUrl(m: MatchInfo): string {
  const end = new Date(m.startUtc.getTime() + durationMinutes(m.bestOf) * 60_000);
  const text = `${m.team1} vs ${m.team2}` + (m.event ? ` — ${m.event}` : "");
  const meta = [m.stage, m.bestOf ? `Bo${m.bestOf}` : undefined].filter(Boolean).join(" · ");
  const details = meta ? `${meta}\n\n${m.url}` : m.url;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text,
    dates: `${gcalDate(m.startUtc)}/${gcalDate(end)}`,
    details,
    location: m.url,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
