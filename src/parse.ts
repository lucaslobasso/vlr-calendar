import type { MatchInfo } from "./types";

const NY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Wall-clock time in New York for an instant, expressed as if it were UTC (ms). */
function nyWallMs(utcMs: number): number {
  const p: Record<string, number> = {};
  for (const part of NY_FMT.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
}

/**
 * VLR's match-page `data-utc-ts` ("YYYY-MM-DD HH:mm:ss") is really America/New_York
 * local time. A pure-digits string is a Unix epoch in seconds (real UTC).
 */
export function easternToUtc(s: string): Date {
  const t = s.trim();
  if (/^\d+$/.test(t)) return new Date(Number(t) * 1000);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return new Date(NaN);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // Iterate: guess = wall - offset(guess).
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const offset = nyWallMs(guess) - guess;
    const next = wall - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

export function matchIdFromHref(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href, "https://www.vlr.gg/");
  } catch {
    return null;
  }
  if (!/(^|\.)vlr\.gg$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(href: string, id: string): string {
  try {
    const u = new URL(href, "https://www.vlr.gg/");
    const slug = u.pathname.split("/").filter(Boolean)[1];
    return slug ? `https://www.vlr.gg/${id}/${slug}` : `https://www.vlr.gg/${id}`;
  } catch {
    return `https://www.vlr.gg/${id}`;
  }
}

export function parseMatchPage(doc: Document, url: string): MatchInfo | null {
  const id = matchIdFromHref(url);
  if (!id) return null;
  const tsEl = doc.querySelector(".match-header-date .moment-tz-convert[data-utc-ts]");
  const ts = tsEl?.getAttribute("data-utc-ts");
  if (!ts) return null;
  const startUtc = easternToUtc(ts);
  if (isNaN(startUtc.getTime())) return null;

  const team = (n: 1 | 2) =>
    clean(doc.querySelector(`.match-header-link-name.mod-${n} .wf-title-med`)?.textContent) || "TBD";

  const eventLink = doc.querySelector("a.match-header-event");
  let event: string | undefined;
  if (eventLink) {
    for (const div of Array.from(eventLink.querySelectorAll("div"))) {
      const fw = (div as HTMLElement).style?.fontWeight || "";
      if (fw === "700" || fw === "bold" || /font-weight:\s*(700|bold)/.test(div.getAttribute("style") ?? "")) {
        event = clean(div.textContent) || undefined;
        break;
      }
    }
  }
  const stage = clean(doc.querySelector(".match-header-event-series")?.textContent) || undefined;

  const notes = Array.from(doc.querySelectorAll(".match-header-vs-note"));
  let bestOf: 1 | 3 | 5 | undefined;
  for (const n of notes) {
    const bm = clean(n.textContent).match(/Bo([135])\b/i);
    if (bm) {
      bestOf = Number(bm[1]) as 1 | 3 | 5;
      break;
    }
  }
  const isLive = notes.some((n) => n.classList.contains("mod-live") || /^live$/i.test(clean(n.textContent)));
  const isFinal = notes.some((n) => /^final$/i.test(clean(n.textContent)));
  const upcoming = !!doc.querySelector(".match-header-vs-note.mod-upcoming") && !isLive && !isFinal;

  return {
    id,
    url: normalizeUrl(url, id),
    team1: team(1),
    team2: team(2),
    event,
    stage,
    bestOf,
    startUtc,
    upcoming,
  };
}

export function parseBracketItem(a: HTMLAnchorElement): MatchInfo | null {
  const href = a.getAttribute("href") ?? "";
  const id = matchIdFromHref(href);
  if (!id) return null;
  const ts = a.querySelector(".bracket-item-status[data-utc-ts]")?.getAttribute("data-utc-ts");
  if (!ts || !ts.trim()) return null;
  const startUtc = easternToUtc(ts);
  if (isNaN(startUtc.getTime())) return null;
  const [t1, t2] = (a.getAttribute("title") ?? "").split(/\s+vs\.?\s+/i).map((s) => clean(s));
  const upcoming = Array.from(a.querySelectorAll(".bracket-item-team-score")).every(
    (el) => clean(el.textContent) === "",
  );
  return {
    id,
    url: normalizeUrl(href, id),
    team1: t1 || "TBD",
    team2: t2 || "TBD",
    startUtc,
    upcoming,
  };
}
