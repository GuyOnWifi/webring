"use client";

import { useMemo, useState } from "react";
import type { Index, Feed, Member, Socials } from "./types";

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
};

function SocialLinks({ socials }: { socials?: Socials }) {
  const entries = Object.entries(socials || {}) as [keyof Socials, string][];
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 flex gap-2">
      {entries.map(([k, href]) => (
        <a key={k} href={href} aria-label={k} className="text-dim hover:text-accent" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d={ICONS[k]} />
          </svg>
        </a>
      ))}
    </div>
  );
}

export default function RingApp({ index, feed }: { index: Index; feed: Feed }) {
  const [tab, setTab] = useState<Tab>("dir");
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [program, setProgram] = useState<string | null>(null);
  const liveCount = index.members.filter((m) => m.ok).length;

  const toggleTag = (t: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

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

  return (
    <>
      <h1 className="text-2xl font-bold">{index.ring.name}</h1>
      <p className="mt-1 text-dim">
        {index.ring.description} — {liveCount} live sites
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <button onClick={goRandom} className="text-accent hover:underline">
          ↯ random site
        </button>
        <span className="grow" />
        <a href={asset("/feed.xml")} className="text-accent hover:underline">planet rss</a>
        <a href={asset("/members.opml")} className="text-accent hover:underline">opml</a>
        <a href={asset("/widget.js")} className="text-accent hover:underline">widget</a>
      </div>

      <nav className="mt-5 flex gap-1 border-b border-line">
        {([["dir", "Directory"], ["planet", "Planet"], ["map", "Map"]] as [Tab, string][]).map(
          ([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 py-2 ${
                tab === id ? "border-accent text-fg" : "border-transparent text-dim"
              }`}
            >
              {label}
            </button>
          )
        )}
      </nav>

      {tab === "dir" && (
        <section className="mt-5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="search name, description, program, tag…"
            className="w-full rounded-md border border-line bg-transparent px-3 py-2 outline-none focus:border-accent"
          />

          {index.programs.length > 0 && (
            <div className="my-3 flex flex-wrap gap-2">
              {index.programs.map((p) => (
                <button
                  key={p}
                  onClick={() => setProgram(program === p ? null : p)}
                  className={`rounded-full border px-3 py-0.5 text-xs ${
                    program === p ? "border-accent bg-accent text-bg" : "border-line text-dim hover:text-fg"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {index.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {index.tags.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`rounded-full border px-3 py-0.5 text-xs ${
                    tags.has(t) ? "border-accent bg-accent text-bg" : "border-line text-dim hover:text-fg"
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="py-6 text-dim">no matches</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((m) => (
                <li
                  key={m.domain}
                  className={`flex gap-3 rounded-lg border border-line p-3 ${m.ok ? "" : "opacity-60"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.avatar || ""}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 flex-none rounded-md bg-line object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <a href={homeOf(m)} className="truncate font-semibold text-accent hover:underline">
                        {m.name || m.domain}
                      </a>
                      {!m.ok && (
                        <span
                          title={m.error}
                          className="rounded border border-red-500 px-1 text-[0.6rem] text-red-500"
                        >
                          offline
                        </span>
                      )}
                    </div>
                    {m.program && <div className="text-xs text-dim">{m.program}</div>}
                    {m.description && <p className="mt-0.5 line-clamp-2 text-sm text-dim">{m.description}</p>}
                    {(m.tags || []).length > 0 && (
                      <div className="mt-1 text-xs text-dim">
                        {(m.tags || []).map((t) => (
                          <span key={t} className="mr-2">#{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <SocialLinks socials={m.socials} />
                      {m.lastPost && <span className="mt-2 text-[0.7rem] text-dim">{ago(m.lastPost)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "planet" && (
        <section className="mt-5">
          <p className="text-dim">
            Latest posts from across the ring ·{" "}
            <a href={asset("/feed.xml")} className="text-accent hover:underline">subscribe</a>
          </p>
          <ul className="mt-2">
            {feed.posts.length === 0 && (
              <li className="border-t border-line py-3 text-dim">no posts yet — members need an RSS feed</li>
            )}
            {feed.posts.map((p, i) => (
              <li key={`${p.link}-${i}`} className="border-t border-line py-3">
                <a href={p.link} className="text-accent hover:underline">{p.title}</a>
                <div className="text-xs text-dim">
                  {p.author}
                  {p.date && ` · ${ago(p.date)}`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "map" && <RingMap members={index.members} />}

      <footer className="mt-8 border-t border-line pt-4 text-xs text-dim">
        <p>
          Join: serve <code className="rounded bg-line px-1">/.well-known/webring.json</code> listing
          this ring, or just add the{" "}
          <a href={asset("/widget.js")} className="text-accent hover:underline">widget</a> (which links here) —
          then open a PR adding one file to <code className="rounded bg-line px-1">members/</code>. A bot
          verifies and merges.
        </p>
        {index.generated && <p className="mt-1">Rebuilt {index.generated}</p>}
      </footer>
    </>
  );
}

// Live ring topology: members on a circle, edges to next live neighbor, pulsing nodes.
function RingMap({ members }: { members: Member[] }) {
  const n = members.length || 1;
  const R = 150,
    cx = 190,
    cy = 190;
  const pt = (i: number): [number, number] => [
    cx + R * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2),
    cy + R * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2),
  ];
  const liveIdx = members.map((m, i) => ({ m, i })).filter((o) => o.m.ok);

  return (
    <section className="mt-5">
      <p className="text-dim">
        Live ring topology — neighbors are computed from this graph. Dead sites drop out and the ring
        re-stitches.
      </p>
      <svg viewBox="0 0 380 380" role="img" aria-label="ring topology" className="mt-3 w-full">
        {liveIdx.map((o, k) => {
          const [x1, y1] = pt(o.i);
          const [x2, y2] = pt(liveIdx[(k + 1) % liveIdx.length].i);
          return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-line)" strokeWidth={1} />;
        })}
        {members.map((m, i) => {
          const [x, y] = pt(i);
          const anchor = x < cx - 5 ? "end" : x > cx + 5 ? "start" : "middle";
          const dx = anchor === "end" ? -7 : anchor === "start" ? 7 : 0;
          return (
            <a key={m.domain} href={homeOf(m)}>
              <circle cx={x} cy={y} r={4} fill={m.ok ? "var(--color-accent)" : "#e5534b"}>
                <animate
                  attributeName="r"
                  values="4;5.5;4"
                  dur="2.5s"
                  begin={`${(i % 5) * 0.3}s`}
                  repeatCount="indefinite"
                />
              </circle>
              <text x={x + dx} y={y + 3} textAnchor={anchor} style={{ font: "10px var(--font-mono)" }} fill="var(--color-dim)">
                {(m.name || m.domain).slice(0, 18)}
              </text>
            </a>
          );
        })}
      </svg>
    </section>
  );
}
