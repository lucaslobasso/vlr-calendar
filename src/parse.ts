import type { MatchInfo, Stream } from "./types";

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

// ---------- extras: tags, links, streams, region ----------

function absUrl(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, "https://www.vlr.gg/").toString();
  } catch {
    return undefined;
  }
}

/** Team tags from the betting widget (lowercased name → tag), when VLR lists odds. */
export function parseBetTags(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  doc.querySelectorAll(".match-bet-item-team").forEach((el) => {
    const name = clean(el.querySelector(".match-bet-item-team-name")?.textContent).toLowerCase();
    const tag = clean(el.querySelector(".match-bet-item-team-tag")?.textContent);
    if (name && tag && !map.has(name)) map.set(name, tag);
  });
  return map;
}

/** Ordered rules for which streams to keep: the user's picks, then official channels. */
const STREAM_RULES: ((tokens: string[], name: string) => boolean)[] = [
  (t) => t.some((s) => s.includes("sliggy")),
  (t) => t.some((s) => s === "fns" || /^fns(tv|_)/.test(s)),
  (t) => t.some((s) => s.includes("ziks")),
  (t) => t.some((s) => /^s0m/.test(s)),
  (t, name) => t.some((s) => s.includes("valorant")) || /^(vct|val)\b/i.test(name),
];

const PLATFORM: Record<string, string> = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" };

export function parseStreams(doc: Document): Stream[] {
  const out: { s: Stream; rank: number }[] = [];
  const seen = new Set<string>();
  const pane = doc.querySelector(".sm-pane-streams") ?? doc;
  pane.querySelectorAll(".sm-btn").forEach((btn) => {
    const url = absUrl(btn.querySelector("a.sm-ext")?.getAttribute("href"));
    if (!url || seen.has(url)) return;
    const name = clean(btn.querySelector(".sm-name")?.textContent);
    const siteId = btn.querySelector("[data-site-id]")?.getAttribute("data-site-id") ?? "";
    const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const tokens = [name, siteId, slug].map((s) => s.toLowerCase().replace(/^@/, "")).filter(Boolean);
    const rank = STREAM_RULES.findIndex((rule) => rule(tokens, name));
    if (rank < 0) return;
    const site = (btn.getAttribute("data-site") ?? "").toLowerCase();
    const platform = PLATFORM[site] ?? (site ? site[0].toUpperCase() + site.slice(1) : "Stream");
    seen.add(url);
    out.push({ s: { name: name || slug, platform, url }, rank });
  });
  return out.sort((a, b) => a.rank - b.rank).map((x) => x.s);
}

/** VCT region from an event page breadcrumb ("Americas", "EMEA", "Pacific", "China"). */
export function parseEventRegion(doc: Document): string | undefined {
  return clean(doc.querySelector('.event-header-main-bc-tags a[href*="region="]')?.textContent) || undefined;
}

/** Short tag from a team page ("TB3"). */
export function parseTeamTag(doc: Document): string | undefined {
  return clean(doc.querySelector(".team-header-tag")?.textContent) || undefined;
}

/** Adds tags (from odds), stream links and event/team page links found on the match page. */
export function parseMatchExtras(doc: Document, m: MatchInfo): MatchInfo {
  const tags = parseBetTags(doc);
  const ev = absUrl(doc.querySelector("a.match-header-event")?.getAttribute("href"));
  let eventUrl: string | undefined;
  if (ev) {
    const p = new URL(ev).pathname.split("/").filter(Boolean); // event, id, slug, stage?
    if (p[0] === "event" && /^\d+$/.test(p[1] ?? "")) {
      eventUrl = `https://www.vlr.gg/event/${p[1]}${p[2] ? "/" + p[2] : ""}`;
    }
  }
  return {
    ...m,
    tag1: tags.get(m.team1.toLowerCase()),
    tag2: tags.get(m.team2.toLowerCase()),
    streams: parseStreams(doc),
    eventUrl,
    team1Url: absUrl(doc.querySelector("a.match-header-link.mod-1")?.getAttribute("href")),
    team2Url: absUrl(doc.querySelector("a.match-header-link.mod-2")?.getAttribute("href")),
  };
}
