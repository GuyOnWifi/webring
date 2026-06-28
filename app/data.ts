// Build-time data access. The GitHub Action runs `scripts/build.mjs` (the scraper)
// which writes these JSON files into public/ and commits them; Next reads them here
// at build time and statically renders the site.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Index, Feed } from "./types";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), "public", file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function getIndex(): Promise<Index> {
  return readJson<Index>("index.json", {
    ring: { id: "", name: "Webring", url: "", description: "" },
    generated: "",
    count: 0,
    tags: [],
    programs: [],
    members: [],
  });
}

export function getFeed(): Promise<Feed> {
  return readJson<Feed>("feed.json", { generated: "", posts: [] });
}
