# Operating the owned marketplace

## Deployment boundaries

Use one chain database per chain and marketplace deployment. Keep application state in its adjacent `.app` file and assets in the configured directory. Run one indexing worker and one metadata worker per database. The API supports 1–8 Node workers with `MARKETPLACE_API_WORKERS`; keep embedded indexing off when using multiple API workers. SQLite WAL permits readers during a writer transaction; this topology is not high availability.

Deploy the non-upgradeable marketplace with explicit administrator, protocol fee basis points (0–500) and fee recipient. Enable each reviewed ERC-721 collection and standard ERC-20 currency through administrator transactions. Record the source/compiler/class hashes, deployment block and administration addresses in the registry. Production addresses are deliberately unset. An immutable contract change requires a new deployment and an explicit migration.

Build without the `fixtures` feature for release. Keep private keys out of the backend: it verifies account signatures and may relay already-signed wallet invokes through `/rpc`, but never constructs signatures or holds custody. Operator authorization is separate from wallet sessions.

## Release procedure

For on-chain declaration/deployment and multisig configuration, use the
[mainnet deployment sequence](MAINNET-DEPLOYMENT.md). Its generated registry and
environment templates feed the service steps below. It does not modify live
configuration or automatically activate trading.

1. Resolve the build plan's open launch gates and record the intended Git commit,
   chain, contract address/class/start block, administrator/fee recipient/rate,
   reviewed collection/currency registry, public origin, RPC endpoints and operator.
   The checked-in registry has no deployed marketplace; it cannot enable live trading.
2. Run `pnpm install --frozen-lockfile`, `pnpm release:audit`, then `pnpm release:verify` on the release
   checkout. This command builds for local fixtures; step 4 rebuilds for the actual
   deployment. Run remote CI as well. Record results against the exact commit.
   SDK packages must build before Next.js; HTTPS development follows the same rule.
3. Create local `.env.backend` and `.env.frontend` from the matching examples.
   Use HTTPS for the public origin and an independent operator secret. Set
   `NEXT_PUBLIC_SITE_URL` to that origin. Keep frontend/backend chain and marketplace
   addresses identical. Never put operator credentials or private RPC credentials
   in `NEXT_PUBLIC_*` variables. The default same-origin API proxy avoids exposing
   the private backend URL to browser code.
4. Build and start the frontend with those explicit environment files:

   ```sh
   pnpm sdk:build
   node --env-file=.env.frontend node_modules/next/dist/bin/next build
   node --env-file=.env.frontend node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
   ```

   `NEXT_PUBLIC_*` values and the API rewrite destination are fixed during the build;
   build separately for each environment. `.env.frontend` is not a Next.js automatic
   filename. Ensure a local `.env.local` cannot supply unintended omitted values in
   a release checkout. The current font build needs Google font download access.
5. For the backend, use the native commands in README or
   `docker compose -f compose.backend.yml up -d --build`. The latter requires
   `.env.backend` and a working Docker daemon. Keep embedded indexing disabled:
   Compose already starts separate index and metadata workers. The shared volume
   holds chain/app databases and assets. Backend port 3100 is bound to loopback;
   terminate frontend HTTPS at the chosen reverse proxy/platform. The native
   frontend must reach `MARKETPLACE_API_URL`; another container would need the
   backend's service hostname rather than its own localhost.
6. Complete onboarding/backfill and external reconciliation below. Check
   `/health/live` for process liveness and `/health/ready` for trading readiness.
   A 503 while syncing, paused or undeployed is expected; a healthy container is
   not sufficient evidence to enable trading. Rehearse wallet signatures,
   accepted/indexed recovery, operator authorization, backups and rollback on
   Sepolia before mainnet exposure.

Deploying the frontend alone is a browse/demo release, not a marketplace launch.
Do not copy fixture databases, test assets or devnet addresses into a deployment.
`.dockerignore` excludes local environments, data, keys, caches and test artifacts
from container build contexts. Archive investigation output under `.context/archive`;
keep active server logs and `.context/toolchain` available to their running tools.

## Collection onboarding

1. Verify contract address/class, ERC-721 interface, transfer/approval layouts, token URI encoding, royalties, dynamic metadata and any game eligibility rules at a fixed checkpoint. Determine the earliest required historical block.
2. Add the collection to a reviewed copy of the registry. Backfill a **new chain database** with the complete registry using `indexer-cli.mjs backfill`; preserve the production `.app` database separately. Starting a new historical source against an already advanced database fails with `SOURCE_BACKFILL_REQUIRED`.
3. Run `indexer-cli.mjs reconcile` on fresh and repeated replays at the same stop block. Compare token owners and order state against direct RPC reads, and inspect metadata coverage. The reconcile digest is a projection comparison, not a substitute for direct chain reconciliation.
4. Stop the writer, take a paired backup, switch the chain database and registry together, reconnect the existing application database, and restart. Publish only after all required source progress is current. Keep the previous chain database for rollback.
5. Set verified status through the operator endpoint only after address/name review. Verification and moderation decisions live in the durable application database and survive chain replay.

