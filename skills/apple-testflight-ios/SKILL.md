---
name: apple-testflight-ios
description: Prepare local iOS TestFlight readiness work for Chirpy or similar apps. Use for Apple account intake, App Store Connect/TestFlight prerequisites, Tauri iOS build planning, and CI secret naming; never create accounts, export keys, or sign without approval.
---

# Apple TestFlight iOS

Use this skill for guarded planning and readiness checks around iOS TestFlight distribution.

## Contract

- Trigger: a contributor needs a local readiness plan for iOS TestFlight delivery.
- Input: `{ appName, bundleId?, teamName?, repo?, branch?, ciProvider?, releaseScope? }`; operators provide the real Apple account, certificates, provisioning, and App Store Connect authority out of band.
- Output: `{ status: "plan"|"needs_operator"|"blocked", prerequisites, buildSteps?, ciSecrets?, risks?, nextActions? }`; output is planning-only unless a separate approved execution lane is explicitly provided.

## Adapter boundary

Delegate only to local project configuration, documented Apple/TestFlight prerequisites, and repository build metadata. The skill may map required inputs for Apple Developer, App Store Connect, certificates, provisioning profiles, TestFlight groups, and CI secrets, but it never creates an account, exports a signing key, chooses release authority, or publishes a build.

## Local-only rule

Use local repository state, dummy identifiers, and operator-supplied placeholders only. Do not obtain credentials, sign in to Apple services, create or export certificates or keys, upload builds, publish TestFlight releases, or bypass approval for signing, notarization, or store operations.

## Quick validation

Check that the plan separates operator-owned Apple prerequisites from local engineering work, names required CI secrets and build steps, and fails closed when signing materials, App Store Connect access, or provisioning inputs are absent. Keep live distribution, credential handling, and release authority on the operator-owned backlog.
