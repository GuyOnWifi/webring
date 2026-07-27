export type Socials = Partial<
  Record<"github" | "x" | "linkedin" | "instagram" | "mastodon" | "bluesky" | "matrix", string>
>;

export type Member = {
  site: string;
  domain: string;
  name?: string;
  description?: string;
  avatar?: string;
  feed?: string;
  homepage?: string;
  program?: string;
  socials?: Socials;
  tags?: string[];
  source?: string;
  ok: boolean;
  failures: number;
  error?: string;
  lastPost?: string | null;
};

export type RingMeta = { id: string; name: string; url: string; description: string };

export type Index = {
  ring: RingMeta;
  generated: string;
  count: number;
  tags: string[];
  programs: string[];
  members: Member[];
};

export type Post = {
  title: string;
  link: string;
  date: string;
  author: string;
  domain: string;
};

export type Feed = { generated: string; posts: Post[] };
