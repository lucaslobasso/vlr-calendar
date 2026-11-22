import type { MatchInfo } from "./types";
import {
  matchIdFromHref,
  parseMatchPage,
  parseBracketItem,
  parseMatchExtras,
  parseEventRegion,
  parseTeamTag,
} from "./parse";
import { buildGoogleUrl } from "./gcal";

const TIP = "Add to Google Calendar";
const TIP_ERR = "Couldn't read match time";
const MARK = "data-vlrcal";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeIcon(): SVGSVGElement {
  const el = (tag: string, attrs: Record<string, string>) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const svg = el("svg", {
    viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true",
  }) as SVGSVGElement;
  svg.append(
    el("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2" }),
    el("path", { d: "M16 2v4M8 2v4M3 10h18M12 13v6M9 16h6" }),
  );
  return svg;
}

const promises = new Map<string, Promise<MatchInfo | null>>();
const resolved = new Map<string, MatchInfo>();

const docCache = new Map<string, Promise<Document | null>>();

/** Fetches a vlr.gg page (same origin) as a Document; cached, null on failure. */
function fetchDoc(url: string): Promise<Document | null> {
  const path = new URL(url, "https://www.vlr.gg/").pathname;
  let p = docCache.get(path);
  if (!p) {
    p = fetch(path, { credentials: "same-origin" })
      .then(async (res) => (res.ok ? new DOMParser().parseFromString(await res.text(), "text/html") : null))
      .catch(() => null);
    docCache.set(path, p);
  }
  return p;
}

/** Region from the event page; tags from team pages when the match page had no odds. */
async function enrich(m: MatchInfo): Promise<MatchInfo> {
  const [evDoc, t1Doc, t2Doc] = await Promise.all([
    m.eventUrl ? fetchDoc(m.eventUrl) : null,
    !m.tag1 && m.team1Url ? fetchDoc(m.team1Url) : null,
    !m.tag2 && m.team2Url ? fetchDoc(m.team2Url) : null,
  ]);
  return {
    ...m,
    region: m.region ?? (evDoc ? parseEventRegion(evDoc) : undefined),
    tag1: m.tag1 ?? (t1Doc ? parseTeamTag(t1Doc) : undefined),
    tag2: m.tag2 ?? (t2Doc ? parseTeamTag(t2Doc) : undefined),
  };
}

async function load(id: string, anchor: Element | null): Promise<MatchInfo | null> {
  let info: MatchInfo | null = null;
  try {
    const doc = await fetchDoc(`/${id}`);
    const base = doc ? parseMatchPage(doc, `https://www.vlr.gg/${id}`) : null;
    if (doc && base) info = await enrich(parseMatchExtras(doc, base));
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

// One floating tooltip on <body> (position: fixed), so overflow:hidden parents can't crop it.
let tipEl: HTMLDivElement | null = null;

function showTip(btn: HTMLElement): void {
  if (!tipEl || !tipEl.isConnected) {
    tipEl = document.createElement("div");
    tipEl.className = "vlrcal-tip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  tipEl.textContent = btn.getAttribute("data-tip") ?? TIP;
  tipEl.classList.add("vlrcal-tip-on");
  const r = btn.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  const left = Math.min(Math.max(4, r.left + r.width / 2 - w / 2), window.innerWidth - w - 4);
  const top = r.top - h - 6 < 4 ? r.bottom + 6 : r.top - h - 6;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}

function hideTip(): void {
  tipEl?.classList.remove("vlrcal-tip-on");
}

function setError(btn: HTMLElement, on: boolean): void {
  btn.classList.toggle("vlrcal-error", on);
  const tip = on ? TIP_ERR : TIP;
  btn.setAttribute("data-tip", tip);
  btn.setAttribute("aria-label", tip);
  if (tipEl?.classList.contains("vlrcal-tip-on") && btn.matches(":hover")) showTip(btn);
}

function makeButton(id: string, anchor: Element | null): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "vlrcal-btn";
  btn.appendChild(makeIcon());
  setError(btn, false);
  const warm = () => {
    void prefetch(id, anchor);
    showTip(btn);
  };
  btn.addEventListener("mouseenter", warm);
  btn.addEventListener("focus", warm);
  btn.addEventListener("mouseleave", hideTip);
  btn.addEventListener("blur", hideTip);
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
  window.addEventListener("scroll", hideTip, { passive: true, capture: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const obs = new MutationObserver((muts) => {
    if (muts.every((mu) => Array.from(mu.addedNodes).every((nd) => (nd as Element).classList?.contains("vlrcal-btn")) && mu.removedNodes.length === 0)) return;
    clearTimeout(timer);
    timer = setTimeout(() => injectAll(), 200);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
