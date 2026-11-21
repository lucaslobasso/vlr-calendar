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
    expect(btn.title).toBe("Add to Google Calendar");
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
    expect(btn.title).toBe("Couldn't read match time");
  });
});
