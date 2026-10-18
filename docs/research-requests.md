# Member research requests

Entry: `/research/requests`, linked from the Research library.

## Workflow

1. Any active holder of the current Research membership can open a brief: question, context/scope, expected deliverable, optional target date.
2. Another active member with the exact `research.role.researcher.v1` credential accepts the open request. One assignee at a time; accepting one's own request is not supported.
3. The assigned Researcher submits findings and an optional HTTP(S) deliverable link.
4. The original requester accepts the findings to complete the request, or supplies revision notes to return it to in progress.

The requester can cancel unfinished work with a reason. The assignee can release in-progress work with a reason, including after losing the Researcher credential, provided their membership remains active. Previous findings and transition history are retained. No payments, credential issuance, public publication, or automatic contributor approval occur.

## Authority and privacy

All board reads and mutations require a verified wallet session and a fresh server-side current-membership check. Acceptance and submission additionally require the exact native Researcher credential, valid at finality and latest state. Executive, Steward, Assistant, arbitrary credential labels, and app admin permissions do not substitute. Existing contract deployment pins, revocation, burn, expiry, and parent-membership checks apply; no contracts change.

Wallet proof uses the existing cookie-bound, single-use contributor authentication implementation with the Research contributor cookie/key namespace and a shared Research sign-in message. The landing page, request board and contributor records reuse the same ownership proof; each endpoint keeps its own authorization checks. Existing contributor sessions remain valid. Old isolated request-board sessions require one new Research verification. Mutations and reads require same-origin POST, CSRF token, and matching wallet. Account switching unmounts the old board. The site-wide membership gate also applies.

Briefs, findings and history are shared with active members, not confidential between just the two participants. Redis stores the board encrypted with the existing private storage codec. Authentication uses existing production storage and identity secrets. There is no unsigned public board endpoint.

## Concurrency and limits

Each transition checks request version and command ID; Redis compare-and-set protects the full encrypted board from concurrent updates. A conflicting write returns 409 with a refresh instruction. A network failure never confirms success; users should refresh before retrying.

Initial bounded storage: 1,000 total requests, ten unfinished requests per requester, 100 activities per request (closing/release actions still allowed), four MB encrypted board. This version intentionally fails explicitly at capacity; archive/pagination would be a subsequent migration, not automatic deletion. Full request data is returned only after authorization. The optional target date is a requested deadline, not a promise or scheduled notification.

## Verification

`npm test` includes lifecycle, authorization, revocation, replay, encrypted CAS concurrency and HTTP session/CSRF tests. `npm run test:contributors` covers shared authentication regressions. `npm run test:contributors-browser` includes creation, revisions, completion, acceptance, delivery, ordinary-member denial, wallet switching and mobile overflow checks. Synthetic browser data never writes production requests.
