"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Index, Feed, Member, Socials } from "./types";
import RingGraph from "./RingGraph";

function ago(iso?: string | null): string {
  if (!iso) return "";
  const d = Date.parse(iso);
  if (!d) return "";
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const homeOf = (m: Member) => m.homepage || `https://${m.domain}`;

// GitHub Pages project sites live under /<repo>; prefix asset links so they resolve.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const asset = (p: string) => `${BASE}${p}`;

type Tab = "dir" | "planet" | "map";

// Minimal inline icons (no icon dependency).
const ICONS: Record<keyof Socials, string> = {
  github:
    "M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z",
  x: "M18.9 2H22l-7.5 8.6L23 22h-6.8l-5.3-7-6.1 7H1.7l8-9.2L1 2h7l4.8 6.4L18.9 2Zm-2.4 18h1.9L7.6 4H5.6l10.9 16Z",
  linkedin:
    "M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.3c0-1.26-.02-2.9-1.77-2.9-1.77 0-2.04 1.38-2.04 2.8V21H10V9Z",
  instagram:
    "M12 2.2c3.2 0 3.6 0 4.9.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.9.07s-3.63 0-4.9-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.15 0-3.5.01-4.74.07-1.14.05-1.76.24-2.17.4-.55.22-.94.47-1.35.88-.41.41-.66.8-.88 1.35-.16.41-.35 1.03-.4 2.17C2.4 8.5 2.4 8.85 2.4 12s.01 3.5.07 4.74c.05 1.14.24 1.76.4 2.17.22.55.47.94.88 1.35.41.41.8.66 1.35.88.41.16 1.03.35 2.17.4 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c1.14-.05 1.76-.24 2.17-.4.55-.22.94-.47 1.35-.88.41-.41.66-.8.88-1.35.16-.41.35-1.03.4-2.17.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-1.14-.24-1.76-.4-2.17a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.41-.16-1.03-.35-2.17-.4C15.5 4.01 15.15 4 12 4Zm0 3.06A4.94 4.94 0 1 1 12 17a4.94 4.94 0 0 1 0-9.88Zm0 1.8a3.14 3.14 0 1 0 0 6.28 3.14 3.14 0 0 0 0-6.28Zm5.14-.95a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z",
  mastodon:
    "M21.3 8.6c0-3.9-2.55-5-2.55-5C17.46 3 15.3 2.85 12.1 2.82h-.08c-3.2.03-5.35.18-6.63.78 0 0-2.56 1.1-2.56 5 0 .9-.02 1.97.01 3.1.09 3.83.7 7.6 4.25 8.54 1.63.43 3.03.52 4.16.46 2.05-.11 3.2-.73 3.2-.73l-.07-1.49s-1.46.46-3.1.4c-1.62-.05-3.34-.17-3.6-2.17a4 4 0 0 1-.04-.55s1.6.39 3.63.48c1.24.06 2.4-.07 3.59-.21 2.27-.27 4.25-1.67 4.5-2.95.4-2.02.36-4.93.36-4.93Zm-3.1 5.17h-1.93V9.05c0-1-.42-1.5-1.27-1.5-.94 0-1.4.6-1.4 1.8v2.6h-1.92v-2.6c0-1.2-.47-1.8-1.4-1.8-.85 0-1.27.5-1.27 1.5v4.72H5.07V8.9c0-1 .25-1.79.77-2.37.53-.58 1.23-.88 2.1-.88 1 0 1.77.39 2.28 1.15l.48.8.48-.8c.5-.76 1.27-1.15 2.28-1.15.86 0 1.56.3 2.09.88.52.58.77 1.37.77 2.37v4.87Z",
  bluesky:
    "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z",
  matrix:
    "M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.481.314.448.208.785.582 1.02 1.108.254-.374.6-.706 1.034-.992.434-.287.95-.43 1.546-.43.453 0 .872.056 1.26.167.388.11.716.286.993.53.276.245.489.559.646.951.152.392.23.863.23 1.417v5.728h-2.349V11.52c0-.286-.01-.559-.032-.812a1.755 1.755 0 0 0-.18-.66 1.106 1.106 0 0 0-.438-.448c-.194-.11-.457-.166-.785-.166-.332 0-.6.064-.803.189a1.38 1.38 0 0 0-.48.499 1.946 1.946 0 0 0-.231.696 5.56 5.56 0 0 0-.06.785v4.768h-2.35v-4.8c0-.254-.004-.503-.018-.752a2.074 2.074 0 0 0-.143-.688 1.052 1.052 0 0 0-.415-.503c-.194-.125-.476-.19-.854-.19-.111 0-.259.024-.439.074-.18.051-.36.143-.53.276a1.61 1.61 0 0 0-.439.535c-.12.226-.18.522-.18.885v4.763H5.46V7.81zm15.693 15.64V.55h-1.648V0H24v24h-2.28v-.55z",
};

function SocialLinks({ socials }: { socials?: Socials }) {
  const entries = Object.entries(socials || {}) as [keyof Socials, string][];
  if (entries.length === 0) return <span className="text-dim">—</span>;
  return (
    <div className="flex gap-2.5">
      {entries.map(([k, href]) => (
        <a
          key={k}
          href={href}
          aria-label={k}
          className="text-dim transition-colors hover:text-fg"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
            <path d={ICONS[k]} />
          </svg>
        </a>
      ))}
    </div>
  );
}

// Types out `text` one character at a time, then leaves a blinking blue caret.
function Typewriter({ text, speed = 70 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    const id = setTimeout(() => setN(n + 1), speed);
    return () => clearTimeout(id);
  }, [n, text, speed]);
  return (
    <>
      {text.slice(0, n)}
      <span className="caret" aria-hidden="true" />
    </>
  );
}

