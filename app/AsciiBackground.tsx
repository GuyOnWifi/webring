"use client";

import { useEffect, useRef } from "react";

// Ambient ASCII "ember drift" texture rendered to a fixed, low-opacity canvas
// behind all content. Self-contained: no props, no app dependencies, no assets.
// Respects prefers-reduced-motion (renders a single static frame instead of
// animating) and is aria-hidden / pointer-events-none so it never interferes.

const GLYPHS = " .·:-=+*#%▓░▒".split("");
const CELL = 14; // px per character cell
const FADE = 0.965; // trail persistence per frame

export default function AsciiBackground() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let cols = 0;
    let rows = 0;
    let heat: number[] = []; // per-column phase offset for drift
    let raf = 0;
    let last = 0;
    let t = 0;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${CELL}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = "top";
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      heat = Array.from({ length: cols }, (_, i) => Math.sin(i * 0.7) * 3);
      ctx.clearRect(0, 0, w, h);
    };

    // Brightness field: embers are hotter toward the bottom-right, drifting upward.
    const intensity = (x: number, y: number, time: number) => {
      const base = (x / cols) * 0.5 + (y / rows) * 0.6; // brighter bottom-right
      const drift = Math.sin(y * 0.25 - time * 1.6 + heat[x % heat.length]);
      const shimmer = Math.sin(x * 0.35 + y * 0.2 + time * 0.9);
      return base * 0.6 + drift * 0.22 + shimmer * 0.18;
    };

    // Slow-morphing blue blob: two drifting metaball centers. Characters deep
    // inside the blob tint toward blue; everything else stays neutral gray.
    const blueAt = (x: number, y: number, time: number) => {
      const R = Math.min(cols, rows) * 0.42;
      const cx1 = cols * (0.5 + 0.34 * Math.sin(time * 0.1));
      const cy1 = rows * (0.5 + 0.3 * Math.cos(time * 0.08));
      const cx2 = cols * (0.5 + 0.3 * Math.cos(time * 0.06 + 1.7));
      const cy2 = rows * (0.5 + 0.33 * Math.sin(time * 0.12 + 0.9));
      const f =
        Math.exp(-(((x - cx1) ** 2 + (y - cy1) ** 2) / (R * R))) +
        Math.exp(-(((x - cx2) ** 2 + (y - cy2) ** 2) / (R * R)));
      return Math.min(1, f);
    };

    const drawFrame = (time: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Fade previous frame slightly for a soft trail instead of hard clears.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${1 - FADE})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      // Repaint a sparse subset of cells each frame so it shimmers, not strobes.
      const cells = Math.floor(cols * rows * 0.06);
      for (let k = 0; k < cells; k++) {
        const x = (Math.random() * cols) | 0;
        const y = (Math.random() * rows) | 0;
        const v = intensity(x, y, time);
        const idx = Math.max(0, Math.min(GLYPHS.length - 1, Math.round(v * (GLYPHS.length - 1))));
        const g = GLYPHS[idx];
        if (g === " ") continue;
        const alpha = Math.max(0, Math.min(1, v)) * 0.9;
        // tint from neutral gray → strawberry red (#fa5053) by depth inside the moving blob
        const b = blueAt(x, y, time) * 0.9;
        const cr = (210 + (250 - 210) * b) | 0;
        const cg = (214 + (80 - 214) * b) | 0;
        const cb = (222 + (83 - 222) * b) | 0;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.fillText(g, x * CELL, y * CELL);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 66) return; // ~15fps is plenty for ambient texture
      last = now;
      t += 0.05;
      drawFrame(t);
    };

    resize();
    window.addEventListener("resize", resize);

    if (reduced) {
      // Single static frame — no animation.
      for (let pass = 0; pass < 12; pass++) drawFrame(pass * 0.3);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 opacity-[0.06]"
    />
  );
}