The checked-in mainnet registry is an onboarding candidate list, not evidence that all game-specific contracts have passed this process. Mutating game eligibility needs a collection-specific authoritative policy before enabling those assets for trading.

## Recovery and backups

```sh
node --env-file=.env.backend services/marketplace-backend/src/backup.mjs /backups/market-2026-10-06.sqlite
```

This creates chain and `.app` backups using SQLite's backup API. Ship both plus the registry and asset directory to off-host storage. Set a scheduled backup outside the application and alert when its age exceeds the agreed RPO. The two database copies are individually consistent, not a cross-database atomic snapshot; notification reconciliation repairs the derived outbox while preserving read state.

For restore, stop all three processes, preserve the current files, restore both database files and assets, run `PRAGMA integrity_check` on each, then restart the index worker before admitting traffic. Reconcile canonical chain state, notification state and source freshness. The native backup test exercises a small fixture restore; production-size restore time is still a launch gate.

For a rewind, stop the index worker and run `indexer-cli.mjs rewind HEIGHT`, then resume scanning. Rewind preserves raw journal evidence, session/report data and notification read state, invalidates orphaned alerts, and bumps pagination generation. A full rebuild uses a new chain file and preserves the `.app` file. Never delete application data as part of a chain rebuild.

## Health and incidents

- `/health/live`: process liveness.
- `/health/ready`: trading readiness (503 while undeployed, stale, paused, unverified or syncing).
- `/v1/chains/{chain}/indexer/status`: source progress, observed head/time, lag, generation and blocking reasons.
- Worker stdout/stderr: structured progress/error records. Alert on stopped workers, lag, stale observations, identity errors, failed backups, disk pressure and metadata failures.

Set `MARKETPLACE_RPC_FALLBACK_URL` for transport failover. Event pagination is pinned to one endpoint within each range; an outage retries the range rather than mixing continuation tokens across providers. Unknown marketplace events, inconsistent receipts, class mismatches and missing historical source coverage fail closed.

Retain browse availability during bounded staleness; wallet writes remain disabled. Accepted transactions retain their hash if receipt/index checks fail, so users can check the saved transaction instead of submitting a duplicate. Paused markets still allow contract cancellation.

## Content and authentication

Set an independent random `MARKETPLACE_OPERATOR_TOKEN`; do not reuse a wallet key. `/operator` holds that credential only in component memory. Reports and moderation changes are authenticated and audited. Hidden collection content is removed from public discovery/detail. A content decision does not alter on-chain ownership or forcibly cancel orders; publish an operating/appeals policy before launch.

Wallet sessions use single-use, five-minute, origin-bound SNIP-12 challenges and on-chain `is_valid_signature` verification. Cookies are HttpOnly, SameSite=Strict and Secure on HTTPS. The devnet account verification test passed; Controller, Ready and Braavos still need real supported-wallet rehearsal. The retained Starknet React/Controller stack uses Starknet.js 8; upgrading it to a supported release is a launch-readiness task separate from the dependency-free backend.

## Dependency audit — 7 October 2026

Production dependency audit initially reported 2 critical, 41 high, 50 moderate
and 4 low findings. Next.js and its ESLint configuration were updated from
16.1.6 to 16.3.6; compatible-range transitive updates were applied. The resulting
registry report is **0 critical, 19 high, 33 moderate and 1 low**. Advisory counts
are not proof that every affected code path is exposed by this application.

The remaining high findings involve `axios`, `defu`, `form-data`, `h3` and `ws`
under Controller/WalletConnect and related wallet packages. They need supported
upstream upgrades or reviewed replacements, followed by real-wallet rehearsal.
No forced cross-range overrides or advisory suppression were added.
`pnpm release:audit` currently fails and blocks deployment. Re-run it against the
final lockfile; a passing fixture verification does not override this gate.

The Next.js update covers the reported
[AVIF optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)
and [Windows server advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36).
Docker Compose syntax validates against the example environment, but a Docker
daemon did not respond during this local preparation. Image build/container boot
and production inputs remain unverified. No infrastructure was deployed.

## Release gates

Independent contract audit, mainnet-fork collection/currency compatibility, mainnet-fork resource checks (the local account 25-item benchmark passes), supported-wallet end-to-end trading, full historical backfill/reconciliation, representative load and recovery drills, named operator/hosting budget, Sepolia rehearsal and seven-day soak remain required. Do not infer production readiness from demo UI screenshots or unit tests.
