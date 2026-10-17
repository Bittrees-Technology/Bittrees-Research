/* Canonical facts about Bittrees Research — the token stack, governance, and
   where the foundation sits in the wider Bittrees organization. Drives the
   Structure page (replaces the external org-chart drawing). */

import { EXPLORERS, RESEARCH_LINKS } from "@/lib/links";

export interface StackToken {
  key: string;
  name: string;
  standard: string;
  chain: string;
  role: string;
  address: string;
  explorer: string;
  badgeClass: string;
}

export const TOKEN_STACK: StackToken[] = [
  {
    key: "membership",
    name: "Membership",
    standard: "ERC-1155",
    chain: "Ethereum",
    role: "Access pass to the foundation — a 360-day, renewable membership.",
    address: "0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335",
    explorer: EXPLORERS.membership,
    badgeClass: "badge-member",
  },
  {
    key: "bnote",
    name: "BNOTE",
    standard: "ERC-1155",
    chain: "Ethereum · Base",
    role: "Preferred stock — the foundation's Bitcoin-denominated capital intake (0.001 BTC each).",
    address: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
    explorer: EXPLORERS.bnoteEth,
    badgeClass: "badge-preferred",
  },
  {
    key: "bit",
    name: "BIT",
    standard: "ERC-20",
    chain: "Ethereum · Base",
    role: "The Bittrees Index Token — wraps BNOTE; peg of 1 BIT = 1/1,000,000 BTC.",
    address: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
    explorer: EXPLORERS.bit,
    badgeClass: "badge-index",
  },
];

/** The three arms of the wider Bittrees organization. */
export const ORG_ARMS = [
  {
    name: "Bittrees, Inc.",
    role: "Operations & governance",
    href: "https://gov.bittrees.org",
    here: false,
  },
  {
    name: "Bittrees Capital",
    role: "Treasury & holdings",
    href: "https://capital.bittrees.org",
    here: false,
  },
  {
    name: "Bittrees Research",
    role: "Research foundation — capital intake (BNOTE → BIT)",
    href: "",
    here: true,
  },
];

/** Member → preferred stock → index token. */
export const CAPITAL_FLOW = [
  { step: "Join", detail: "Mint a membership to access the foundation." },
  { step: "Acquire BNOTE", detail: "Buy preferred stock, denominated in Bitcoin." },
  { step: "Convert to BIT", detail: "Wrap BNOTE into the Index Token at the protocol peg." },
];

export const GOVERNANCE = {
  snapshot: RESEARCH_LINKS.snapshot,
  snapshotSpace: "research.bittrees.eth",
  forum: RESEARCH_LINKS.forum,
};

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
