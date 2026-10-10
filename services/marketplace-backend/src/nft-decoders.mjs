// Versioned ERC-721 event decoders and reconciliation (issue #112).
// Decoders are explicit, deterministic adapters selected by the historical class interval that
// was active at the event's block (see classIntervals in nft-classify.mjs). Decoding never
// throws and never invents state: an event that does not fit the selected adapter is returned
// as a quarantine record that keeps the raw event and decoder provenance for later replay.
import { address, fromU256, uint } from "./domain.mjs";
import { selector } from "./starknet-keccak.mjs";

const ZERO = address(0);
const SEL = Object.fromEntries(
  [
    "Transfer",
    "Approval",
    "ApprovalForAll",
    "MetadataUpdate",
    "BatchMetadataUpdate",
  ].map((n) => [n, BigInt(selector(n))]),
);
const NAME_BY_SEL = new Map(Object.entries(SEL).map(([n, s]) => [s, n]));

// Field kinds: a = address, u = u256 (low, high), f = felt id, b = bool.
const field = (name, kind) => ({ name, kind });
const STD = {
  Transfer: [field("from", "a"), field("to", "a"), field("tokenId", "u")],
  Approval: [field("owner", "a"), field("approved", "a"), field("tokenId", "u")],
  ApprovalForAll: [
    field("owner", "a"),
    field("operator", "a"),
    field("approved", "b"),
  ],
  MetadataUpdate: [field("tokenId", "u")],
  BatchMetadataUpdate: [field("fromTokenId", "u"), field("toTokenId", "u")],
};
const keyed = (name, nKeys) => ({
  keys: STD[name].slice(0, nKeys),
  data: STD[name].slice(nKeys),
});
const dataOnly = (name) => ({ keys: [], data: STD[name] });

/**
 * Built-in adapters. `version` changes whenever the adapter's output for the same input could
 * change, so stored decodes can be replayed when an adapter is revised.
 */
export const ADAPTERS = {
  // OpenZeppelin cairo-contracts >= 0.8 (Cairo 1): indexed from/to/id, operator/owner keyed.
  "oz-cairo1-keyed": {
    version: 1,
    events: {
      Transfer: keyed("Transfer", 3),
      Approval: keyed("Approval", 3),
      ApprovalForAll: keyed("ApprovalForAll", 2),
      MetadataUpdate: keyed("MetadataUpdate", 0),
      BatchMetadataUpdate: keyed("BatchMetadataUpdate", 0),
    },
  },
  // Cairo 0 / early Cairo 1 contracts: only the selector is a key, all fields in data.
  "cairo0-data": {
    version: 1,
    events: Object.fromEntries(Object.keys(STD).map((n) => [n, dataOnly(n)])),
  },
  // Legacy contracts that emit a single-felt token id instead of a u256.
  "cairo0-felt-id": {
    version: 1,
    events: {
      Transfer: {
        keys: [],
        data: [field("from", "a"), field("to", "a"), field("tokenId", "f")],
      },
      Approval: {
        keys: [],
        data: [field("owner", "a"), field("approved", "a"), field("tokenId", "f")],
      },
      ApprovalForAll: dataOnly("ApprovalForAll"),
    },
  },
};

const width = (k) => (k === "u" ? 2 : 1);
const typeKind = (name, type) => {
  const t = String(type);
  if (/u256|Uint256/.test(t)) return "u";
  if (/ContractAddress/.test(t)) return "a";
  if (/bool/.test(t)) return "b";
  if (/token_?id/i.test(name)) return "f";
  return "a";
};
const canonicalName = (event, i) => STD[event]?.[i]?.name;

/**
 * Derive a deterministic adapter from ABI event layouts (analyzeClass().eventLayouts). Field
 * order is taken from the ABI, so camelCase/snake_case member names do not matter. The
 * adapter id embeds the layout fingerprint so two classes with identical layouts share it.
 */