export default function RingApp({ index, feed }: { index: Index; feed: Feed }) {
  const [tab, setTab] = useState<Tab>("dir");
  const [tabTouched, setTabTouched] = useState(false);
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [program, setProgram] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const liveCount = index.members.filter((m) => m.ok).length;
  const activeFilters = tags.size + (program ? 1 : 0);

  const toggleTag = (t: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  const clearFilters = () => {
    setTags(new Set());
    setProgram(null);
  };

  // Close the filters popover on outside click / Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return index.members.filter((m) => {
      if (program && m.program !== program) return false;
      if (tags.size && !(m.tags || []).some((t) => tags.has(t))) return false;
      if (!needle) return true;
      const hay = `${m.name} ${m.description || ""} ${m.program || ""} ${(m.tags || []).join(" ")} ${m.domain}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [index.members, q, tags, program]);

  const goRandom = () => {
    const live = index.members.filter((m) => m.ok);
    if (live.length) window.location.href = homeOf(live[Math.floor(Math.random() * live.length)]);
  };

  // On first load, tab content waits until the title is ~half-typed; after the
  // user switches tabs it animates instantly.
  const contentDelay = tabTouched ? "0s" : "0.75s";

  return (
    <>
      <div className="relative grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
        {/* LEFT: identity + tabbed content */}
        <div className="min-w-0">
          <header>
            <h1
              aria-label={index.ring.name}
              className="text-4xl font-semibold lowercase tracking-tight sm:text-5xl"
            >
              <Typewriter text={index.ring.name} />
            </h1>
            <p
              className="enter mt-5 max-w-prose text-[15px] leading-relaxed text-dim lowercase"
              style={{ animationDelay: "0.45s" }}
            >
              {index.ring.description}
            </p>
            <p
              className="enter mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-dim"
              style={{ animationDelay: "0.55s" }}
            >
              <span>
                {liveCount} live {liveCount === 1 ? "site" : "sites"}
              </span>
              <button onClick={goRandom} className="text-fg transition-opacity hover:opacity-70">
                ↯ random site
              </button>
            </p>
          </header>

          <nav className="enter mt-9 flex gap-7 border-b border-line text-sm" style={{ animationDelay: "0.65s" }}>
            {([["dir", "directory"], ["planet", "planet"], ["map", "map"]] as [Tab, string][]).map(
              ([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setTabTouched(true); }}
                  className={`-mb-px border-b-2 pb-3 transition-colors ${
                    tab === id ? "border-fg text-fg" : "border-transparent text-dim hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </nav>

          {tab === "dir" && <Directory members={filtered} query={q} delay={contentDelay} />}

          {tab === "planet" && (
            <section className="enter mt-7" style={{ animationDelay: contentDelay }}>
              <p className="text-sm text-dim">
                latest posts from across the ring ·{" "}
                <a href={asset("/feed.xml")} className="text-fg hover:underline">
                  subscribe
                </a>
              </p>
              <ul className="mt-3">
                {feed.posts.length === 0 && (
                  <li className="border-t border-line py-4 text-dim">
                    no posts yet — members need an RSS feed
                  </li>
                )}
                {feed.posts.map((p, i) => (
                  <li key={`${p.link}-${i}`} className="group border-t border-line">
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="-mx-3 block rounded-lg px-3 py-4 transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="font-medium underline-offset-2 group-hover:underline">
                        {p.title}
                      </span>
                      <span className="ml-1 text-dim opacity-0 transition-opacity group-hover:opacity-100">↗</span>
                      <span className="mt-1 block text-xs text-dim">
                        {p.author}
                        {p.date && ` · ${ago(p.date)}`}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "map" && (
            <section className="enter mt-7" style={{ animationDelay: contentDelay }}>
              <p className="max-w-prose text-sm text-dim">
                the ring, live. search a name to send light around the loop and zoom in — drag a person to
                fling them around (they spring back), drag the background to pan, scroll to zoom,
                double-click to reset, and click any node to open its site.
              </p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl">
                <RingGraph members={index.members} query={q} className="relative h-[72vh]" />
              </div>
            </section>
          )}
        </div>

        {/* RIGHT: search, filters, companion graph, resources */}
        <aside className="enter h-fit lg:sticky lg:top-12" style={{ animationDelay: "0.5s" }}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-dim"
                strokeWidth={2}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                type="search"
                placeholder="search members…"
                aria-label="search members"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-3 text-sm outline-none backdrop-blur-xl transition-colors placeholder:text-dim focus:border-white/25"
              />
            </div>

            <div ref={filtersRef} className="relative">
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-dim backdrop-blur-xl transition-colors hover:text-fg"
              >
                filters
                {activeFilters > 0 && (
                  <span className="rounded-full bg-fg px-1.5 text-xs text-bg">{activeFilters}</span>
                )}
                <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 fill-current transition-transform ${filtersOpen ? "rotate-180" : ""}`}>
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>

              {filtersOpen && (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-white/10 bg-panel/70 p-4 shadow-xl shadow-black/40 backdrop-blur-xl">
                  {index.programs.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs uppercase tracking-wide text-dim">program</div>
                      <div className="flex flex-wrap gap-1.5">
                        {index.programs.map((p) => (
                          <button
                            key={p}
                            onClick={() => setProgram(program === p ? null : p)}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                              program === p
                                ? "border-fg bg-fg text-bg"
                                : "border-line text-dim hover:text-fg"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {index.tags.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 text-xs uppercase tracking-wide text-dim">tags</div>
                      <div className="flex flex-wrap gap-1.5">
                        {index.tags.map((t) => (
                          <button
                            key={t}
                            onClick={() => toggleTag(t)}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                              tags.has(t)
                                ? "border-fg bg-fg text-bg"
                                : "border-line text-dim hover:text-fg"
                            }`}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeFilters > 0 && (
                    <button
                      onClick={clearFilters}
                      className="mt-4 w-full rounded-lg border border-line py-1.5 text-xs text-dim transition-colors hover:text-fg"
                    >
                      clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 hidden lg:block">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl">
              <RingGraph members={index.members} query={q} className="relative aspect-square w-full" />
            </div>
            <p className="mt-2 text-center text-[11px] text-dim/70">
              drag · scroll to zoom · double-click to reset
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-dim">
            <a href={asset("/feed.xml")} className="hover:text-fg">planet rss</a>
            <a href={asset("/members.opml")} className="hover:text-fg">opml</a>
            <a href={asset("/widget.js")} className="hover:text-fg">widget</a>
          </div>
        </aside>
      </div>

      <footer className="enter relative mt-16 border-t border-line pt-6 text-xs leading-relaxed text-dim" style={{ animationDelay: "0.9s" }}>
        <p className="max-w-prose">
          want to join? serve <code className="rounded bg-panel px-1">/.well-known/webring.json</code>{" "}
          listing this ring, or just add the{" "}
          <a href={asset("/widget.js")} className="text-fg hover:underline">widget</a> (which links here) —
          then open a PR adding one file to <code className="rounded bg-panel px-1">members/</code>. a bot
          verifies and merges.
        </p>
        {index.generated && <p className="mt-2">rebuilt {index.generated}</p>}
      </footer>
    </>
  );
}

// Directory rendered as a clean table: name · program · site · links.
function Directory({ members, query = "", delay = "0s" }: { members: Member[]; query?: string; delay?: string }) {
  if (members.length === 0) return <p className="mt-8 py-6 text-dim">no matches</p>;
  const needle = query.trim().toLowerCase();

  return (
    <section className="enter mt-7" style={{ animationDelay: delay }}>
      <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_auto] gap-4 border-b border-line px-3 pb-2 text-xs uppercase tracking-wide text-dim lg:grid">
        <span>name</span>
        <span>program</span>
        <span>site</span>
        <span>links</span>
      </div>
      <ul className="divide-y divide-line">
        {members.map((m) => {
          const matched = needle !== "" && `${m.name || ""} ${m.domain}`.toLowerCase().includes(needle);
          return (
          <li
            key={m.domain}
            className={`grid grid-cols-1 gap-3 rounded-xl px-3 py-4 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] lg:items-center lg:gap-4 ${
              matched ? "shine-beam" : ""
            } ${m.ok ? "" : "opacity-60"}`}
          >
            {/* name + avatar + description + tags */}
            <div className="flex min-w-0 items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.avatar || ""}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-10 w-10 flex-none rounded-full bg-line object-cover"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <a href={homeOf(m)} className="truncate font-medium hover:underline">
                    {m.name || m.domain}
                  </a>
                  {!m.ok && (
                    <span
                      title={m.error}
                      className="flex-none rounded border border-red-500/60 px-1 text-[0.6rem] text-red-400"
                    >
                      offline
                    </span>
                  )}
                </div>
                {m.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-dim">{m.description}</p>
                )}
                {(m.tags || []).length > 0 && (
                  <div className="mt-1 truncate text-xs text-dim">
                    {(m.tags || []).map((t) => (
                      <span key={t} className="mr-2">#{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* program */}
            <div className="truncate text-sm text-dim">
              <span className="text-dim lg:hidden">program: </span>
              {m.program || "—"}
            </div>

            {/* site + last post */}
            <div className="min-w-0 text-sm">
              <a href={homeOf(m)} className="truncate text-dim transition-colors hover:text-fg">
                {m.domain}
              </a>
              {m.lastPost && <div className="text-xs text-dim">{ago(m.lastPost)}</div>}
            </div>

            {/* links */}
            <div className="flex items-center lg:justify-end">
              <SocialLinks socials={m.socials} />
            </div>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
