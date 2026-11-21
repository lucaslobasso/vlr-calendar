import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  easternToUtc,
  matchIdFromHref,
  parseBracketItem,
  parseMatchPage,
  parseMatchExtras,
  parseStreams,
  parseEventRegion,
  parseTeamTag,
} from "../src/parse";

const btn = (site: string, id: string, name: string, href: string) =>
  `<div class="sm-btn" data-site="${site}"><div class="sm-body" data-site-id="${id}"><span class="sm-name">${name}</span></div><a class="sm-ext" href="${href}"></a></div>`;

describe("parseStreams", () => {
  it("keeps Sliggy, FNS, Ziks, s0m and official channels, in that order", () => {
    const html =
      `<div class="sm-pane sm-pane-streams">` +
      btn("twitch", "valorant_americas", "VCT Americas", "https://www.twitch.tv/valorant_americas") +
      btn("twitch", "redbull", "Red Bull", "https://www.twitch.tv/redbull") +
      btn("twitch", "s0mcs", "s0m", "https://www.twitch.tv/s0mcs") +
      btn("twitch", "ziksdotgg", "Ziks", "https://www.twitch.tv/ziksdotgg") +
      btn("twitch", "fns", "FNS", "https://www.twitch.tv/fns") +
      btn("twitch", "sliggytv", "Sliggy", "https://www.twitch.tv/sliggytv") +
      btn("youtube", "UCx", "VAL BR", "https://www.youtube.com/@valorant_br/live") +
      btn("twitch", "fnsfan", "fnsfan", "https://www.twitch.tv/fnsfan") +
      `</div><div class="sm-pane sm-pane-vods">` +
      btn("twitch", "sliggytv", "Sliggy", "https://www.twitch.tv/videos/1") +
      `</div>`;
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(parseStreams(doc).map((s) => `${s.name}|${s.platform}`)).toEqual([
      "Sliggy|Twitch",
      "FNS|Twitch",
      "Ziks|Twitch",
      "s0m|Twitch",
      "VCT Americas|Twitch",
      "VAL BR|YouTube",
    ]);
  });
  it("filters out non-listed streams on a real page", () => {
    expect(parseStreams(load("match-streams.html"))).toEqual([]);
  });
});

describe("extras", () => {
  it("reads tags from odds, event url and team urls", () => {
    const doc = load("match-streams.html");
    const m = parseMatchExtras(doc, parseMatchPage(doc, "https://www.vlr.gg/792904/x")!);
    expect([m.tag1, m.tag2]).toEqual(["FLY", "ENVY"]);
    expect(m.eventUrl).toBe("https://www.vlr.gg/event/3179/vct-2027-america-kickoff-north-america-qualifier-playoffs");
    expect(m.team1Url).toBe("https://www.vlr.gg/team/21838/flyquest");
  });
  it("reads region from event page and tag from team page", () => {
    expect(parseEventRegion(load("event.html"))).toBe("Americas");
    expect(parseTeamTag(load("team.html"))).toBe("TB3");
  });
});

const load = (name: string) =>
  new DOMParser().parseFromString(readFileSync(join(__dirname, "fixtures", name), "utf8"), "text/html");

