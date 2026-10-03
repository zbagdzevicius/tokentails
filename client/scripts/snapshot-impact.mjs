#!/usr/bin/env node
/**
 * Writes the bundled impact baseline, public/impact/snapshot.json (plan F7.6).
 *
 * App builds (static export) and every surface whose CDN and API fetches fail read this file. It is
 * committed, so refresh it before an app build or a release:
 *
 *   IMPACT_SOURCE_URL=https://api.example/impact node scripts/snapshot-impact.mjs
 *   node scripts/snapshot-impact.mjs --allow-dev          # from http://localhost:3005/impact
 *   node scripts/snapshot-impact.mjs --check              # exit 1 when missing, invalid or dev-sourced
 *   node scripts/snapshot-impact.mjs --check --allow-dev  # accept a dev-sourced file (local work)
 *
 * A local source (localhost, 127.*, ::1) is refused without --allow-dev: its numbers come from a
 * developer's database. A production build ignores a dev-sourced baseline (api/impact-api.ts), so
 * regenerate the file from the production API before merging and before every app build.
 *
 * The file is the public GET /impact shape plus `_baseline: { stampedAt, from }`, so every surface
 * can show how old it is. The script refuses a response that is not a v1 snapshot or that contains a
 * private key name (email, wallets, walletPrivateKey, users, password, token).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_PATH = join(here, "..", "public", "impact", "snapshot.json");
const FORBIDDEN_KEYS = new Set(["email", "wallets", "walletPrivateKey", "users", "password", "token", "accesstoken", "firebaseUids"]);

/** Key paths in `value` whose name is private. Empty when the object is safe to publish. */
export function privateKeyPaths(value, path = "$") {
  const out = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...privateKeyPaths(v, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) out.push(`${path}.${k}`);
      out.push(...privateKeyPaths(v, `${path}.${k}`));
    }
  }
  return out;
}

export function validateSnapshot(data) {
  const problems = [];
  if (!data || typeof data !== "object") return ["not an object"];
  if (data._v !== 1) problems.push(`_v is ${data._v}, expected 1`);
  if (!data.generatedAt || Number.isNaN(Date.parse(data.generatedAt))) problems.push("generatedAt missing");
  for (const key of ["money", "players", "shelters", "rail", "treats"]) {
    if (!data[key] || typeof data[key] !== "object") problems.push(`${key} missing`);
  }
  for (const p of privateKeyPaths(data)) problems.push(`private key name at ${p}`);
  return problems;
}

/** localhost, *.localhost, 127.*, ::1 or 0.0.0.0, with or without a port. */
export function isDevHost(host) {
  const h = String(host || "").toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || /^127\./.test(h) || h === "::1" || h === "0.0.0.0";
}

export function stamp(data, from, now = new Date()) {
  const { _baseline, ...rest } = data;
  void _baseline;
  return { ...rest, _baseline: { stampedAt: now.toISOString(), from } };
}

async function main() {
  const allowDev = process.argv.includes("--allow-dev");
  if (process.argv.includes("--check")) {
    if (!existsSync(SNAPSHOT_PATH)) {
      console.error(`snapshot-impact: ${SNAPSHOT_PATH} is missing`);
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
    const problems = validateSnapshot(data);
    if (!allowDev && isDevHost(data?._baseline?.from)) {
      problems.push(`written from a local dev backend (${data._baseline.from}); regenerate it from production`);
    }
    if (problems.length) {
      console.error(`snapshot-impact: invalid baseline:\n  ${problems.join("\n  ")}`);
      process.exit(1);
    }
    console.log("snapshot-impact: baseline ok");
    return;
  }
  const url = process.env.IMPACT_SOURCE_URL || "http://localhost:3005/impact";
  if (!allowDev && isDevHost(new URL(url).host)) {
    throw new Error(`${url} is a local dev backend; set IMPACT_SOURCE_URL to the production API, or pass --allow-dev for local work`);
  }
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
  const data = await res.json();
  const problems = validateSnapshot(data);
  if (problems.length) throw new Error(`refusing to write:\n  ${problems.join("\n  ")}`);
  // Only the origin is recorded: a local URL says "dev backend", a production one says where.
  const from = new URL(url).host;
  const out = stamp(data, from);
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  const tmp = `${SNAPSHOT_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`);
  renameSync(tmp, SNAPSHOT_PATH);
  console.log(`snapshot-impact: wrote ${SNAPSHOT_PATH} (generatedAt ${out.generatedAt}, from ${from})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`snapshot-impact: ${error.message}`);
    process.exit(1);
  });
}