export function adapterFromLayouts(eventLayouts) {
  const events = {};
  for (const l of eventLayouts ?? []) {
    if (!STD[l.name]) continue;
    const all = [...l.keys, ...l.data];
    if (all.length !== STD[l.name].length) continue;
    const mk = (m, i) => field(canonicalName(l.name, i), typeKind(m.name, m.type));
    events[l.name] = {
      keys: l.keys.map((m, i) => mk(m, i)),
      data: l.data.map((m, i) => mk(m, l.keys.length + i)),
      path: l.path,
    };
  }
  if (!events.Transfer) return null;
  const fp = Object.entries(events)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([n, e]) =>
        `${n}:${e.keys.map((f) => f.kind).join("")}|${e.data.map((f) => f.kind).join("")}`,
    )
    .join(";");
  return { id: `abi:${fp}`, version: 1, events };
}

/** Pick the interval active at `block`; its `decoder` (id or adapter object) wins. */
export function selectAdapter(intervals, block) {
  const b = Number(block);
  const hit = (intervals ?? []).find(
    (iv) => b >= iv.fromBlock && (iv.toBlock == null || b <= iv.toBlock),
  );
  if (!hit) return { adapter: null, interval: null };
  const d = hit.decoder;
  const adapter =
    typeof d === "string"
      ? ADAPTERS[d] && { id: d, ...ADAPTERS[d] }
      : (d ?? null);
  return { adapter, interval: hit };
}

function readFields(fields, values) {
  const out = {};
  let i = 0;
  for (const f of fields) {
    if (i + width(f.kind) > values.length) throw new Error("truncated");
    if (f.kind === "u") out[f.name] = fromU256(values[i], values[i + 1]);
    else if (f.kind === "f") out[f.name] = BigInt(uint(values[i], 252)).toString();
    else if (f.kind === "b") {
      const v = BigInt(uint(values[i], 252));
      if (v > 1n) throw new Error("bool out of range");
      out[f.name] = v === 1n;
    } else out[f.name] = address(values[i]);
    i += width(f.kind);
  }
  if (i !== values.length) throw new Error("unexpected extra fields");
  return out;
}

const TYPES = {
  Transfer: "transfer",
  Approval: "approval",
  ApprovalForAll: "operator_approval",
  MetadataUpdate: "metadata_update",
  BatchMetadataUpdate: "metadata_update",
};

/**
 * Decode one raw Starknet event emitted by a collection.
 * @param raw {from_address, keys, data, block_number, transaction_hash?, event_index?}
 * @param ctx {intervals, componentSelectors?: string[]} componentSelectors are outer enum
 *   selectors (non-flat OZ components emit keys [component, variant, ...]).
 * @returns {status:"decoded", event, provenance} | {status:"ignored", ...} |
 *   {status:"quarantined", reason, raw, provenance}
 */
export function decodeNftEvent(raw, ctx) {
  const { adapter, interval } = selectAdapter(ctx?.intervals, raw?.block_number);
  const provenance = {
    adapter: adapter?.id ?? null,
    adapterVersion: adapter?.version ?? null,
    classHash: interval?.classHash ?? null,
    block: raw?.block_number ?? null,
  };
  const quarantine = (reason) => ({ status: "quarantined", reason, raw, provenance });
  if (!raw || !Array.isArray(raw.keys) || !raw.keys.length || !Array.isArray(raw.data))
    return quarantine("invalid_envelope");
  if (!adapter) return quarantine("no_decoder_for_block");
  let keys = raw.keys;
  let nested = false;
  try {
    const outer = (ctx.componentSelectors ?? []).map((s) => BigInt(s));
    if (keys.length > 1 && outer.includes(BigInt(keys[0]))) {
      keys = keys.slice(1);
      nested = true;
    }
    const name = NAME_BY_SEL.get(BigInt(keys[0]));
    if (!name) return { status: "ignored", reason: "non_nft_selector", provenance };
    const layout = adapter.events[name];
    if (!layout) return quarantine(`adapter_lacks_${name}`);
    const fromKeys = readFields(layout.keys, keys.slice(1));
    const fromData = readFields(layout.data, raw.data);
    const event = {
      type: TYPES[name],
      collection: address(raw.from_address),
      ...fromKeys,
      ...fromData,
    };
    if (name === "Transfer")
      event.kind =
        event.from === ZERO ? "mint" : event.to === ZERO ? "burn" : "transfer";
    if (name === "BatchMetadataUpdate" && BigInt(event.fromTokenId) > BigInt(event.toTokenId))
      return quarantine("batch_range_inverted");
    return { status: "decoded", event, provenance: { ...provenance, nested } };
  } catch (e) {
    return quarantine(`layout_mismatch: ${e.message}`);
  }
}

