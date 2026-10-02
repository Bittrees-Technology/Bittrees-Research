---
name: bittrees-role-apply
description: Prepare or inspect a local Bittrees contributor role-application fixture. Use for guarded Research or Governance application flows; never grant a role, select approval authority, or access a public service.
---

# Bittrees Role Apply

Use an explicitly injected local/test role service; the default handler stays without role routes.

## Contract

- Trigger: a contributor prepares or inspects a Research or Governance role application.
- Input: `{ roleId: "research-contributor"|"governance-contributor", motivation, experience, evidenceLinks? }`; the server derives applicant, role lane, and policy. Client applicant, wallet, reviewer, lane, and authority fields are ignored.
- Output: `{ status: "fixture"|"not_configured"|"denied", applicationId?, state?, version?, reason? }`; states may be `submitted`, `in_review`, `needs_info`, `pending_authority`, `approved`, or `rejected` only when supplied by a fixture.

## Adapter boundary

Delegate to the injected role-service contract, not a portal default or a live endpoint. Server catalog owns the role-to-lane mapping; a skill never provisions capabilities or chooses reviewer, approver, quorum, delegation, or authority.

## Local-only rule

Use loopback, dummy verified principals, and temporary mode-0600 fixture data only. Do not obtain credentials, sign, deploy, register identity, access a live API, or grant a role, tool, repository, admin, wallet, payment, or execution capability.

## Quick validation

Run `quick_validate.py` on this folder. A fixture must reject unknown roles and spoofed applicant/lane data, preserve immutable terminal states, require version checks, and keep absent/wrong authority at `pending_authority` with no provisioning. Keep SIWE/session, storage, audit, and authority gaps on the portal backlog.
