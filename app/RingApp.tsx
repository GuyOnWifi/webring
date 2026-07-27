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

// Social icons live as real files in public/icons/*.svg (GitHub/X/Instagram/Mastodon/
// Bluesky/Matrix from Simple Icons; LinkedIn from Tabler, since Simple Icons dropped it).
// Rendered via CSS mask so they inherit currentColor (dim, white on hover).

function SocialLinks({ socials }: { socials?: Socials }) {
  const entries = Object.entries(socials || {}) as [keyof Socials, string][];
  if (entries.length === 0) return <span className="text-dim">no links</span>;
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
          <span
            aria-hidden
            className="block h-[18px] w-[18px] bg-current"
            style={{
              maskImage: `url(${asset(`/icons/${k}.svg`)})`,
              WebkitMaskImage: `url(${asset(`/icons/${k}.svg`)})`,
              maskSize: "contain",
              WebkitMaskSize: "contain",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
            }}
          />
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const liveCount = index.members.filter((m) => m.ok).length;
  const activeFilters = tags.size;

  const toggleTag = (t: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  const clearFilters = () => {
    setTags(new Set());
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
      if (tags.size && !(m.tags || []).some((t) => tags.has(t))) return false;
      if (!needle) return true;
      const hay = `${m.name} ${m.description || ""} ${(m.tags || []).join(" ")} ${m.domain}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [index.members, q, tags]);

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
              {index.ring.description}{" "}
              <a
                href="https://github.com/GuyOnWifi/webring/pulls"
                target="_blank"
                rel="noreferrer"
                className="text-fg transition-opacity hover:opacity-70"
              >
                open a pr if u wanna join
              </a>
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
                latest posts from across the ring.{" "}
                <a href={asset("/feed.xml")} className="text-fg hover:underline">
                  subscribe
                </a>
              </p>
              <ul className="mt-3">
                {feed.posts.length === 0 && (
                  <li className="border-t border-line py-4 text-dim">
                    no posts yet, members need an RSS feed
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
                        {p.date && `, ${ago(p.date)}`}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "map" && (
            <section className="enter mt-7" style={{ animationDelay: contentDelay }}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl">
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
                  {index.tags.length > 0 && (
                    <div>
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
              drag, scroll to zoom, double-click to reset
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-dim">
            <a href={asset("/feed.xml")} className="hover:text-fg">planet rss</a>
            <a href={asset("/members.opml")} className="hover:text-fg">opml</a>
            <a href="https://github.com/GuyOnWifi/webring#how-to-join-2-minutes" className="hover:text-fg">widget</a>
          </div>
        </aside>
      </div>

      <footer className="enter relative mt-16 border-t border-line pt-6 text-xs leading-relaxed text-dim" style={{ animationDelay: "0.9s" }}>
        {index.generated && <p>rebuilt {index.generated}</p>}
      </footer>
    </>
  );
}

// Directory rendered as a clean table: name · site · links.
function Directory({ members, query = "", delay = "0s" }: { members: Member[]; query?: string; delay?: string }) {
  if (members.length === 0) return <p className="mt-8 py-6 text-dim">no matches</p>;
  const needle = query.trim().toLowerCase();

  return (
    <section className="enter mt-7" style={{ animationDelay: delay }}>
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-line px-3 pb-2 text-xs uppercase tracking-wide text-dim lg:grid">
        <span>name</span>
        <span>site</span>
        <span className="text-right">links</span>
      </div>
      <ul className="divide-y divide-line">
        {members.map((m) => {
          const matched = needle !== "" && `${m.name || ""} ${m.domain}`.toLowerCase().includes(needle);
          return (
          <li
            key={m.domain}
            className={`grid grid-cols-1 gap-3 rounded-xl px-3 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-4 ${
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