/** Decode a batch; any quarantined event marks the whole collection quarantined. */
export function decodeCollectionEvents(events, ctx) {
  const decoded = [];
  const quarantined = [];
  for (const raw of events) {
    const r = decodeNftEvent(raw, ctx);
    if (r.status === "decoded") decoded.push(r);
    else if (r.status === "quarantined") quarantined.push(r);
  }
  return {
    collectionStatus: quarantined.length ? "quarantined" : "ok",
    decoded: quarantined.length ? [] : decoded,
    quarantined,
  };
}

/** Fold decoded transfers into owners/balances (no assumption about id sequencing). */
export function projectOwnership(decoded) {
  const owners = new Map();
  const balances = new Map();
  const bump = (a, d) => balances.set(a, (balances.get(a) ?? 0n) + d);
  for (const { event: e } of decoded) {
    if (e.type !== "transfer") continue;
    if (e.from !== ZERO) bump(e.from, -1n);
    if (e.to !== ZERO) {
      bump(e.to, 1n);
      owners.set(e.tokenId, e.to);
    } else owners.delete(e.tokenId);
  }
  return { owners, balances };
}

const call = async (rpc, contract, entry, calldata, block) =>
  rpc.call("starknet_call", [
    { contract_address: contract, entry_point_selector: selector(entry), calldata },
    { block_number: Number(block) },
  ]);
const split = (id) => {
  const n = BigInt(id);
  return [`0x${(n & ((1n << 128n) - 1n)).toString(16)}`, `0x${(n >> 128n).toString(16)}`];
};

/**
 * Reconcile a projection against chain state pinned at `block`. Uses the class's method aliases
 * (owner_of/ownerOf, balance_of/balanceOf, total_supply/totalSupply) and only checks what the
 * contract exposes. Coverage is explicit: "full" only when every projected token and holder was
 * verified and supply evidence agreed; otherwise "partial" with reasons.
 */
export async function reconcile(rpc, contract, projection, { block, methodAliases = {}, idEncoding = "u256", sample } = {}) {
  const result = { block, checkedTokens: 0, checkedHolders: 0, mismatches: [], gaps: [] };
  const ownerFn = methodAliases.owner_of;
  const balFn = methodAliases.balance_of;
  const supplyFn = methodAliases.total_supply;
  const tokens = [...projection.owners.entries()].slice(0, sample ?? Infinity);
  if (sample != null && sample < projection.owners.size) result.gaps.push("token_sample");
  if (!ownerFn) result.gaps.push("no_owner_of");
  else
    for (const [id, owner] of tokens) {
      const args = idEncoding === "felt" ? [`0x${BigInt(id).toString(16)}`] : split(id);
      try {
        const res = await call(rpc, contract, ownerFn, args, block);
        const onchain = address(res?.[0] ?? 0);
        result.checkedTokens++;
        if (onchain !== owner) result.mismatches.push({ tokenId: id, projected: owner, onchain });
      } catch (e) {
        result.gaps.push(`owner_of_failed:${id}`);
      }
    }
  if (!balFn) result.gaps.push("no_balance_of");
  else
    for (const [holder, bal] of projection.balances) {
      if (bal === 0n) continue;
      try {
        const res = await call(rpc, contract, balFn, [holder], block);
        const onchain = fromU256(res?.[0] ?? 0, res?.[1] ?? 0);
        result.checkedHolders++;
        if (BigInt(onchain) !== bal)
          result.mismatches.push({ holder, projected: bal.toString(), onchain });
      } catch {
        result.gaps.push(`balance_of_failed:${holder}`);
      }
    }
  if (!supplyFn) result.gaps.push("no_supply_evidence");
  else {
    try {
      const res = await call(rpc, contract, supplyFn, [], block);
      const onchain = BigInt(fromU256(res?.[0] ?? 0, res?.[1] ?? 0));
      result.supply = onchain.toString();
      if (onchain !== BigInt(projection.owners.size))
        result.mismatches.push({ supply: onchain.toString(), projected: String(projection.owners.size) });
    } catch {
      result.gaps.push("total_supply_failed");
    }
  }
  result.coverage = result.mismatches.length
    ? "mismatch"
    : result.gaps.length
      ? "partial"
      : "full";
  return result;
}
