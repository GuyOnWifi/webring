"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Member } from "./types";

const homeOf = (m: Member) => m.homepage || m.site || `https://${m.domain}`;

// ── ring layout ──
const NR = 16; // node radius (world units)
const R_BASE = 330; // ring radius
const TRI_AMP = 0.12; // 3-fold radial shaping → rounded-triangle silhouette (lower = rounder)
const OSC_R = 26; // radial breathing amplitude (kept small so the triangle persists)
const OSC_A = 0.1; // angular weave amplitude (nodes overtake/pass each other)
const GLOBAL_ROT = 0.03; // slow overall rotation of the whole shape (rad/s)
const BAND_AMP = 78; // per-node radial scatter → people spread into a thick ring band
                     // instead of a single crammed wire (deterministic per index)

// ── search response ──
const SPREAD = 0.35; // ring dilation while a search is active
const BUBBLE = 155; // clear radius carved around a matched node
const K_REPEL = 0.07; // gentler shove so neighbors ease aside instead of darting

// ── physics ──
const K_HOME = 0.09; // spring toward the (oscillating) home position
const DAMP = 0.8;
const MAX_V = 6; // low speed cap → nodes drift, never dart
const MIN_SEP = NR * 2 + 4; // min gap between node centers → circles never overlap
const K_COLLIDE = 0.09; // pairwise overlap-repulsion strength (soft, overlap-only)

// ── camera (critically-damped spring → smooth ease-in/ease-out, no snap) ──
// lower CAM_STIFF = slower, more luxurious zoom; damping tracks it for no overshoot.
const CAM_STIFF = 5;
const CAM_DAMP = 2 * Math.sqrt(CAM_STIFF);
const MIN_SCALE = 0.05;
const MAX_SCALE = 2.8;

// ── search wave (fast stadium-wave flash that leaves only matches lit) ──
const WAVE_MS = 620; // time for the wave to sweep the whole ring
const FLARE_MS = 190; // how long each node stays flared as the wave passes through it
const SEARCH_DEBOUNCE_MS = 300; // wait for a typing pause before disturbing the graph
const ZOOM_OUT_MS = 450; // pull back to a wide view before the wave starts
const ZOOM_HOLD = 180; // pause after the wave finishes before the camera zooms in
const MATCH_SCALE = 1.5; // matched node radius vs. neighbors

// ── intro / idle camera ──
const INTRO_HOLD = 1200; // how long to hold the wide view before easing into the orbit
const MED_ZOOM = 1.85; // how far past "fit whole ring" the idle camera settles
const TRACE_SPEED = 0.11; // idle orbit speed (rad/s)
const TRACE_R_FRAC = 0.7; // idle orbit radius as a fraction of the ring radius

type Node = {
  m: Member;
  x: number;
  y: number;
  vx: number;
  vy: number;
  base: number; // base angle on the ring
  band: number; // fixed radial offset → thickens the ring so nodes aren't shoulder-to-shoulder
  fA: number;
  fR: number;
  pA: number;
  pR: number;
};
type Cam = { x: number; y: number; scale: number };

// Shared cross-instance avatar cache: fetch once, pre-render into a circular
// offscreen canvas so the draw loop never clips-from-source per frame.
type CacheEntry = { round: HTMLCanvasElement | null; done: boolean };
const avatarCache = new Map<string, CacheEntry>();
function loadAvatar(url: string) {
  if (avatarCache.has(url)) return;
  const entry: CacheEntry = { round: null, done: false };
  avatarCache.set(url, entry);
  const img = new Image();
  img.referrerPolicy = "no-referrer";
  img.onload = () => {
    const S = 96;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const cx = c.getContext("2d")!;
    cx.beginPath();
    cx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    cx.clip();
    const ar = img.width / img.height;
    let dw = S, dh = S, dx = 0, dy = 0;
    if (ar > 1) { dh = S; dw = S * ar; dx = (S - dw) / 2; }
    else { dw = S; dh = S / ar; dy = (S - dh) / 2; }
    cx.drawImage(img, dx, dy, dw, dh);
    entry.round = c;
    entry.done = true;
  };
  img.onerror = () => { entry.done = true; };
  img.src = url;
}