describe("easternToUtc", () => {
  it("converts EST (winter)", () => {
    expect(easternToUtc("2026-11-21 18:00:00").toISOString()).toBe("2026-11-21T23:00:00.000Z");
    expect(easternToUtc("2026-11-21 19:30:00").toISOString()).toBe("2026-11-22T00:30:00.000Z");
  });
  it("converts EDT (summer)", () => {
    expect(easternToUtc("2026-07-04 12:00:00").toISOString()).toBe("2026-07-04T16:00:00.000Z");
  });
  it("handles spring-forward 2026-03-08", () => {
    expect(easternToUtc("2026-03-08 01:30:00").toISOString()).toBe("2026-03-08T06:30:00.000Z");
    expect(easternToUtc("2026-03-08 03:30:00").toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(easternToUtc("2026-03-07 12:00:00").toISOString()).toBe("2026-03-07T17:00:00.000Z");
    expect(easternToUtc("2026-03-09 12:00:00").toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });
  it("handles fall-back 2026-11-01", () => {
    expect(easternToUtc("2026-11-01 00:30:00").toISOString()).toBe("2026-11-01T04:30:00.000Z");
    expect(easternToUtc("2026-11-01 02:30:00").toISOString()).toBe("2026-11-01T07:30:00.000Z");
    expect(easternToUtc("2026-10-31 12:00:00").toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(easternToUtc("2026-11-02 12:00:00").toISOString()).toBe("2026-11-02T17:00:00.000Z");
    // Ambiguous hour resolves to one of the two valid instants.
    expect(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]).toContain(
      easternToUtc("2026-11-01 01:30:00").toISOString(),
    );
  });
  it("treats digits as epoch seconds", () => {
    expect(easternToUtc("1795723200").toISOString()).toBe("2026-11-26T20:00:00.000Z");
  });
  it("returns Invalid Date on garbage", () => {
    expect(isNaN(easternToUtc("nope").getTime())).toBe(true);
  });
});

describe("matchIdFromHref", () => {
  it("extracts match ids", () => {
    expect(matchIdFromHref("/792033/slug")).toBe("792033");
    expect(matchIdFromHref("https://www.vlr.gg/792033/slug?x=1")).toBe("792033");
    expect(matchIdFromHref("https://vlr.gg/792033")).toBe("792033");
  });
  it("rejects non-match paths and other hosts", () => {
    expect(matchIdFromHref("/event/3183/foo")).toBeNull();
    expect(matchIdFromHref("/team/24507/master-bank")).toBeNull();
    expect(matchIdFromHref("/player/1/x")).toBeNull();
    expect(matchIdFromHref("https://example.com/792033/x")).toBeNull();
  });
});

describe("parseMatchPage", () => {
  it("parses match.html", () => {
    const m = parseMatchPage(load("match.html"), "https://www.vlr.gg/792033/time-do-b3m-vs-master-bank?game=all")!;
    expect(m).not.toBeNull();
    expect(m.id).toBe("792033");
    expect(m.url).toBe("https://www.vlr.gg/792033/time-do-b3m-vs-master-bank");
    expect(m.startUtc.toISOString()).toBe("2026-11-21T23:00:00.000Z");
    expect(m.team1).toBe("TIME DO B3M");
    expect(m.team2).toBe("Master Bank");
    expect(m.bestOf).toBe(3);
    expect(m.event).toBe("VCT 2027: America Kickoff - Brazil Qualifier Playoffs");
    expect(m.stage).toBe("Swiss Stage: Round 2 (0-1)");
    expect(m.upcoming).toBe(true);
  });
  it("parses match-midnight.html", () => {
    const m = parseMatchPage(load("match-midnight.html"), "/792909/x")!;
    expect(m.id).toBe("792909");
    expect(m.startUtc.toISOString()).toBe("2026-11-22T00:30:00.000Z");
    expect(m.upcoming).toBe(true);
  });
  it("marks live/final as not upcoming", () => {
    const doc = load("match.html");
    const note = doc.querySelector(".match-header-vs-note.mod-upcoming")!;
    note.className = "match-header-vs-note mod-live";
    note.textContent = "live";
    expect(parseMatchPage(doc, "/792033/x")!.upcoming).toBe(false);
    note.className = "match-header-vs-note";
    note.textContent = "final";
    expect(parseMatchPage(doc, "/792033/x")!.upcoming).toBe(false);
  });
  it("returns null without a timestamp", () => {
    expect(parseMatchPage(new DOMParser().parseFromString("<p></p>", "text/html"), "/1/x")).toBeNull();
  });
});

describe("parseBracketItem", () => {
  it("parses the first bracket item", () => {
    const a = load("bracket.html").querySelector<HTMLAnchorElement>("a.bracket-item")!;
    const m = parseBracketItem(a)!;
    expect(m.id).toBe("792042");
    expect(m.startUtc.toISOString()).toBe("2026-11-26T20:00:00.000Z");
    expect(m.team1).toBe("TBD");
    expect(m.team2).toBe("TBD");
    expect(m.upcoming).toBe(true);
  });
  it("returns null without timestamp; detects scores", () => {
    const doc = new DOMParser().parseFromString(
      `<a class="bracket-item" title="A vs. B" href="/5/a-vs-b"><div class="bracket-item-team-score">2</div></a>
       <a class="bracket-item" title="A vs. B" href="/6/a-vs-b"><div class="bracket-item-team-score">2</div>
       <div class="bracket-item-status" data-utc-ts="1795723200"></div></a>`,
      "text/html",
    );
    const [a1, a2] = Array.from(doc.querySelectorAll<HTMLAnchorElement>("a"));
    expect(parseBracketItem(a1)).toBeNull();
    const m = parseBracketItem(a2)!;
    expect(m.team1).toBe("A");
    expect(m.team2).toBe("B");
    expect(m.upcoming).toBe(false);
  });
});
