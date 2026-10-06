import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.mjs";
import { createApi } from "../src/api.mjs";
import { address } from "../src/domain.mjs";
test("HTTP routes serve owned data, enforce authentication/origin, and bound bodies", async (t) => {
  const s = new Store(":memory:");
  s.put("collection", address("9"), { address: address("9"), name: "Realms" });
  const api = createApi({
    store: s,
    config: {
      chain: "LOCAL",
      chainId: "0x1",
      marketplace: null,
      collections: [{ address: "9" }],
      currencies: [],
      origin: "http://localhost:3000",
    },
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
    s.close();
  });
  const root = `http://127.0.0.1:${api.address().port}`;
  let r = await fetch(root + "/v1/chains/LOCAL/collections");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data[0].name, "Realms");
  r = await fetch(root + "/v1/chains/LOCAL/notifications");
  assert.equal(r.status, 401);
  r = await fetch(root + "/v1/chains/SN_MAIN/collections");
  assert.equal(r.status, 400);
  r = await fetch(root + "/v1/chains/LOCAL/reports", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  r = await fetch(root + "/v1/chains/LOCAL/orders/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orders: Array(26).fill({ maker: "1", nonce: "1" }),
    }),
  });
  assert.equal(r.status, 400);
});
test("wallet RPC relay permits required wallet calls and rejects unrelated methods", async (t) => {
  const s = new Store(":memory:");
  const calls = [];
  const api = createApi({
    store: s,
    config: { chain: "LOCAL", chainId: "0x1", collections: [], currencies: [] },
    rpc: {
      call: async (method, params) => {
        calls.push({ method, params });
        return "0x1";
      },
    },
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
    s.close();
  });
  const url = `http://127.0.0.1:${api.address().port}/rpc`;
  const post = (method) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method, params: [] }),
    });
  const allowed = await (await post("starknet_chainId")).json();
  assert.equal(allowed.result, "0x1");
  assert.equal(allowed.id, 3);
  const denied = await (await post("devnet_mint")).json();
  assert.equal(denied.error.code, -32601);
  assert.equal(calls.length, 1);
});
