import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PRIVATE_REGISTRY_PATHS = new Set(["/api/community", "/api/rooms"]);
const SNAPSHOT_HEADERS = [
  "content-type",
  "cache-control",
  "cdn-cache-control",
  "vercel-cdn-cache-control",
  "last-modified",
  "etag",
  "x-robots-tag",
];

export const SITE_CONFIG = {
  site: "research",
  productionBaseUrl: "https://research.bittrees.org",
  checks: [
    {
      id: "route-root",
      label: "Root route",
      path: "/",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "route-research",
      label: "Research route",
      path: "/research",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "route-forum",
      label: "Forum route",
      path: "/forum",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "route-chat",
      label: "Chat route",
      path: "/chat",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "route-membership",
      label: "Membership route",
      path: "/membership",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "route-bnote",
      label: "BNOTE route",
      path: "/bnote",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "route-bit",
      label: "BIT route",
      path: "/bit",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "route-contribute",
      label: "Contribute route",
      path: "/contribute",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "route-admin",
      label: "Admin route",
      path: "/admin",
      kind: "route",
      expect: { status: 200, contentTypeIncludes: "text/html" },
      signature: [{ type: "header", key: "content-type" }],
    },
    {
      id: "api-community",
      label: "Private community registry anonymous denial",
      path: "/api/community",
      kind: "api",
      expect: {
        status: 401,
        contentTypeIncludes: "application/json",
        headerIncludes: {"cache-control": ["private", "no-store"], "x-robots-tag": ["noindex"]},
      },
      signature: [
        {type: "header", key: "content-type"},
        {type: "header", key: "cache-control"},
        {type: "header", key: "x-robots-tag"},
      ],
    },
    {
      id: "api-rooms",
      label: "Private rooms registry anonymous denial",
      path: "/api/rooms",
      kind: "api",
      expect: {
        status: 401,
        contentTypeIncludes: "application/json",
        headerIncludes: {"cache-control": ["private", "no-store"], "x-robots-tag": ["noindex"]},
      },
      signature: [
        {type: "header", key: "content-type"},
        {type: "header", key: "cache-control"},
        {type: "header", key: "x-robots-tag"},
      ],
    },
    {
      id: "api-usersync",
      label: "User sync probe",
      path: `/api/usersync?address=${ZERO_ADDRESS}`,
      kind: "api",
      expect: {
        status: 200,
        contentTypeIncludes: "application/json",
        json: [
          { path: "blob", equals: null },
          { path: "updatedAt", type: "number" },
        ],
      },
      signature: [
        { type: "header", key: "content-type" },
        { type: "json-value", path: "blob" },
        { type: "json-type", path: "updatedAt" },
      ],
    },
    {
      id: "api-gate",
      label: "Gate malformed-input contract",
      path: "/api/gate",
      kind: "api",
      expect: {
        status: 400,
        contentTypeIncludes: "application/json",
        json: [{ path: "error", equals: "unknown gate" }],
      },
      signature: [
        { type: "header", key: "content-type" },
        { type: "json-value", path: "error" },
      ],
    },
  ],
  rollbackNotes: [
    "Restore the last known-good Vercel deployment for research.bittrees.org from deployment history.",
    "Re-run this gate in rollback-check mode against the saved baseline artifact before reopening traffic.",
    "If /api/community, /api/rooms, or membership reads still regress after rollback, treat it as a KV or env incident rather than repeating code flips.",
  ],
};

function parseArgs(argv) {
  const args = {
    mode: "baseline",
    baseUrl: SITE_CONFIG.productionBaseUrl,
    outputDir: path.resolve("output", "release-gates"),
    timeoutMs: 15000,
    baselineFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unknown positional argument: ${token}`);
    }
    const [flag, inlineValue] = token.split("=", 2);
    const value =
      inlineValue ?? (index + 1 < argv.length ? argv[++index] : undefined);
    switch (flag) {
      case "--mode":
        args.mode = value;
        break;
      case "--base-url":
        args.baseUrl = value;
        break;
      case "--baseline":
        args.baselineFile = value;
        break;
      case "--output-dir":
        args.outputDir = path.resolve(value);
        break;
      case "--timeout-ms":
        args.timeoutMs = Number(value);
        break;
      case "--help":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage: node scripts/release-gate.mjs [options]

Modes:
  baseline       Capture a read-only production backup snapshot
  canary         Validate a supplied canary or preview URL
  rollback-check Validate current production against a saved baseline

Options:
  --mode <baseline|canary|rollback-check>
  --base-url <url>        Target URL for baseline or canary checks
  --baseline <file>       Prior run.json artifact used for canary diff or rollback verification
  --output-dir <dir>      Artifact directory (default: output/release-gates)
  --timeout-ms <ms>       Per-request timeout (default: 15000)
`);
}

