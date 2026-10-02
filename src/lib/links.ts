/* Single source of truth for external + family links.
   Keeps the chrome, dashboard, and footer in sync. */

/** The Bittrees family of sites (the 3-in-1 org + hub). */
export const FAMILY_LINKS = [
  { label: "Governance", href: "https://gov.bittrees.org", desc: "Bittrees, Inc." },
  { label: "Capital", href: "https://capital.bittrees.org", desc: "Holdings & treasury" },
  { label: "Index", href: "https://index.bittrees.org", desc: "Sites & partners" },
  { label: "Home", href: "https://bittrees.org", desc: "bittrees.org" },
] as const;

/** Bittrees Research external presences (governance, forum, social, publishing). */
export const RESEARCH_LINKS = {
  snapshot: "https://snapshot.box/#/s:research.bittrees.eth",
  forum: "https://metaforo.io/g/bittreesresearch",
  twitter: "https://twitter.com/bresearch_",
  paragraph: "https://paragraph.com/@bresearch",
} as const;

/** Paragraph publication slug (RSS pulled server-side via /api/posts). */
export const PARAGRAPH_SLUG = "@bresearch";

/** On-chain references. */
export const EXPLORERS = {
  membership: "https://etherscan.io/token/0xc8121e650bd797d8b9dad00227a9a77ef603a84a",
  bnoteEth: "https://etherscan.io/address/0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
  bnoteBase: "https://basescan.org/address/0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
  bit: "https://etherscan.io/token/0x57A447E4d5e18A9423408C365963A73F08B9d18C",
} as const;

/** Internal routes referenced across the chat/forum components. */
export const ROUTES = {
  overview: "/",
  contribute: "/contribute",
  forum: "/forum",
  chat: "/chat",
  membership: "/membership",
  bnote: "/bnote",
  bit: "/bit",
} as const;

/** 0x12… abcd short form. */
export function shortAddress(a?: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

/** Compact human number ("1.2K", "3.4M"). */
export function fmtNumber(n?: number | bigint): string {
  const v = typeof n === "bigint" ? Number(n) : n ?? 0;
  if (!isFinite(v)) return "0";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(v));
}

/** "5m", "3h", "2d", or a date — relative time from a unix-seconds timestamp. */
export function relativeTime(unixSec?: number): string {
  if (!unixSec) return "";
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
