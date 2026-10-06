# Biblio Marketplace

A Starknet ERC-721 marketplace with standalone Cairo settlement, an owned Node.js indexer/API, and the retained Next.js UI. Trading uses on-chain listings, token offers, one-shot collection offers and atomic carts of up to 25 NFTs in one currency.

The backend uses Node built-ins only. It has no Torii, Dojo or Arcade dependency. Cartridge remains an optional wallet connector; it supplies no marketplace data. Wallet RPC defaults to the owned backend relay, with a configurable direct RPC override.

## Run locally

Use Node **22.22.0** and pnpm **10.8.1**.

```sh
pnpm install --frozen-lockfile
pnpm backend:demo
```

In another terminal:

```sh
NEXT_PUBLIC_MARKETPLACE_CHAIN_ID=SN_MAIN pnpm dev
```

Open `http://localhost:3000`. Demo assets and orders are illustrative; all wallet trading is disabled. Collection discovery, filters, token details, cart previews, search and the disconnected dashboard work without production credentials.

For a real deployment, use [.env.backend.example](.env.backend.example) and [.env.frontend.example](.env.frontend.example). Supply the RPC, verified marketplace address/class/start block, registry and frontend address. Keep existing local settings and secrets private. Run API, index and metadata workers separately:

```sh
node --env-file=.env.backend services/marketplace-backend/src/server.mjs
node --env-file=.env.backend services/marketplace-backend/src/worker.mjs index
node --env-file=.env.backend services/marketplace-backend/src/worker.mjs metadata
```

The API listens on `127.0.0.1:3100`. Next.js proxies `/api/marketplace` to it. A portable backend container topology is in [compose.backend.yml](compose.backend.yml).

## Contract development

Pin Scarb **2.15.1**, Starknet Foundry **0.57.0**, and devnet **0.10.0**. The test wrapper rejects older Foundry versions with different caught-revert behavior.

```sh
pnpm contracts:build
pnpm contracts:test
```

For the signed-account integration rehearsal, start devnet on port 5050 with three funded accounts, build the explicit test-asset feature, then run:

```sh
cd contracts/marketplace
scarb build --features fixtures
cd ../..
pnpm contracts:devnet
```

The script only accepts localhost devnet URLs. It deploys test assets, trades, checks live preflight and wallet authentication, and verifies rewind/replay. Evidence is written to ignored `.context/devnet-evidence.json`. Test assets have unrestricted minting and failure switches and are excluded from normal builds. Never deploy those assets publicly.

## Verification and scope

```sh
pnpm backend:test
pnpm contracts:test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Browser tests use the built frontend and a local fixture backend. [The build plan](docs/BUILD-PLAN.md) is the authoritative feature list and acceptance tracker. Local tests and devnet transactions do not replace independent contract review, launch-collection compatibility checks, supported-wallet rehearsal, production backfill or a staging soak.

- [Contract design](docs/CONTRACT-SCOPE.md), [backend design](docs/BACKEND-SCOPE.md), [domain glossary](CONTEXT.md).
- [Operations and recovery](docs/OPERATIONS.md), [API contract](services/marketplace-backend/openapi.json).
- [Agent instructions](AGENTS.md).
- Historical [indexer assessment](docs/INDEXER-CURRENT-STATE-2026-10-06.md), [Arcade assessment](docs/CONTRACT-ASSESSMENT-2026-10-06.md) and [OpenSea comparison](docs/OPENSEA-COVERAGE.md).
