---
name: bittrees-contributor-admin
description: Review local Bittrees contributor-application fixtures through server-authorized Gov or Research paths. Use for queue, detail, summary, and negative-authority tests; never select authority, approve live work, or grant capabilities.
---

# Bittrees Contributor Admin

Keep reviewer eligibility separate from final decision authority and resolve both on the server.

## Contract

- Trigger: a reviewer needs a local queue, summary, detail projection, or review-action fixture.
- Input: `{ operation: "list"|"summary"|"detail"|"review", roleId?, lane?, applicationId?, action?: "start_review"|"request_info"|"resume_review"|"approve"|"reject", expectedVersion? }`; server derives reviewer, eligibility, lane, authority, and policy.
- Output: `{ status: "fixture"|"not_configured"|"denied"|"pending_authority", applications?, summary?, application?, auditRef?, reason? }`; fixture values are never live authorization evidence.

## Adapter boundary

Invoke an injected local/test role service only after server policy checks. Do not trust client reviewer, wallet, team, role, lane, or authority fields; do not expose records before eligibility; and never select an approver, quorum, delegation, or authority. An approve/reject proposal without valid authority remains `pending_authority`.

## Local-only rule

Use loopback, dummy policies, and temporary mode-0600 fixture data only. Do not obtain credentials, sign, deploy, register identity, access live admin routes, approve live work, exercise approval authority, or grant roles, tools, repositories, admin, wallets, payments, or execution capabilities.

## Quick validation

Run `quick_validate.py` on this folder. Fixtures must deny ineligible/wrong-lane reviewers before disclosure, require `expectedVersion`, retain immutable terminals, and assert `capabilityGrant: null` plus `provisioning: "not_requested"` for every result. Route policy, persistence, audit, revocation, rate-limit, and release gaps to the portal backlog.
