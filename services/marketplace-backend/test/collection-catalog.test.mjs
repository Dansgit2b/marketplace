import { test } from "node:test";
import assert from "node:assert/strict";
import { address } from "../src/domain.mjs";
import {
  collectionKey,
  collectionRecord,
  sourceCoverage,
  sourceReadiness,
} from "../src/collection-catalog.mjs";

const source = { chainId: "0x1", address: "9" };
const now = 100000;
const rpc = { head: 12, observedAt: now, identityVerified: true };
const coverage = (patch = {}) =>
  sourceCoverage({
    ...source,
    startBlock: 2,
    block: 12,
    hash: "0xc",
    observedAt: now,
    replayGeneration: 1,
    ...patch,
  });
const ready = (record, options = {}) =>
  sourceReadiness([{ ...source, requiredStartBlock: 2 }], [record], {
    rpc,
    now,
    generation: 1,
    canonicalHashes: { 12: "0xc" },
    ...options,
  });

test("catalog identities normalize addresses and remain chain-specific", () => {
  assert.equal(collectionKey("0x01", "0x09"), collectionKey("1", "9"));
  assert.notEqual(collectionKey("1", "9"), collectionKey("2", "9"));
  const record = collectionRecord(source);
  assert.equal(record.address, address("9"));
  assert.equal(record.state, "unknown");
  assert.equal(record.standard, null);
  assert.equal(record.deployment, null);
  assert.equal(record.decoderVersion, null);
  assert.equal(record.replayGeneration, 1);
  for (const state of [
    "unknown",
    "candidate",
    "syncing",
    "indexed",
    "unsupported",
    "failed",
  ])
    assert.equal(collectionRecord({ ...source, state }).state, state);
  assert.throws(() => collectionRecord({ ...source, state: "verified" }));
  for (const field of ["visible", "verified", "tradable"])
    assert.throws(
      () => collectionRecord({ ...source, [field]: true }),
      /policy/i,
    );
});

test("catalog retains deployment, historical classes, uncertainty and decoder provenance", () => {
  const position = {
    block: 2,
    hash: "0x02",
    transactionIndex: 0,
    eventIndex: null,
  };
  const record = collectionRecord({
    ...source,
    state: "candidate",
    standard: "ERC721",
    deployment: position,
    classHistory: [
      {
        classHash: "0xabc",
        from: position,
        to: null,
        decoderVersion: "erc721-v1",
      },
    ],
    classification: {
      evidence: [{ method: "supports_interface", result: true }],
      uncertainty: ["proxy implementation unknown"],
    },
    decoderVersion: "erc721-v1",
  });
  assert.equal(record.deployment.hash, "0x2");
  assert.equal(record.classHistory[0].from.transactionIndex, 0);
  assert.equal(record.classHistory[0].decoderVersion, "erc721-v1");
  assert.deepEqual(record.classification.uncertainty, [
    "proxy implementation unknown",
  ]);
  assert.throws(() =>
    collectionRecord({ ...source, deployment: { block: -1, hash: "0x1" } }),
  );
  assert.throws(() => collectionRecord({ ...source, standard: "ERC20" }));
});

test("coverage validates paired checkpoints, bounded gaps and replay generations", () => {
  assert.equal(coverage().hash, "0xc");
  assert.throws(() => coverage({ block: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => coverage({ hash: null }));
  assert.throws(() =>
    coverage({ hash: ((1n << 251n) + 17n * (1n << 192n) + 1n).toString() }),
  );
  assert.throws(() => coverage({ startBlock: 13 }));
  assert.throws(() => coverage({ replayGeneration: 0 }));
  assert.throws(() =>
    coverage({ gaps: [{ from: 8, to: 7, reason: "history unavailable" }] }),
  );
  assert.throws(() =>
    coverage({ gaps: Array(101).fill({ from: 1, to: 1, reason: "missing" }) }),
  );
});

test("readiness uses only requested sources and never the fastest unrelated source", () => {
  const good = coverage();
  const unrelated = sourceCoverage({ chainId: "0x1", address: "10" });
  const status = sourceReadiness(
    [{ ...source, requiredStartBlock: 2 }],
    [good, unrelated],
    { rpc, now, generation: 1, canonicalHashes: { 12: "0xc" } },
  );
  assert.equal(status.ready, true);
  assert.equal(status.sources.length, 1);
  assert.equal(ready(null).ready, false);
  assert.ok(
    ready(coverage({ block: 8, hash: "0x8" }), {
      canonicalHashes: { 8: "0x8" },
    }).reasons.includes("INDEX_STALE"),
  );
});

test("gaps, unknown history, wrong generations/hashes and stale observations block readiness", () => {
  const cases = [
    [coverage({ startBlock: 3 }), "SOURCE_BACKFILL_REQUIRED"],
    [coverage({ startBlock: null }), "SOURCE_BACKFILL_REQUIRED"],
    [
      coverage({
        gaps: [{ from: 5, to: 5, reason: "RPC history unavailable" }],
      }),
      "HISTORY_GAP",
    ],
    [coverage({ replayGeneration: 2 }), "GENERATION_MISMATCH"],
    [coverage({ hash: "0xb" }), "CHECKPOINT_UNVERIFIED"],
    [coverage({ observedAt: 1 }), "SOURCE_STALE"],
  ];
  for (const [record, reason] of cases) {
    const status = ready(record);
    assert.equal(status.ready, false);
    assert.ok(status.reasons.includes(reason), reason);
  }
  assert.ok(
    ready(coverage(), { canonicalHashes: {} }).reasons.includes(
      "CHECKPOINT_UNVERIFIED",
    ),
  );
  assert.ok(
    ready(coverage(), {
      rpc: { ...rpc, identityVerified: false },
    }).reasons.includes("IDENTITY_UNVERIFIED"),
  );
  assert.ok(
    ready(coverage(), { rpc: { ...rpc, observedAt: 1 } }).reasons.includes(
      "HEAD_STALE",
    ),
  );
  assert.equal(
    sourceReadiness([], [], { rpc, now, generation: 1 }).ready,
    false,
  );
});
