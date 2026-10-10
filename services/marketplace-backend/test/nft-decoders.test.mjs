import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTERS,
  adapterFromLayouts,
  decodeNftEvent,
  decodeCollectionEvents,
  projectOwnership,
  reconcile,
  selectAdapter,
} from "../src/nft-decoders.mjs";
import { analyzeClass, classIntervals } from "../src/nft-classify.mjs";
import { selector } from "../src/starknet-keccak.mjs";

const C = "0x123";
const A = "0xa1", B = "0xb2";
const pad = (x) => `0x${BigInt(x).toString(16).padStart(64, "0")}`;
const T = selector("Transfer");
const big = (1n << 200n) + 7n; // needs both u256 limbs
const lo = `0x${(big & ((1n << 128n) - 1n)).toString(16)}`;
const hi = `0x${(big >> 128n).toString(16)}`;
const iv = (decoder, fromBlock = 0, toBlock = null) => ({ fromBlock, toBlock, classHash: "0xc", decoder });

test("keyed (OZ Cairo 1) transfer keeps full u256 precision and labels mints", () => {
  const r = decodeNftEvent(
    { from_address: C, keys: [T, "0x0", A, lo, hi], data: [], block_number: 10 },
    { intervals: [iv("oz-cairo1-keyed")] },
  );
  assert.equal(r.status, "decoded");
  assert.equal(r.event.tokenId, big.toString());
  assert.equal(r.event.kind, "mint");
  assert.equal(r.event.to, pad(A));
  assert.deepEqual(r.provenance.adapter, "oz-cairo1-keyed");
});

test("data layout (Cairo 0) and felt-id legacy adapters", () => {
  const d = decodeNftEvent(
    { from_address: C, keys: [T], data: [A, "0x0", "0x5", "0x0"], block_number: 1 },
    { intervals: [iv("cairo0-data")] },
  );
  assert.equal(d.event.kind, "burn");
  assert.equal(d.event.tokenId, "5");
  const f = decodeNftEvent(
    { from_address: C, keys: [T], data: [A, B, "0x9"], block_number: 1 },
    { intervals: [iv("cairo0-felt-id")] },
  );
  assert.equal(f.event.tokenId, "9");
  assert.equal(f.event.kind, "transfer");
});

test("nested component selector is unwrapped", () => {
  const outer = selector("ERC721Event");
  const r = decodeNftEvent(
    { from_address: C, keys: [outer, selector("ApprovalForAll"), A, B], data: ["0x1"], block_number: 3 },
    { intervals: [iv("oz-cairo1-keyed")], componentSelectors: [outer] },
  );
  assert.equal(r.status, "decoded");
  assert.equal(r.event.approved, true);
  assert.equal(r.provenance.nested, true);
});

test("historical adapter change: same contract decodes by block interval", () => {
  const intervals = [iv("cairo0-data", 0, 99), iv("oz-cairo1-keyed", 100)];
  const old = decodeNftEvent({ from_address: C, keys: [T], data: [A, B, "0x1", "0x0"], block_number: 50 }, { intervals });
  const neu = decodeNftEvent({ from_address: C, keys: [T, A, B, "0x1", "0x0"], data: [], block_number: 150 }, { intervals });
  assert.equal(old.provenance.adapter, "cairo0-data");
  assert.equal(neu.provenance.adapter, "oz-cairo1-keyed");
  assert.equal(old.event.tokenId, neu.event.tokenId);
  // An old-layout event after the upgrade is quarantined, not guessed.
  const wrong = decodeNftEvent({ from_address: C, keys: [T], data: [A, B, "0x1", "0x0"], block_number: 150 }, { intervals });
  assert.equal(wrong.status, "quarantined");
  assert.match(wrong.reason, /layout_mismatch/);
  assert.deepEqual(wrong.raw.data, [A, B, "0x1", "0x0"]);
});