function matchIndices(members: Member[], needle: string): number[] {
  if (!needle) return [];
  const idx: number[] = [];
  members.forEach((m, i) => {
    if (`${m.name || ""} ${m.domain}`.toLowerCase().includes(needle)) idx.push(i);
  });
  return idx.length === members.length ? [] : idx;
}

export default function RingGraph({
  members,
  query = "",
  className = "relative h-64",
}: {
  members: Member[];
  query?: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const camRef = useRef<Cam>({ x: 0, y: 0, scale: 0.4 });
  const modeRef = useRef<"auto" | "manual">("auto");
  const focusAmtRef = useRef(0); // eased 0→1 while searching
  const introStartRef = useRef(0);
  const waveRef = useRef<{ start: number; hop: Map<number, number>; maxHop: number } | null>(null);
  const zoomAtRef = useRef(0); // timestamp at which the camera is allowed to zoom to the match
  const graphNeedleRef = useRef(""); // debounced query the graph actually reacts to
  const camVelRef = useRef({ x: 0, y: 0, s: 0 }); // camera spring velocity
  const lastTimeRef = useRef(0);
  const hoverRef = useRef(-1);
  const dragRef = useRef({ on: false, x: 0, y: 0, moved: false });
  const heldRef = useRef(-1); // index of the person being dragged (or -1)
  const heldPosRef = useRef({ x: 0, y: 0 }); // their pinned world position while held
  const collideRef = useRef({ fx: new Float64Array(0), fy: new Float64Array(0) }); // reused collision-force buffers
  const sizeRef = useRef({ w: 300, h: 260, dpr: 1 });
  // hover label overlay (DOM, so text stays crisp over the canvas)
  const [tip, setTip] = useState<{ name: string; domain: string; ok: boolean; x: number; y: number } | null>(null);

  const needle = query.trim().toLowerCase();

  // Ring adjacency (a necklace) — the fiber the light travels along.
  const adj = useMemo(() => {
    const n = members.length;
    const a = new Map<number, number[]>();
    for (let i = 0; i < n; i++) a.set(i, n > 1 ? [(i - 1 + n) % n, (i + 1) % n] : []);
    return a;
  }, [members]);

  // Seed ring positions when the set changes.
  if (nodesRef.current.length !== members.length) {
    const n = members.length || 1;
    nodesRef.current = members.map((m, i) => {
      const base = (i / n) * Math.PI * 2 - Math.PI / 2;
      // deterministic fract-sin hash → uniform-ish radial offset in [-BAND_AMP, BAND_AMP]
      const h = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      const band = ((h - Math.floor(h)) * 2 - 1) * BAND_AMP;
      const r0 = R_BASE + band;
      return {
        m,
        x: Math.cos(base) * r0,
        y: Math.sin(base) * r0,
        vx: 0,
        vy: 0,
        base,
        band,
        fA: 0.12 + (i % 7) * 0.018,
        fR: 0.1 + (i % 5) * 0.02,
        pA: i * 1.7,
        pR: i * 2.3 + 1,
      };
    });
    modeRef.current = "auto";
  }

  useEffect(() => {
    members.forEach((m) => m.avatar && loadAvatar(m.avatar));
  }, [members]);

  // Debounced: wait for a typing pause before the graph reacts, so mid-word
  // keystrokes ("B" → "Br" → "Bra" → "Bram") don't restart the wave/zoom each time.
  useEffect(() => {
    const handle = setTimeout(() => {
      graphNeedleRef.current = needle;
      modeRef.current = "auto";
      const idx = matchIndices(members, needle);
      if (idx.length === 0) return; // no match → camera eases back to idle orbit
      // ring-hop distance from the match(es) — the wave sweeps outward by hop.
      const hop = new Map<number, number>();
      const q: number[] = [];
      idx.forEach((i) => { hop.set(i, 0); q.push(i); });
      let maxHop = 0;
      for (let h = 0; h < q.length; h++) {
        const d = hop.get(q[h])!;
        for (const nb of adj.get(q[h]) || []) if (!hop.has(nb)) { hop.set(nb, d + 1); maxHop = d + 1; q.push(nb); }
      }
      // choreography: zoom out first, THEN the wave emanates from the origin, THEN zoom in.
      const waveStart = performance.now() + ZOOM_OUT_MS;
      waveRef.current = { start: waveStart, hop, maxHop };
      zoomAtRef.current = waveStart + WAVE_MS + ZOOM_HOLD;
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [needle, members, adj]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const nodes = nodesRef.current;
    let raf = 0;
    let mounted = true;
    introStartRef.current = performance.now();
    lastTimeRef.current = performance.now();

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
    });
    ro.observe(wrap);

    const toWorld = (sx: number, sy: number): [number, number] => {
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      return [(sx - w / 2) / cam.scale + cam.x, (sy - h / 2) / cam.scale + cam.y];
    };
    const nodeRadiusPx = () => Math.max(6, Math.min(46, NR * camRef.current.scale));
    const hitTest = (sx: number, sy: number): number => {
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      const rpx = nodeRadiusPx();
      for (let i = nodes.length - 1; i >= 0; i--) {
        const px = (nodes[i].x - cam.x) * cam.scale + w / 2;
        const py = (nodes[i].y - cam.y) * cam.scale + h / 2;
        if ((sx - px) ** 2 + (sy - py) ** 2 <= rpx * rpx) return i;
      }
      return -1;
    };
    const computeTarget = (focus: number[]): Cam => {
      const { w, h } = sizeRef.current;
      if (!focus.length) {
        // Stable, analytic framing of the whole ring — no per-frame bbox jitter,
        // so the idle/intro camera has a rock-steady target to ease toward.
        const ext = R_BASE * (1 + TRI_AMP) + BAND_AMP + OSC_R + NR + 8;
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(w, h) / (2 * ext)));
        return { x: 0, y: 0, scale };
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const i of focus) {
        const p = nodes[i];
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      const pad = BUBBLE * 1.15;
      const bw = maxX - minX + pad * 2;
      const bh = maxY - minY + pad * 2;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(w / bw, h / bh)));
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale };
    };

    const resetCamVel = () => { camVelRef.current.x = 0; camVelRef.current.y = 0; camVelRef.current.s = 0; };
    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      dragRef.current = { on: true, x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
      setTip(null); // hide label while interacting
      if (hit >= 0) {
        // grab a person: they follow the cursor; releasing springs them home
        heldRef.current = hit;
        const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        heldPosRef.current = { x: wx, y: wy };
      } else {
        heldRef.current = -1;
        resetCamVel(); // empty space → pan the camera
      }
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const d = dragRef.current;
      if (d.on && heldRef.current >= 0) {
        // dragging a person — pin them under the cursor
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
        const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        heldPosRef.current = { x: wx, y: wy };
      } else if (d.on) {
        // dragging empty space — pan the camera
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        const cam = camRef.current;
        cam.x -= dx / cam.scale;
        cam.y -= dy / cam.scale;
        d.x = e.clientX; d.y = e.clientY;
        modeRef.current = "manual";
      } else {
        const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
        const hit = hitTest(lx, ly);
        hoverRef.current = hit;
        canvas.style.cursor = hit >= 0 ? "pointer" : "grab";
        if (hit >= 0) {
          const m = nodes[hit].m;
          setTip({ name: m.name || m.domain, domain: m.domain, ok: m.ok !== false, x: lx, y: ly });
        } else setTip(null);
      }
    };
    const onLeave = () => { hoverRef.current = -1; setTip(null); };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      const rect = canvas.getBoundingClientRect();
      // a click (grabbed a person but never dragged) → open their site
      if (d.on && !d.moved) {
        const hit = heldRef.current >= 0 ? heldRef.current : hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (hit >= 0) window.open(homeOf(nodes[hit].m), "_blank", "noopener");
      }
      heldRef.current = -1; // release → the person springs back to the ring
      d.on = false;
      canvas.style.cursor = "grab";
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const cam = camRef.current;
      const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * Math.exp(-e.deltaY * 0.0015)));
      cam.x = wx - (wx - cam.x) * (cam.scale / ns);
      cam.y = wy - (wy - cam.y) * (cam.scale / ns);
      cam.scale = ns;
      modeRef.current = "manual";
      resetCamVel();
    };
    const onDbl = () => { modeRef.current = "auto"; resetCamVel(); };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDbl);
    canvas.style.cursor = "grab";

    // Measure synchronously and seed the camera at the correct wide framing so the
    // very first frame is already composed — no initial spring catch-up jerk.
    {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      camRef.current = computeTarget([]);
      camVelRef.current.x = camVelRef.current.y = camVelRef.current.s = 0;
    }

    const step = () => {
      if (!mounted) return;
      raf = requestAnimationFrame(step);
      const nowMs = performance.now();
      let dt = (nowMs - lastTimeRef.current) / 1000;
      lastTimeRef.current = nowMs;
      if (dt <= 0 || dt > 0.05) dt = 1 / 60; // clamp after tab-switches / first frame
      const t = nowMs / 1000;
      const focus = matchIndices(members, graphNeedleRef.current);

      // neighbor-repel/spread only kicks in once we start zooming in (after the wave)
      const zoomed = focus.length > 0 && performance.now() >= zoomAtRef.current;
      const fTarget = zoomed ? 1 : 0;
      focusAmtRef.current += (fTarget - focusAmtRef.current) * 0.03; // slow ramp
      const fAmt = focusAmtRef.current;
      const spread = 1 + SPREAD * fAmt;
      const rot = t * GLOBAL_ROT;

      // Pass 1: pairwise collision. Soft, overlap-only repulsion so drawn circles
      // never sit on top of each other. O(n²) — fine for a webring's member count.
      // The held node participates (its fixed position shoves others aside as you drag).
      const nn = nodes.length;
      let cbuf = collideRef.current;
      if (cbuf.fx.length !== nn) cbuf = collideRef.current = { fx: new Float64Array(nn), fy: new Float64Array(nn) };
      const { fx: cfx, fy: cfy } = cbuf;
      cfx.fill(0); cfy.fill(0);
      for (let i = 0; i < nn; i++) {
        for (let j = i + 1; j < nn; j++) {
          let dx = nodes[i].x - nodes[j].x;
          let dy = nodes[i].y - nodes[j].y;
          let d2 = dx * dx + dy * dy;
          if (d2 >= MIN_SEP * MIN_SEP) continue;
          if (d2 < 1e-6) { dx = i % 2 ? 1 : -1; dy = 1; d2 = 2; } // exactly coincident → nudge apart
          const d = Math.sqrt(d2);
          const push = (MIN_SEP - d) * K_COLLIDE;
          const ux = (dx / d) * push, uy = (dy / d) * push;
          cfx[i] += ux; cfy[i] += uy;
          cfx[j] -= ux; cfy[j] -= uy;
        }
      }

      // Pass 2: spring to oscillating home + repulsion away from matches + collision.
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        if (i === heldRef.current) {
          // held by the cursor — pin it, no spring, so it follows the drag
          nd.x = heldPosRef.current.x; nd.y = heldPosRef.current.y;
          nd.vx = 0; nd.vy = 0;
          continue;
        }
        const ang = nd.base + rot + OSC_A * Math.sin(t * nd.fA + nd.pA);
        const tri = 1 + TRI_AMP * Math.cos(3 * ang); // rounded-triangle silhouette
        const rad = R_BASE * spread * tri + nd.band + OSC_R * Math.sin(t * nd.fR + nd.pR);
        const hx = Math.cos(ang) * rad;
        const hy = Math.sin(ang) * rad;
        let fx = (hx - nd.x) * K_HOME + cfx[i];
        let fy = (hy - nd.y) * K_HOME + cfy[i];
        if (fAmt > 0.01) {
          for (const mi of focus) {
            if (mi === i) continue;
            const dx = nd.x - nodes[mi].x;
            const dy = nd.y - nodes[mi].y;
            const d = Math.hypot(dx, dy) || 1;
            if (d < BUBBLE) {
              const push = (BUBBLE - d) * K_REPEL * fAmt;
              fx += (dx / d) * push;
              fy += (dy / d) * push;
            }
          }
        }
        nd.vx = (nd.vx + fx) * DAMP;
        nd.vy = (nd.vy + fy) * DAMP;
        const sp = Math.hypot(nd.vx, nd.vy);
        if (sp > MAX_V) { nd.vx = (nd.vx / sp) * MAX_V; nd.vy = (nd.vy / sp) * MAX_V; }
        nd.x += nd.vx;
        nd.y += nd.vy;
      }

      if (modeRef.current === "auto") {
        const cam = camRef.current;
        let tgt: Cam;
        if (zoomed) {
          tgt = computeTarget(focus); // zoom in on the match (after the wave)
        } else if (focus.length) {
          tgt = computeTarget([]); // hold a wide view: pull back, let the wave proliferate
        } else {
          // intro: hold the wide view, then let the spring ease into a slow orbit.
          // Only stable targets are fed to the spring, so it's the single easing layer.
          const full = computeTarget([]);
          if (performance.now() - introStartRef.current < INTRO_HOLD) {
            tgt = full;
          } else {
            const a = (performance.now() / 1000) * TRACE_SPEED;
            const orbitR = R_BASE * TRACE_R_FRAC;
            tgt = { x: Math.cos(a) * orbitR, y: Math.sin(a) * orbitR, scale: Math.min(MAX_SCALE, full.scale * MED_ZOOM) };
          }
        }
        // critically-damped spring toward the target (smooth ease in and out)
        const v = camVelRef.current;
        v.x += ((tgt.x - cam.x) * CAM_STIFF - v.x * CAM_DAMP) * dt;
        v.y += ((tgt.y - cam.y) * CAM_STIFF - v.y * CAM_DAMP) * dt;
        cam.x += v.x * dt;
        cam.y += v.y * dt;
        const cl = Math.log(cam.scale);
        const tl = Math.log(tgt.scale);
        v.s += ((tl - cl) * CAM_STIFF - v.s * CAM_DAMP) * dt;
        cam.scale = Math.exp(cl + v.s * dt);
      }

      if (waveRef.current && performance.now() - waveRef.current.start > WAVE_MS + FLARE_MS * 5)
        waveRef.current = null;

      draw(ctx, nodes, adj, camRef.current, sizeRef.current, {
        matchSet: new Set(focus),
        wave: waveRef.current,
        hover: hoverRef.current,
      });
    };
    raf = requestAnimationFrame(step);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDbl);
    };
  }, [members, adj]);

  return (
    <div ref={wrapRef} className={className}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none rounded-2xl" />

      {/* hover label — follows the cursor, sits just above it */}
      {tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-black/80 px-2.5 py-1.5 backdrop-blur-md"
          style={{ left: tip.x, top: tip.y - 14 }}
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-fg">
            <span className={`h-1.5 w-1.5 rounded-full ${tip.ok ? "bg-emerald-400" : "bg-[#e5534b]"}`} />
            {tip.name}
          </div>
          <div className="mt-0.5 whitespace-nowrap text-[11px] text-dim">{tip.domain} ↗ click to visit</div>
        </div>
      )}

      {/* persistent affordance so the graph reads as interactive at a glance */}
      <div className="pointer-events-none absolute bottom-2.5 right-3 z-10 text-[11px] text-dim/70">
        drag people, scroll, <span className="text-dim">click a node to visit</span>
      </div>
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  nodes: Node[],
  adj: Map<number, number[]>,
  cam: Cam,
  size: { w: number; h: number; dpr: number },
  extra: { matchSet: Set<number>; wave: { start: number; hop: Map<number, number>; maxHop: number } | null; hover: number },
) {
  const { w, h, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sx = (x: number) => (x - cam.x) * cam.scale + w / 2;
  const sy = (y: number) => (y - cam.y) * cam.scale + h / 2;
  const rpx = Math.max(6, Math.min(46, NR * cam.scale));

  // ring edges (each undirected pair once)
  ctx.strokeStyle = "rgba(140,143,152,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < nodes.length; i++) {
    for (const j of adj.get(i) || []) {
      if (j <= i && !(i === nodes.length - 1 && j === 0)) continue; // dedupe, keep wrap edge
      ctx.moveTo(sx(nodes[i].x), sy(nodes[i].y));
      ctx.lineTo(sx(nodes[j].x), sy(nodes[j].y));
    }
  }
  ctx.stroke();

  const wave = extra.wave;
  const now = performance.now();
  const labels: { x: number; y: number; text: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const px = sx(n.x), py = sy(n.y);
    if (px < -rpx || px > w + rpx || py < -rpx || py > h + rpx) continue;
    const matched = extra.matchSet.has(i);
    const ok = n.m.ok;

    // transient stadium-wave flare: 0..1, rises as the wavefront hits this node, then decays
    let flare = 0;
    if (wave) {
      const hop = wave.hop.get(i);
      if (hop !== undefined) {
        const activation = wave.maxHop > 0 ? (hop / wave.maxHop) * WAVE_MS : 0;
        const te = now - wave.start - activation;
        if (te >= 0) flare = Math.exp(-te / FLARE_MS);
      }
    }
    // matched nodes stay lit after the wave passes; others fade to dark
    const glow = Math.max(matched ? 1 : 0, flare);

    const nodeR = matched ? rpx * MATCH_SCALE : rpx; // matches render larger

    ctx.globalAlpha = ok ? 1 : 0.5;
    if (glow > 0.02) {
      ctx.save();
      ctx.shadowColor = "rgba(250,80,83,0.95)";
      ctx.shadowBlur = 8 + 20 * glow;
      ctx.strokeStyle = `rgba(255,140,142,${0.45 + 0.55 * glow})`;
      ctx.lineWidth = 2 + 1.5 * glow;
      ctx.beginPath();
      ctx.arc(px, py, nodeR + 3 + 5 * glow, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const round = n.m.avatar ? avatarCache.get(n.m.avatar)?.round : null;
    if (round) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, nodeR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(round, px - nodeR, py - nodeR, nodeR * 2, nodeR * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = "#15161c";
      ctx.beginPath();
      ctx.arc(px, py, nodeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8b8f98";
      ctx.font = `${Math.max(9, nodeR * 0.8)}px "Google Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((n.m.name || n.m.domain).slice(0, 1).toUpperCase(), px, py);
    }
    ctx.strokeStyle = ok ? "rgba(140,143,152,0.5)" : "#e5534b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, nodeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (matched || i === extra.hover) labels.push({ x: px, y: py + nodeR + 4, text: n.m.name || n.m.domain });
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = '12px "Google Sans", sans-serif';
  for (const l of labels) {
    const tw = ctx.measureText(l.text).width;
    ctx.fillStyle = "rgba(8,8,10,0.85)";
    ctx.fillRect(l.x - tw / 2 - 4, l.y - 1, tw + 8, 16);
    ctx.fillStyle = "#ededed";
    ctx.fillText(l.text, l.x, l.y);
  }
}
