import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.mjs";
import { scanOnce } from "../src/indexer.mjs";
import { SELECTORS } from "../src/decode.mjs";
import { address } from "../src/domain.mjs";
test("scanner consumes all event pages, pins range and commits empty-source coverage", async () => {
  const store = new Store(":memory:");
  let pages = 0;
  const evt = {
    from_address: "0x9",
    keys: [SELECTORS.Transfer],
    data: ["0", "0x2", "1", "0"],
  };
  const rpc = {
    call: async (method, p) => {
      if (method === "starknet_chainId") return "0x1";
      if (method === "starknet_getEvents") {
        pages++;
        assert.equal(p.filter.to_block.block_number, 2);
        return pages === 1
          ? { events: [], continuation_token: "next" }
          : {
              events: [
                {
                  ...evt,
                  block_number: 1,
                  block_hash: "0x65",
                  transaction_hash: "0xaa",
                },
              ],
            };
      }
      const n = p.block_id === "latest" ? 2 : p.block_id.block_number;
      const block = {
        block_number: n,
        block_hash: `0x${(n + 100).toString(16)}`,
        parent_hash: `0x${(n + 99).toString(16)}`,
        timestamp: 100 + n,
        status: "ACCEPTED_ON_L2",
        transactions: [],
      };
      if (method === "starknet_getBlockWithReceipts")
        block.transactions = [
          {
            transaction: { type: "INVOKE" },
            receipt: {
              transaction_hash: "0xaa",
              execution_status: "SUCCEEDED",
              events: [evt],
            },
          },
        ];
      return block;
    },
  };
  await scanOnce(
    store,
    rpc,
    {
      chain: "LOCAL",
      chainId: "0x1",
      marketplace: null,
      collections: [{ address: "0x9", startBlock: 1 }],
    },
    { window: 2 },
  );
  assert.equal(pages, 2);
  assert.equal(store.head().number, 2);
  assert.equal(store.list("token")[0].owner, address("0x2"));
  assert.equal(store.get("progress", address("0x9")).block, 2);
  store.close();
});
test("adding a historical source fails closed until its backfill is rebuilt", async () => {
  const store = new Store(":memory:");
  store.applyBlock({
    number: 10,
    hash: "0x6e",
    parentHash: "0x6d",
    timestamp: 110,
    events: [],
    sources: [address("0x9")],
  });
  const rpc = {
    call: async (method) =>
      method === "starknet_chainId"
        ? "0x1"
        : {
            block_number: 10,
            block_hash: "0x6e",
            parent_hash: "0x6d",
            timestamp: 110,
            status: "ACCEPTED_ON_L2",
            transactions: [],
          },
  };
  await assert.rejects(
    scanOnce(store, rpc, {
      chain: "LOCAL",
      chainId: "0x1",
      marketplace: null,
      collections: [
        { address: "0x9", startBlock: 1 },
        { address: "0xa", startBlock: 2 },
      ],
    }),
    { code: "SOURCE_BACKFILL_REQUIRED" },
  );
  assert.equal(store.get("progress", address("0xa")), null);
  store.close();
});
test("a database cannot be reused for another chain or marketplace deployment", async () => {
  const store = new Store(":memory:");
  const rpc = {
    call: async (method) =>
      method === "starknet_chainId"
        ? "0x1"
        : {
            block_number: 0,
            block_hash: "0x1",
            parent_hash: "0x0",
            timestamp: 1,
            status: "ACCEPTED_ON_L2",
          },
  };
  store.db
    .prepare("INSERT INTO meta VALUES('identity',?)")
    .run(JSON.stringify({ chainId: "0x2", marketplace: null }));
  await assert.rejects(
    scanOnce(store, rpc, {
      chain: "LOCAL",
      chainId: "0x1",
      marketplace: null,
      collections: [{ address: "9", startBlock: 1 }],
    }),
    { code: "DATABASE_IDENTITY_MISMATCH" },
  );
  store.close();
});