function normaliseBaseUrl(value) {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function urlFor(baseUrl, resourcePath) {
  return new URL(resourcePath, `${normaliseBaseUrl(baseUrl)}/`).toString();
}

function readPath(input, dottedPath) {
  return dottedPath
    .split(".")
    .reduce(
      (current, segment) =>
        current !== null && current !== undefined ? current[segment] : undefined,
      input,
    );
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function truncate(value, maxLength = 400) {
  if (typeof value !== "string") return value;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

// Registry probe artifacts contain only normalized status/header evidence.
// Never retain raw registry response bodies, ETags or arbitrary header values.
function privateRegistryHeaders(responseHeaders) {
  const headers = {};
  const mediaType = (responseHeaders.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  headers["content-type"] = mediaType === "application/json" ? mediaType : "(unexpected or missing)";
  const known = new Set(["private", "no-store", "no-cache", "public", "must-revalidate", "immutable", "max-age", "s-maxage", "noindex", "nofollow", "index", "follow", "none", "all", "noarchive", "nosnippet"]);
  for (const name of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control", "x-robots-tag"]) {
    const raw = responseHeaders.get(name);
    if (raw) headers[name] = [...new Set(raw.toLowerCase().split(",").map(part => part.trim().split("=", 1)[0]).filter(part => known.has(part)))].sort().join(", ") || "(unrecognized)";
  }
  return headers;
}

function buildAssertions(check, payload) {
  const assertions = [];
  const expect = check.expect ?? {};

  if (expect.status !== undefined) {
    assertions.push({
      kind: "status",
      pass: payload.status === expect.status,
      expected: expect.status,
      actual: payload.status,
      message: `status ${payload.status}`,
    });
  }

  if (expect.contentTypeIncludes) {
    assertions.push({
      kind: "content-type",
      pass: payload.contentType.includes(expect.contentTypeIncludes),
      expected: expect.contentTypeIncludes,
      actual: payload.contentType || "(missing)",
      message: `content-type ${payload.contentType || "(missing)"}`,
    });
  }

  for (const [key, values] of Object.entries(expect.headerIncludes ?? {})) {
    const actual = payload.headers[key] || "";
    const tokens = actual.split(",").map(part => part.trim());
    for (const value of values) assertions.push({kind: "header-token", pass: tokens.includes(value), expected: value, actual, message: `${key} includes ${value}`});
  }

  for (const jsonAssertion of expect.json ?? []) {
    const actual = readPath(payload.json, jsonAssertion.path);
    if (Object.prototype.hasOwnProperty.call(jsonAssertion, "equals")) {
      assertions.push({
        kind: "json-equals",
        pass: Object.is(actual, jsonAssertion.equals),
        expected: jsonAssertion.equals,
        actual,
        message: `${jsonAssertion.path}=${JSON.stringify(actual)}`,
      });
      continue;
    }

    if (jsonAssertion.type) {
      const actualType = valueType(actual);
      assertions.push({
        kind: "json-type",
        pass: actualType === jsonAssertion.type,
        expected: jsonAssertion.type,
        actual: actualType,
        message: `${jsonAssertion.path}:${actualType}`,
      });
    }
  }

  return assertions;
}

function buildSignature(check, payload) {
  return (check.signature ?? []).map((part) => {
    if (part.type === "header") {
      return `${part.key}=${payload.headers[part.key] || ""}`;
    }
    if (part.type === "json-type") {
      return `${part.path}:${valueType(readPath(payload.json, part.path))}`;
    }
    if (part.type === "json-value") {
      return `${part.path}=${JSON.stringify(readPath(payload.json, part.path))}`;
    }
    return `${part.type}=unsupported`;
  });
}

async function fetchCheck(baseUrl, check, timeoutMs) {
  const targetUrl = urlFor(baseUrl, check.path);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const privateProbe = PRIVATE_REGISTRY_PATHS.has(check.path.split("?", 1)[0]);

  try {
    const response = await fetch(targetUrl, {
      headers: { accept: "application/json,text/html;q=0.9,*/*;q=0.8" },
      signal: controller.signal,
    });
    const headers = privateProbe ? privateRegistryHeaders(response.headers) : Object.fromEntries(
      SNAPSHOT_HEADERS.map((key) => [key, response.headers.get(key) || ""]).filter(
        ([, value]) => value,
      ),
    );
    const contentType = privateProbe ? headers["content-type"] : response.headers.get("content-type") || "";
    let bodyText = "";
    if (privateProbe) {
      // Even an unexpected HTTP 200 might contain private records. Cancel the
      // stream without consuming it, including on the expected HTTP 401 path.
      try { await response.body?.cancel(); } catch { /* No response data enters evidence. */ }
    } else bodyText = await response.text();
    let json = null;

    if (!privateProbe && contentType.includes("application/json")) {
      try {
        json = JSON.parse(bodyText);
      } catch {
        json = null;
      }
    }

    const payload = {
      id: check.id,
      label: check.label,
      kind: check.kind,
      path: check.path,
      url: targetUrl,
      status: response.status,
      contentType,
      headers,
      durationMs: Date.now() - startedAt,
      ...(privateProbe ? {bodyOmitted: true} : {bodyPreview: truncate(bodyText), json}),
    };
    const assertions = buildAssertions(check, payload);
    return {
      ...payload,
      assertions,
      pass: assertions.every((assertion) => assertion.pass),
      signature: buildSignature(check, payload),
      ...(privateProbe && response.status >= 200 && response.status < 300 ? {stopAfterUnexpectedSuccess: true} : {}),
    };
  } catch (error) {
    return {
      id: check.id,
      label: check.label,
      kind: check.kind,
      path: check.path,
      url: targetUrl,
      status: null,
      contentType: "",
      headers: {},
      durationMs: Date.now() - startedAt,
      ...(privateProbe ? {bodyOmitted: true} : {bodyPreview: "", json: null}),
      assertions: [
        {
          kind: "fetch",
          pass: false,
          expected: "successful response",
          actual: privateProbe ? "Private registry probe unavailable" : error instanceof Error ? error.message : String(error),
          message: privateProbe ? "Private registry probe unavailable" : error instanceof Error ? error.message : String(error),
        },
      ],
      pass: false,
      signature: ["fetch-error"],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function compareRuns(baselineRun, currentRun) {
  const baselineById = new Map(
    (baselineRun.results ?? []).map((result) => [result.id, result]),
  );
  const diffs = [];

  for (const currentResult of currentRun.results) {
    const baselineResult = baselineById.get(currentResult.id);
    if (!baselineResult) {
      diffs.push({
        id: currentResult.id,
        label: currentResult.label,
        reason: "missing-baseline-check",
      });
      continue;
    }

    if (baselineResult.status !== currentResult.status) {
      diffs.push({
        id: currentResult.id,
        label: currentResult.label,
        reason: "status-changed",
        baseline: baselineResult.status,
        current: currentResult.status,
      });
    }

    if (
      JSON.stringify(baselineResult.signature ?? []) !==
      JSON.stringify(currentResult.signature ?? [])
    ) {
      diffs.push({
        id: currentResult.id,
        label: currentResult.label,
        reason: "signature-changed",
        baseline: baselineResult.signature ?? [],
        current: currentResult.signature ?? [],
      });
    }
  }

  return {
    pass: diffs.length === 0,
    baselineSite: baselineRun.site,
    baselineMode: baselineRun.mode,
    diffs,
  };
}

function stampForFile(dateIso) {
  return dateIso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function renderReport(run) {
  const lines = [
    `# ${SITE_CONFIG.site}.bittrees.org release gate`,
    "",
    `- Site: \`${SITE_CONFIG.site}.bittrees.org\``,
    `- Mode: \`${run.mode}\``,
    `- Target URL: \`${run.targetUrl}\``,
    `- Created: \`${run.createdAt}\``,
    `- Overall result: **${run.pass ? "PASS" : "FAIL"}**`,
  ];

  if (run.baselineFile) {
    lines.push(`- Baseline artifact: \`${run.baselineFile}\``);
  }
  if (run.stoppedEarly) lines.push("- Stopped: an anonymous private-registry probe returned a successful response. Its body was not consumed.");

  lines.push("");
  lines.push("| Check | Status | Pass | Signature |");
  lines.push("| --- | --- | --- | --- |");
  for (const result of run.results) {
    lines.push(
      `| ${result.label} | ${result.status ?? "ERR"} | ${result.pass ? "PASS" : "FAIL"} | \`${(result.signature ?? []).join(" ; ")}\` |`,
    );
  }

  lines.push("");
  lines.push("## Rollback notes");
  lines.push("");
  for (const note of SITE_CONFIG.rollbackNotes) {
    lines.push(`- ${note}`);
  }

  if (run.comparison) {
    lines.push("");
    lines.push("## Baseline comparison");
    lines.push("");
    lines.push(
      `- Comparison result: **${run.comparison.pass ? "PASS" : "FAIL"}**`,
    );
    if (run.comparison.diffs.length === 0) {
      lines.push("- No status or signature drift detected against the saved baseline.");
    } else {
      for (const diff of run.comparison.diffs) {
        lines.push(
          `- ${diff.label} (${diff.id}) ${diff.reason}: baseline=${JSON.stringify(diff.baseline ?? null)} current=${JSON.stringify(diff.current ?? null)}`,
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

async function writeArtifacts(run, outputDir) {
  const runDir = path.join(
    outputDir,
    `${SITE_CONFIG.site}-${run.mode}-${stampForFile(run.createdAt)}`,
  );
  await mkdir(runDir, { recursive: true });
  const jsonPath = path.join(runDir, "run.json");
  const reportPath = path.join(runDir, "report.md");
  await writeFile(jsonPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await writeFile(reportPath, renderReport(run), "utf8");
  return { runDir, jsonPath, reportPath };
}

async function loadBaselineRun(baselineFile) {
  const raw = await readFile(baselineFile, "utf8");
  return JSON.parse(raw);
}

export async function runReleaseGate(options = {}) {
  const mode = options.mode ?? "baseline";
  if (!["baseline", "canary", "rollback-check"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const targetUrl =
    mode === "rollback-check"
      ? options.baseUrl ?? SITE_CONFIG.productionBaseUrl
      : options.baseUrl ?? SITE_CONFIG.productionBaseUrl;

  const results = [];
  let stoppedEarly = false;
  for (const check of SITE_CONFIG.checks) {
    const result = await fetchCheck(targetUrl, check, options.timeoutMs ?? 15000);
    results.push(result);
    if (result.stopAfterUnexpectedSuccess) { stoppedEarly = true; break; }
  }

  const run = {
    site: SITE_CONFIG.site,
    mode,
    createdAt: new Date().toISOString(),
    targetUrl: normaliseBaseUrl(targetUrl),
    baselineFile: options.baselineFile ?? null,
    results,
    stoppedEarly,
    pass: results.every((result) => result.pass),
  };

  if (options.baselineFile) {
    const baselineRun = await loadBaselineRun(options.baselineFile);
    run.comparison = compareRuns(baselineRun, run);
    run.pass = run.pass && run.comparison.pass;
  }

  run.artifacts = await writeArtifacts(
    run,
    options.outputDir ?? path.resolve("output", "release-gates"),
  );

  return run;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (
    (args.mode === "canary" || args.mode === "rollback-check") &&
    !args.baselineFile
  ) {
    throw new Error(`${args.mode} mode requires --baseline <run.json>`);
  }

  const run = await runReleaseGate(args);
  console.log(
    `${SITE_CONFIG.site} release gate ${run.pass ? "PASS" : "FAIL"} (${run.mode})`,
  );
  console.log(`Artifacts: ${run.artifacts.runDir}`);

  if (!run.pass) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
