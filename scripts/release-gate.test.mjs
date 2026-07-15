import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";

import { SITE_CONFIG, runReleaseGate } from "./release-gate.mjs";

function mockPayloadFor(checkId) {
  switch (checkId) {
    case "api-community":
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          roles: {},
          roledefs: [],
          flags: {},
          enckeys: {},
          threshold: 2,
        }),
      };
    case "api-rooms":
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          rooms: {},
          custom: [],
          proposals: [],
          icons: {},
        }),
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

async function startServer(overrides = {}) {
  const routeByPath = new Map(SITE_CONFIG.checks.map((check) => [check.path, check]));
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const check =
      routeByPath.get(requestUrl.pathname === "/api/usersync" ? `${requestUrl.pathname}${requestUrl.search}` : requestUrl.pathname) ||
      routeByPath.get(requestUrl.pathname);
    if (!check) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    const payload = overrides[check.id] ?? mockPayloadFor(check.id);
    response.writeHead(payload.status, payload.headers);
    response.end(payload.body);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    async close() {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

test("baseline mode captures a passing snapshot", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-release-gate-"));
  const server = await startServer();
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

test("canary mode detects contract drift against a saved baseline", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-release-gate-"));
  const healthyServer = await startServer();
  const brokenServer = await startServer({
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

test("rollback-check passes when production matches the saved baseline", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "research-release-gate-"));
  const server = await startServer();
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