test("malformed events quarantine the collection; unknown selectors are ignored", () => {
  const ctx = { intervals: [iv("oz-cairo1-keyed")] };
  assert.equal(decodeNftEvent({ from_address: C, keys: [T, A], data: [], block_number: 1 }, ctx).status, "quarantined");
  assert.equal(decodeNftEvent({ from_address: C, keys: [], data: [] }, ctx).reason, "invalid_envelope");
  assert.equal(decodeNftEvent({ from_address: C, keys: [T, A, B, "0x1", "0x0"], data: [], block_number: 1 }, { intervals: [] }).reason, "no_decoder_for_block");
  assert.equal(decodeNftEvent({ from_address: C, keys: [selector("Foo")], data: [], block_number: 1 }, ctx).status, "ignored");
  const bad = decodeNftEvent({ from_address: C, keys: [selector("ApprovalForAll"), A, B], data: ["0x2"], block_number: 1 }, ctx);
  assert.equal(bad.status, "quarantined");
  const batch = decodeCollectionEvents(
    [
      { from_address: C, keys: [T, "0x0", A, "0x1", "0x0"], data: [], block_number: 1 },
      { from_address: C, keys: [T, A], data: [], block_number: 2 },
    ],
    ctx,
  );
  assert.equal(batch.collectionStatus, "quarantined");
  assert.equal(batch.decoded.length, 0);
});

test("ERC-4906 metadata updates, inverted batch range rejected", () => {
  const ctx = { intervals: [iv("oz-cairo1-keyed")] };
  const ok = decodeNftEvent({ from_address: C, keys: [selector("BatchMetadataUpdate")], data: ["0x1", "0x0", "0x9", "0x0"], block_number: 1 }, ctx);
  assert.equal(ok.event.toTokenId, "9");
  const inv = decodeNftEvent({ from_address: C, keys: [selector("BatchMetadataUpdate")], data: ["0x9", "0x0", "0x1", "0x0"], block_number: 1 }, ctx);
  assert.equal(inv.reason, "batch_range_inverted");
});

test("adapter derived from ABI layouts, camelCase members, plugs into classIntervals", () => {
  const abi = [
    { type: "event", kind: "struct", name: "x::Transfer", members: [
      { name: "from", type: "core::starknet::contract_address::ContractAddress", kind: "key" },
      { name: "to", type: "core::starknet::contract_address::ContractAddress", kind: "key" },
      { name: "tokenId", type: "core::integer::u256", kind: "data" } ] },
  ];
  const info = analyzeClass({ sierra_program: [], abi });
  const adapter = adapterFromLayouts(info.eventLayouts);
  assert.equal(adapter.id, "abi:Transfer:aa|u");
  const intervals = classIntervals([{ block: 5, classHash: "0xc", standard: "erc721" }]).map((i) => ({ ...i, decoder: adapter }));
  assert.equal(selectAdapter(intervals, 4).adapter, null);
  const r = decodeNftEvent({ from_address: C, keys: [T, A, B], data: ["0x2", "0x0"], block_number: 6 }, { intervals });
  assert.equal(r.event.tokenId, "2");
  assert.ok(Object.keys(ADAPTERS).length >= 3);
});

test("reconcile: pinned owner/balance checks, explicit partial coverage without supply", async () => {
  const ctx = { intervals: [iv("oz-cairo1-keyed")] };
  const evs = [
    { from_address: C, keys: [T, "0x0", A, "0x1", "0x0"], data: [], block_number: 1 },
    { from_address: C, keys: [T, "0x0", A, "0x7", "0x0"], data: [], block_number: 2 },
    { from_address: C, keys: [T, A, B, "0x7", "0x0"], data: [], block_number: 3 },
  ];
  const proj = projectOwnership(decodeCollectionEvents(evs, ctx).decoded);
  assert.equal(proj.owners.get("7"), pad(B));
  const calls = [];
  const sel = (n) => BigInt(selector(n));
  const rpc = {
    async call(_m, [req, blk]) {
      calls.push(blk);
      const s = BigInt(req.entry_point_selector);
      if (s === sel("ownerOf")) return [BigInt(req.calldata[0]) === 1n ? A : B];
      if (s === sel("balanceOf")) return ["0x1", "0x0"];
      throw new Error("no");
    },
  };
  const r = await reconcile(rpc, C, proj, { block: 3, methodAliases: { owner_of: "ownerOf", balance_of: "balanceOf" } });
  assert.equal(r.mismatches.length, 0);
  assert.equal(r.coverage, "partial");
  assert.ok(r.gaps.includes("no_supply_evidence"));
  assert.ok(calls.every((b) => b.block_number === 3));
  const bad = await reconcile({ async call() { return [B]; } }, C, proj, { block: 3, methodAliases: { owner_of: "owner_of" } });
  assert.equal(bad.coverage, "mismatch");
});
