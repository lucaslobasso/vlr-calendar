import { buildGoogleUrl, durationMinutes } from "../src/gcal";
import type { MatchInfo } from "../src/types";

const base: MatchInfo = {
  id: "792033",
  url: "https://www.vlr.gg/792033/time-do-b3m-vs-master-bank",
  team1: "TIME DO B3M",
  team2: "Master Bank",
  event: "VCT 2027: America Kickoff - Brazil Qualifier Playoffs",
  stage: "Swiss Stage: Round 2 (0-1)",
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

describe("buildGoogleUrl", () => {
  it("builds a full template URL", () => {
    const u = new URL(buildGoogleUrl(base));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    const p = u.searchParams;
    expect(p.get("action")).toBe("TEMPLATE");
    expect(p.get("text")).toBe("TIME DO B3M vs Master Bank — VCT 2027: America Kickoff - Brazil Qualifier Playoffs");
    expect(p.get("dates")).toBe("20261121T230000Z/20261122T020000Z");
    expect(p.get("details")).toBe(`Swiss Stage: Round 2 (0-1) · Bo3\n\n${base.url}`);
    expect(p.get("location")).toBe(base.url);
  });
  it("omits missing event/stage/bestOf", () => {
    const p = new URL(
      buildGoogleUrl({ ...base, event: undefined, stage: undefined, bestOf: undefined }),
    ).searchParams;
    expect(p.get("text")).toBe("TIME DO B3M vs Master Bank");
    expect(p.get("dates")).toBe("20261121T230000Z/20261122T020000Z");
    expect(p.get("details")).toBe(base.url);
  });
  it("uses Bo1 duration", () => {
    const p = new URL(buildGoogleUrl({ ...base, bestOf: 1, stage: undefined })).searchParams;
    expect(p.get("dates")).toBe("20261121T230000Z/20261122T001500Z");
    expect(p.get("details")).toBe(`Bo1\n\n${base.url}`);
  });
});
