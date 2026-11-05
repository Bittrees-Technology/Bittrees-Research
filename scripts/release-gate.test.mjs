import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { SITE_CONFIG, runReleaseGate } from "./release-gate.mjs";

function mockPayloadFor(checkId) {
  switch (checkId) {
    case "api-community":
    case "api-rooms":
      return {
        status: 401,
        headers: {"content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow"},
        body: JSON.stringify({error: "Verify your Research wallet to open member data."}),
      };
    case "api-usersync":
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ blob: null, updatedAt: 0 }),
      };
    case "api-gate":
      return {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "unknown gate" }),
      };
    default:
      return {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<!doctype html><html><body><div id=\"root\"></div></body></html>",
      };
  }
}

// Use deterministic in-memory HTTP responses: these contract tests need no
// listening socket, backend credentials or live registry response bodies.
const transports = new WeakMap();
async function startServer(t, overrides = {}) {
  let servers = transports.get(t);
  if (!servers) {
    servers = new Map(); transports.set(t, servers);
    t.mock.method(globalThis, "fetch", async target => {
      const url = new URL(target), registered = servers.get(url.origin);
      if (!registered) throw Error("Unexpected test transport target");
      const check = SITE_CONFIG.checks.find(item => item.path === url.pathname + url.search || item.path === url.pathname);
      if (!check) return new Response("not found", {status: 404, headers: {"content-type": "text/plain"}});
      const payload = registered[check.id] ?? mockPayloadFor(check.id);
      return new Response(payload.body, {status: payload.status, headers: payload.headers});
    });
  }
  const baseUrl = `https://research-gate-${servers.size + 1}.invalid`;
  servers.set(baseUrl, overrides);
  return {baseUrl, async close() { servers.delete(baseUrl); }};
}

test("baseline mode captures a passing snapshot", async t => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-release-gate-"));
  const server = await startServer(t);
  try {
    const run = await runReleaseGate({
      mode: "baseline",
      baseUrl: server.baseUrl,
      outputDir,
      timeoutMs: 5000,
    });
    assert.equal(run.pass, true);
    assert.match(run.artifacts.jsonPath, /run\.json$/);
    assert.match(run.artifacts.reportPath, /report\.md$/);
  } finally {
    await server.close();
  }
});

test("canary mode detects contract drift against a saved baseline", async t => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-release-gate-"));
  const healthyServer = await startServer(t);
  const brokenServer = await startServer(t, {
    "api-gate": {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "boom" }),
    },
  });

  try {
    const baseline = await runReleaseGate({
      mode: "baseline",
      baseUrl: healthyServer.baseUrl,
      outputDir,
      timeoutMs: 5000,
    });
    const canary = await runReleaseGate({
      mode: "canary",
      baseUrl: brokenServer.baseUrl,
      baselineFile: baseline.artifacts.jsonPath,
      outputDir,
      timeoutMs: 5000,
    });
    assert.equal(canary.pass, false);
    assert.ok(
      canary.comparison.diffs.some((diff) => diff.id === "api-gate"),
      "expected api-gate drift to be reported",
    );
  } finally {
    await healthyServer.close();
    await brokenServer.close();
  }
});

test("rollback-check passes when production matches the saved baseline", async t => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-release-gate-"));
  const server = await startServer(t);
  try {
    const baseline = await runReleaseGate({
      mode: "baseline",
      baseUrl: server.baseUrl,
      outputDir,
      timeoutMs: 5000,
    });
    const rollback = await runReleaseGate({
      mode: "rollback-check",
      baseUrl: server.baseUrl,
      baselineFile: baseline.artifacts.jsonPath,
      outputDir,
      timeoutMs: 5000,
    });
    assert.equal(rollback.pass, true);
  } finally {
    await server.close();
  }
});

function unreadableRegistryResponse(status, counters, extraHeaders = {}) {
  const consume = () => { counters.bodyReads++; throw Error("SYNTHETIC_PRIVATE_REGISTRY_BODY"); };
  return {
    status,
    headers: new Headers({"content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow", etag: "SYNTHETIC_PRIVATE_ETAG", ...extraHeaders}),
    body: {cancel: async () => { counters.cancelled++; }, getReader: consume},
    text: consume, json: consume, arrayBuffer: consume,
  };
}

