import { buildGoogleUrl, buildTitle, buildDetails, durationMinutes } from "../src/gcal";
import type { MatchInfo } from "../src/types";

const base: MatchInfo = {
  id: "792904",
  url: "https://www.vlr.gg/792904/flyquest-vs-envy",
  team1: "FlyQuest",
  team2: "ENVY",
  tag1: "FLY",
  tag2: "NV",
  region: "Americas",
  event: "VCT 2027: America Kickoff - North America Qualifier Playoffs",
  stage: "Playoffs: Round 2",
  bestOf: 3,
  startUtc: new Date("2026-11-21T23:00:00Z"),
  upcoming: true,
};

describe("durationMinutes", () => {
  it("maps best-of to minutes", () => {
    expect(durationMinutes(1)).toBe(75);
    expect(durationMinutes(3)).toBe(180);
    expect(durationMinutes(5)).toBe(300);
    expect(durationMinutes(undefined)).toBe(180);
  });
});

describe("buildTitle", () => {
  it("uses tags and region", () => expect(buildTitle(base)).toBe("FLY vs NV - Americas"));
  it("falls back to full names and drops region", () =>
    expect(buildTitle({ ...base, tag1: undefined, tag2: undefined, region: undefined })).toBe("FlyQuest vs ENVY"));
});

describe("buildDetails", () => {
  it("names, event, blank, link", () => {
    expect(buildDetails(base)).toBe(
      ["FlyQuest vs ENVY", "VCT 2027: America Kickoff - North America Qualifier Playoffs", "", base.url].join("\n"),
    );
  });
  it("skips the event line when unknown", () => {
    expect(buildDetails({ ...base, event: undefined })).toBe(`FlyQuest vs ENVY\n\n${base.url}`);
  });
});

describe("buildGoogleUrl", () => {
  it("builds the template URL without a location", () => {
    const u = new URL(buildGoogleUrl(base));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    const p = u.searchParams;
    expect(p.get("action")).toBe("TEMPLATE");
    expect(p.get("text")).toBe("FLY vs NV - Americas");
    expect(p.get("dates")).toBe("20261121T230000Z/20261122T020000Z");
    expect(p.get("details")).toBe(buildDetails(base));
    expect(p.has("location")).toBe(false);
  });
  it("uses Bo1 duration", () => {
    const p = new URL(buildGoogleUrl({ ...base, bestOf: 1 })).searchParams;
    expect(p.get("dates")).toBe("20261121T230000Z/20261122T001500Z");
  });
});
