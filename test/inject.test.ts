import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { injectAll } from "../src/inject";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");
const load = (n: string) => {
  document.body.innerHTML = new DOMParser().parseFromString(fx(n), "text/html").body.innerHTML;
};
const loc = (p: string) => ({ pathname: p }) as Location;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("injectAll", () => {
  it("matches list: upcoming only, idempotent", () => {
    load("matches.html");
    const n = injectAll(document, loc("/matches"));
    expect(n).toBeGreaterThan(0);
    expect(document.querySelectorAll(".vlrcal-btn").length).toBe(n);
    document.querySelectorAll("a.match-item").forEach((a) => {
      const st = a.querySelector(".ml-status")?.textContent?.trim();
      const has = !!a.querySelector(".vlrcal-btn");
      expect(has).toBe(st === "Upcoming");
    });
    expect(injectAll(document, loc("/matches"))).toBe(0);
  });

  it("event matches list", () => {
    load("evmatches.html");
    const n = injectAll(document, loc("/event/matches/1/x"));
    expect(n).toBeGreaterThan(0);
    document.querySelectorAll("a.match-item").forEach((a) => {
      const st = a.querySelector(".ml-status")?.textContent?.trim();
      expect(!!a.querySelector(".vlrcal-btn")).toBe(st === "Upcoming");
    });
    expect(injectAll(document, loc("/event/matches/1/x"))).toBe(0);
  });

  it("bracket", () => {
    load("bracket.html");
    expect(injectAll(document, loc("/event/1/x"))).toBeGreaterThan(0);
    expect(injectAll(document, loc("/event/1/x"))).toBe(0);
  });

  it("event overview: sidebar + groups, skips live/completed", () => {
    load("event.html");
    const n = injectAll(document, loc("/event/1/x"));
    expect(n).toBeGreaterThan(0);
    document.querySelectorAll("a.event-group-series-match").forEach((a) => {
      const done = /\d/.test(a.querySelector(".score-left")?.textContent ?? "");
      expect(!!a.querySelector(".vlrcal-btn")).toBe(!done);
    });
    document.querySelectorAll("a.wf-module-item").forEach((a) => {
      if (!a.querySelector(".event-sidebar-matches-team")) return;
      expect(!!a.querySelector(".vlrcal-btn")).toBe(!!a.querySelector(".score.mod-upcoming"));
    });
    expect(injectAll(document, loc("/event/1/x"))).toBe(0);
  });

  it("match page", () => {
    load("match.html");
    expect(injectAll(document, loc("/12345/a-vs-b"))).toBe(1);
    expect(document.querySelector(".match-header-date .vlrcal-btn")).not.toBeNull();
    expect(injectAll(document, loc("/12345/a-vs-b"))).toBe(0);
  });

  it("click prevents default, fetches and opens google calendar", async () => {
    const html = fx("match.html");
    load("match.html");
    injectAll(document, loc("/12345/a-vs-b"));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => html });
    vi.stubGlobal("fetch", fetchMock);
    const win = { location: { href: "" }, close: vi.fn(), opener: {} };
    const open = vi.fn().mockReturnValue(win);
    vi.stubGlobal("open", open);
    window.open = open as unknown as typeof window.open;

    const btn = document.querySelector<HTMLButtonElement>(".vlrcal-btn")!;
    expect(btn.getAttribute("aria-label")).toBe("Add to Google Calendar");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(win.location.href).toContain("calendar.google.com"));
    expect(fetchMock).toHaveBeenCalledWith("/12345", { credentials: "same-origin" });

    // second click uses cache synchronously
    open.mockClear();
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toContain("calendar.google.com");
  });

  it("failure sets error state and closes window", async () => {
    load("match.html");
    injectAll(document, loc("/99999/a-vs-b"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("x")));
    const win = { location: { href: "" }, close: vi.fn() };
    window.open = vi.fn().mockReturnValue(win) as unknown as typeof window.open;
    const btn = document.querySelector<HTMLButtonElement>(".vlrcal-btn")!;
    btn.click();
    await vi.waitFor(() => expect(btn.classList.contains("vlrcal-error")).toBe(true));
    expect(win.close).toHaveBeenCalled();
    expect(btn.getAttribute("aria-label")).toBe("Couldn't read match time");
  });

  it("enriches with region (event page) and tags", async () => {
    load("match.html"); // upcoming page provides the button; fetch serves the streams fixture
    injectAll(document, loc("/55555/fly-vs-envy"));
    const fetchMock = vi.fn(async (path: string) => {
      const body =
        path === "/55555" ? fx("match-streams.html") : path.startsWith("/event/") ? fx("event.html") : undefined;
      return body ? { ok: true, text: async () => body } : { ok: false, text: async () => "" };
    });
    vi.stubGlobal("fetch", fetchMock);
    const win = { location: { href: "" }, close: vi.fn(), opener: {} };
    window.open = vi.fn().mockReturnValue(win) as unknown as typeof window.open;

    document.querySelector<HTMLButtonElement>(".vlrcal-btn")!.click();
    await vi.waitFor(() => expect(win.location.href).toContain("calendar.google.com"));
    const p = new URL(win.location.href).searchParams;
    expect(p.get("text")).toBe("FLY vs ENVY - Americas");
    expect(p.get("location")).toBeNull();
    const details = p.get("details")!;
    expect(details).toBe(
      "FlyQuest vs ENVY\nVCT 2027: America Kickoff - North America Qualifier Playoffs\n\nhttps://www.vlr.gg/55555",
    );
    // team pages not needed: tags came from the odds widget
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/team/"))).toBe(false);
  });

  it("shows a body-level tooltip on hover", () => {
    load("matches.html");
    injectAll(document, loc("/matches"));
    const btn = document.querySelector<HTMLButtonElement>(".vlrcal-btn")!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text: async () => "" }));
    btn.dispatchEvent(new MouseEvent("mouseenter"));
    const tip = document.querySelector(".vlrcal-tip");
    expect(tip?.parentElement).toBe(document.body);
    expect(tip?.classList.contains("vlrcal-tip-on")).toBe(true);
    expect(tip?.textContent).toBe("Add to Google Calendar");
    btn.dispatchEvent(new MouseEvent("mouseleave"));
    expect(tip?.classList.contains("vlrcal-tip-on")).toBe(false);
  });
});