for (const successStatus of [200, 201]) test(`unexpected private registry ${successStatus} stops without consuming or saving the body`, async t => {
  const counters = {bodyReads: 0, cancelled: 0}, visited = [];
  t.mock.method(globalThis, "fetch", async target => {
    const url = new URL(target); visited.push(url.pathname);
    if (url.pathname === "/api/community") return unreadableRegistryResponse(successStatus, counters, {"cache-control": "public, max-age=3600, SYNTHETIC_PRIVATE_HEADER"});
    const check = SITE_CONFIG.checks.find(item => item.path === url.pathname + url.search || item.path === url.pathname);
    const payload = mockPayloadFor(check.id);
    return new Response(payload.body, {status: payload.status, headers: payload.headers});
  });
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-private-gate-"));
  const run = await runReleaseGate({mode: "baseline", baseUrl: "https://fixture.invalid", outputDir});
  assert.equal(run.pass, false); assert.equal(run.stoppedEarly, true);
  assert.equal(counters.bodyReads, 0); assert.equal(counters.cancelled, 1);
  assert.ok(!visited.includes("/api/rooms")); assert.ok(!visited.includes("/api/usersync"));
  const result = run.results.find(item => item.id === "api-community");
  assert.equal(result.bodyOmitted, true); assert.equal(result.bodyPreview, undefined); assert.equal(result.json, undefined);
  assert.equal(result.headers.etag, undefined); assert.equal(result.headers["cache-control"], "max-age, public");
  for (const file of [run.artifacts.jsonPath, run.artifacts.reportPath]) assert.ok(!(await readFile(file, "utf8")).includes("SYNTHETIC_PRIVATE"));
});

test("protected registry 401 uses only sanitized status/header evidence", async t => {
  const counters = {bodyReads: 0, cancelled: 0};
  t.mock.method(globalThis, "fetch", async target => {
    const url = new URL(target);
    if (["/api/community", "/api/rooms"].includes(url.pathname)) return unreadableRegistryResponse(401, counters);
    const check = SITE_CONFIG.checks.find(item => item.path === url.pathname + url.search || item.path === url.pathname);
    const payload = mockPayloadFor(check.id);
    return new Response(payload.body, {status: payload.status, headers: payload.headers});
  });
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-private-gate-"));
  const run = await runReleaseGate({mode: "baseline", baseUrl: "https://fixture.invalid", outputDir});
  assert.equal(run.pass, true); assert.equal(run.stoppedEarly, false);
  assert.equal(counters.bodyReads, 0); assert.equal(counters.cancelled, 2);
  for (const result of run.results.filter(item => ["api-community", "api-rooms"].includes(item.id))) {
    assert.equal(result.status, 401); assert.equal(result.bodyOmitted, true); assert.equal(result.json, undefined); assert.equal(result.bodyPreview, undefined);
    assert.equal(result.headers["cache-control"], "no-store, private"); assert.equal(result.headers.etag, undefined);
  }
  for (const file of [run.artifacts.jsonPath, run.artifacts.reportPath]) assert.ok(!(await readFile(file, "utf8")).includes("SYNTHETIC_PRIVATE"));
});

test("private denial without no-store headers fails without body inspection", async t => {
  const counters = {bodyReads: 0, cancelled: 0};
  t.mock.method(globalThis, "fetch", async target => {
    const url = new URL(target);
    if (["/api/community", "/api/rooms"].includes(url.pathname)) return unreadableRegistryResponse(401, counters, {"cache-control": "public, max-age=60"});
    const check = SITE_CONFIG.checks.find(item => item.path === url.pathname + url.search || item.path === url.pathname);
    const payload = mockPayloadFor(check.id);
    return new Response(payload.body, {status: payload.status, headers: payload.headers});
  });
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-private-gate-"));
  const run = await runReleaseGate({mode: "baseline", baseUrl: "https://fixture.invalid", outputDir});
  assert.equal(run.pass, false); assert.equal(counters.bodyReads, 0);
  assert.ok(run.results.find(item => item.id === "api-community").assertions.some(item => item.kind === "header-token" && !item.pass));
});
