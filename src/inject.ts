import type { MatchInfo } from "./types";
import { matchIdFromHref, parseMatchPage, parseBracketItem } from "./parse";
import { buildGoogleUrl } from "./gcal";

const TIP = "Add to Google Calendar";
const TIP_ERR = "Couldn't read match time";
const MARK = "data-vlrcal";

const ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 13v6M9 16h6"/></svg>';

const promises = new Map<string, Promise<MatchInfo | null>>();
const resolved = new Map<string, MatchInfo>();

async function load(id: string, anchor: Element | null): Promise<MatchInfo | null> {
  let info: MatchInfo | null = null;
  try {
    const res = await fetch(`/${id}`, { credentials: "same-origin" });
    if (res.ok) {
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      info = parseMatchPage(doc, `https://www.vlr.gg/${id}`);
    }
  } catch {
    info = null;
  }
  if (!info && anchor && anchor.matches("a.bracket-item")) {
    try {
      info = parseBracketItem(anchor as HTMLAnchorElement);
    } catch {
      info = null;
    }
  }
  return info;
}

function prefetch(id: string, anchor: Element | null): Promise<MatchInfo | null> {
  let p = promises.get(id);
  if (!p) {
    p = load(id, anchor).then((info) => {
      if (info) resolved.set(id, info);
      else promises.delete(id); // allow retry
      return info;
    });
    promises.set(id, p);
  }
  return p;
}

function setError(btn: HTMLElement, on: boolean): void {
  btn.classList.toggle("vlrcal-error", on);
  const tip = on ? TIP_ERR : TIP;
  btn.setAttribute("data-tip", tip);
  btn.title = tip;
  btn.setAttribute("aria-label", tip);
}

function makeButton(id: string, anchor: Element | null): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "vlrcal-btn";
  btn.innerHTML = ICON;
  setError(btn, false);
  const warm = () => void prefetch(id, anchor);
  btn.addEventListener("mouseenter", warm);
  btn.addEventListener("focus", warm);
  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (btn.classList.contains("vlrcal-loading")) return;
    setError(btn, false);
    const hit = resolved.get(id);
    if (hit) {
      window.open(buildGoogleUrl(hit), "_blank", "noopener");
      return;
    }
    const w = window.open("about:blank", "_blank");
    btn.classList.add("vlrcal-loading");
    try {
      const info = await prefetch(id, anchor);
      if (!info) throw new Error("no match info");
      const url = buildGoogleUrl(info);
      if (w) {
        try {
          w.opener = null;
        } catch {
          /* ignore */
        }
        w.location.href = url;
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch {
      if (w) w.close();
      setError(btn, true);
    } finally {
      btn.classList.remove("vlrcal-loading");
    }
  });
  return btn;
}

function idOf(a: Element): string | null {
  const href = a.getAttribute("href");
  return href ? matchIdFromHref(href) : null;
}

function attach(a: Element, host: Element | null): number {
  const id = idOf(a);
  if (!id || !host) return 0;
  a.setAttribute(MARK, "1");
  host.appendChild(makeButton(id, a));
  return 1;
}

const txt = (e: Element | null | undefined) => (e?.textContent ?? "").trim();

export function injectAll(root: ParentNode = document, loc: Pick<Location, "pathname"> = location): number {
  let n = 0;

  // Match page
  const m = /^\/(\d+)(?:\/|$)/.exec(loc.pathname);
  if (m) {
    const date = root.querySelector(".match-header-date");
    if (
      date &&
      !date.querySelector(".vlrcal-btn") &&
      root.querySelector(".match-header-vs-note.mod-upcoming")
    ) {
      date.appendChild(makeButton(m[1], null));
      n++;
    }
  }

  // Match list rows
  root.querySelectorAll(`a.match-item:not([${MARK}])`).forEach((a) => {
    if (txt(a.querySelector(".ml-status")).toLowerCase() !== "upcoming") return;
    n += attach(a, a.querySelector(".match-item-time"));
  });

  // Bracket
  root.querySelectorAll(`a.bracket-item:not([${MARK}])`).forEach((a) => {
    const scores = Array.from(a.querySelectorAll(".bracket-item-team-score"));
    if (!scores.length || scores.some((s) => txt(s) !== "")) return;
    n += attach(a, a.querySelector(".bracket-item-status"));
  });

  // Event sidebar
  root.querySelectorAll(`a.wf-module-item:not([${MARK}])`).forEach((a) => {
    if (a.classList.contains("match-item")) return;
    if (!a.querySelector(".event-sidebar-matches-team")) return;
    if (!a.querySelector(".score.mod-upcoming")) return;
    n += attach(a, a.querySelector(".event-sidebar-matches-series"));
  });

  // Event overview groups
  root.querySelectorAll(`a.event-group-series-match:not([${MARK}])`).forEach((a) => {
    const l = txt(a.querySelector(".score-left"));
    const r = txt(a.querySelector(".score-right"));
    if (/\d/.test(l) || /\d/.test(r)) return;
    const host = a.firstElementChild;
    n += attach(a, host);
  });

  return n;
}

export function start(): void {
  injectAll();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const obs = new MutationObserver((muts) => {
    if (muts.every((mu) => Array.from(mu.addedNodes).every((nd) => (nd as Element).classList?.contains("vlrcal-btn")) && mu.removedNodes.length === 0)) return;
    clearTimeout(timer);
    timer = setTimeout(() => injectAll(), 200);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
