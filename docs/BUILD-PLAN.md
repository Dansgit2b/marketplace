# Starknet marketplace — full scope and build plan

Version 1.0 · 6 October 2026

**Start here.** This is the consolidated project plan. It joins the contract, indexer, API, existing frontend, OpenSea product benchmark, operations and migration into one delivery sequence. It supersedes earlier launch-boundary statements where they differ; supporting documents provide implementation detail and historical evidence.

Status: implementation in progress. Standalone Cairo settlement, the native Node indexer/API and retained-UI trading flows are implemented locally; integration and acceptance work is ongoing. No production deployment, independent audit, production backfill or staging soak is claimed. Track milestone completion here; supporting designs do not maintain competing status lists.

## 1. Product outcome

Build an OpenSea-quality NFT marketplace for the initial Starknet/Realms collection set: discover assets, understand the market, list and reprice inventory, buy/sweep, make and accept bids, manage orders, and follow trading activity.

Keep the current UI's visual design and reusable components. Extend it for the missing workflows. Build standalone Cairo settlement and an owned Node.js indexing/API backend. The new marketplace must operate without Torii, Dojo World storage, Cartridge-hosted market data or Arcade SDK trading logic.

OpenSea is the NFT product benchmark, not a claim of exhaustive feature parity. The concrete release checklist below defines completion.

## 2. Decisions and remaining choices

| Item | Plan |
| --- | --- |
| UI | Retain Next.js, existing visual system, routes and reusable components |
| Settlement | New standalone Cairo contract; direct storage and explicit events |
| Order creation | On-chain, confirmed by user |
| Core assets/actions | ERC-721 listings, token offers, atomic single-currency cart, confirmed by user |
| Indexing | Our own Node.js implementation; direct configurable Starknet RPC |
| Backend dependencies | Zero third-party runtime packages as the conservative interpretation of “no deps”; Node built-ins |
| OpenSea launch expansion | Include collection offers, bulk seller workflows, trader dashboard, search/analytics, trust tools and in-product notifications in this consolidated target plan |
| Collection offers | One-shot offers for any NFT in a specified collection; no partial fills. Implemented in the version-1 ABI |
| Data scope | Curated launch collection registry; operator-led onboarding |
| Backend storage | Implemented SQLite/local persistent storage with one writer per chain and off-host backups |
| Pricing | Confirmed fixed buyer debit, fees/royalties deducted from that total; no executor surcharge |
| Royalties | Confirmed snapshots for token-specific orders; bounded fill-time royalties for collection offers |
| Administration | Confirmed non-upgradeable contract, limited multisig administration, cancellation available while paused |
| Hosting | Portable deployment; provider, operator, capacity and budget still to select |

User confirmed inclusive buyer pricing, token-order royalty snapshots, capped fill-time collection royalties and a non-upgradeable contract with limited administration on 6 October 2026. The implementation caps protocol fees at 500 basis points; the production rate, receiver, administrator addresses and approved asset registry remain explicit deployment inputs. These are material decisions, not numbers to invent during deployment. The broader product target does not change the user's selection of on-chain orders or ERC-721-only launch.

## 3. Launch scope

| Workstream | Launch deliverables | Completion evidence |
| --- | --- | --- |
| Trading contracts | Listing, token offer, one-shot collection offer, cancellation, bounded bulk cancellation, fill, accept offer, atomic cart | Contract invariants, malicious-callback tests, fork tests and independent review |
| Seller tools | Inventory selection, bulk list, cancel, cancel-and-relist/reprice, fee/proceeds preview | Complete wallet-to-indexed-result flows |
| Buyer tools | Listing purchase, filter-aware sweep, cart, token/collection bid, funding/approval checks | Correct totals, usable bid selection and atomic transaction tests |
| Order management | My listings; offers made/received; active, expired, cancelled, filled and currently unavailable states | Ownership-aware account feeds, pagination and action tests |
| Discovery | Collection/NFT/address search; full-collection filtering/sorting; token details; existing game-specific traits | Search/filter fixtures, later-page matches and large-ID tests |
| Market information | Current floor/top executable bid by currency, recent sales, declared-period volume/counts, price/floor history | Defined metrics reconciled to fill events |
| Portfolio | Holdings, collection filters and purchased/sold activity | Balances reconcile and confirmed changes become visible |
| Notifications | In-product offer/sale/order-change inbox and unread state | Authenticated ownership, deduplication and reorg correction tests |
| Collection operations | Register/backfill/reconcile/publish; verified-address/name policy; metadata refresh | Operator onboarding rehearsal |
| Trust/content | Report submission, review queue, content visibility controls and decision history | Authorization tests and a documented operating policy |
| Assets | Owned metadata/image delivery, dynamic trait refresh and explicit failure states | Coverage report and stale/failure behavior |
| Operations | Metrics, alerts, RPC failover, backup/restore, replay and rollout | Recovery/load/soak evidence and named operator |
| Migration | New approvals/orders; clear separation from Arcade; bounded legacy cancellation/history decision | Rehearsed cutover with no unauthorized order recreation |

Preserve single-currency checkout and maximum 25 NFTs. Across approved currencies, do not compare raw amounts as if they share value. Portfolio and search cover indexed registered collections; arbitrary all-Starknet discovery is not implicitly included.

### Follow-up releases

Trait/criteria offers, private/reserved listings, watchlists and richer profiles, email/push notifications, portfolio NFT transfers, permissionless collection onboarding, ERC-1155/partial fills, signed gasless orders, auctions and bundles are outside this launch plan. Prioritize them by demonstrated demand.

Trait offers need a separate decision about fixed token-set membership versus live on-chain predicates, particularly for mutable game attributes. A backend trait match cannot authorize spending. Features that change immutable contract semantics may require another deployment; do not pretend they are merely frontend additions.

## 4. Architecture and ownership

```mermaid
flowchart LR
    UI[Existing UI plus trading workflows] --> API[Owned Node API]
    UI --> Wallet[Wallet adapter]
    Wallet --> Market[Standalone Cairo marketplace]
    RPC[Starknet RPC] --> Indexer[Node scanner and decoders]
    Indexer --> Journal[Raw journal and chain projections]
    Journal --> API
    Metadata[Metadata and asset worker] --> Journal
    AppData[Sessions notifications reports and verification] --> API
    API --> RPC
```

- **Contract:** authoritative order authorization, exact settlement, cancellation, pause and supported-asset policy. No backend trust for execution.
- **Indexer:** canonical events, ownership/approval projections, terminal order state, progress and recovery.
- **API:** filtering, summaries, account queries, consistent pagination/provenance and advisory preflight.
- **Application data:** sessions, notifications, reports and verification decisions. These cannot be regenerated from chain events and need separate backups/migrations.
- **Frontend:** user intent, wallet signing, clear totals/errors and transaction/index progress. It cannot silently mutate order terms.

Use a single backend codebase with separate writer, API and metadata processes. No required external queue or search service at launch. Preserve a clean product interface so later storage changes do not rewrite the UI. Cairo compiler/test tooling and proposed reviewed contract primitives are distinct from the zero-package Node runtime constraint.

## 5. Contract design to freeze at M0

Use `(maker, maker_nonce)` within a deployment, with full external identity including chain and marketplace address. Terms never mutate; repricing cancels and creates a new order. Each ERC-721 order fills once, quantity one.

Order kinds: `listing`, `token_offer`, `collection_offer`. Token ID is required for the first two and absent for the last; never overload a valid token ID as a wildcard. Collection-offer fill accepts one eligible NFT from the exact committed collection and consumes the order completely.

The buyer commits total debit `P`. Protocol fee `F` and royalty `R` are deducted: seller proceeds are `P - F - R`. No caller chooses an additional fee against another account. Rounding, recipient aliases, uint256 overflow and positive seller proceeds are explicit invariants.

For collection offers, commit collection, currency, total debit, expiry and maximum royalty amount. Resolve selected-token royalty at fill within that cap; the accepting seller passes minimum proceeds. This extension supersedes the token-known-at-creation assumption for that order kind only. Validate policy against supported NFT contracts before implementation.

Implemented entrypoints: create listing/token offer/collection offer; cancel one/many; buy one/many; accept token/collection offer; get order/config; bounded administration. Use existing account multicall for bulk creation and repricing first; add dedicated batch creation only if measurements justify it.

Events: initialization/configuration, complete order creation, cancellation, fill with exact economic allocations, trading switches, asset-policy changes and administrator transfer. They must reconstruct new-market state without an external orderbook or generic model engine.

Cross-reference [contract scope](./CONTRACT-SCOPE.md) for settlement guarantees and the token-specific/collection-offer confirmed royalty policies.

## 6. Backend deliverables

### Indexing

Bounded RPC event scanning, full continuation handling, receipt-derived event identity/order, pinned block/hash windows, raw journal, deterministic decoders, atomic block projections/checkpoints, per-stream progress, reorg undo/replay and schema-versioned rebuilds. Never report the fastest stream as proof every required collection is caught up.

NFT backfill starts at verified historical collection blocks. New trading history starts at our deployment. No legacy World decoder is a prerequisite for launching the new market.

### Public product API

Retain the base `/v1/chains/{chain}` interface. Provide collections, tokens, traits, orders/listings, collection offers, token/account activity, holdings, market configuration, batch order lookup, index status and checkout preflight. Add:

- Global collection/NFT/address search.
- Account order feeds filtered by made/received/listed and state.
- Collection statistics and time series by currency and declared interval.
- Best executable bid queries for a token, comparing seller proceeds when token and collection offers compete.
- Authenticated notification inbox/read state and report submission.
- Private operator interfaces for registry/onboarding, refresh, verification and content decisions.

Every candidate bid includes validation freshness. Incoming offers follow current NFT ownership. Unknown funding/approval is not a guaranteed executable offer. APIs return decimal strings for large values and stable, bounded, query-scoped cursors.

### Metadata and owned application data

Persist metadata jobs, URI/content versions and fetch status; bound unsafe destinations, redirects, sizes and retries. Failed images do not stop trade indexing. Dynamic game eligibility has its own freshness/authoritative-check policy.

Wallet-authenticated sessions use expiring, single-use, domain-bound challenges with independently verified signature/message encoding. Do not trust a client-supplied message hash or treat a public address lookup as authentication. Test supported wallet signature behavior before choosing the exact native implementation. Operator access uses separately managed credentials/roles.

Keep durable application data separate from replayable chain projections, whether in separate SQLite files or explicitly managed schemas. Notification generation is idempotent by canonical event and recipient. A reorg can invalidate an alert; unread state and user reports must not be erased by replay.

## 7. Frontend work while retaining the UI

| Surface | Changes |
| --- | --- |
| Home/discovery | Real indexed search, useful collection metrics and honest featured/trending labels |
| Collection | Full-dataset filters/sort, current listings and bids, collection-offer action, charts and sweep selection |
| Token | Exact total/proceeds, token and matching collection offers, history and safe acceptance |
| Portfolio/trader dashboard | Inventory, bulk actions, my listings, offers made/received and trade activity |
| Cart | One-currency selection, exact total, per-row failures, new `buy_many` calldata and limit checks |
| Notifications | Wallet-owned inbox, read state, links to actionable orders/tokens |
| Collection trust/reporting | Verified-address display, reporting entrypoint, restricted-content behavior |
| Ops | Real index/API progress, collection readiness and action-oriented operator diagnostics |
| SEO | Owned server-side reads and images with unavailable/stale fallbacks |

Persist submitted transaction identity. Distinguish wallet rejection, submission, acceptance/reversion and index reflection. Never invite duplicate submission because indexing is slow. Migrate persisted cart identities explicitly; invalidate incompatible old rows with an explanation.

## 8. Build sequence and gates

Roles below are responsibilities, not a claim that people have been assigned.

| Milestone | Concrete work | Depends on | Exit gate | Lead responsibility |
| --- | --- | --- | --- | --- |
| **M0 — freeze product/protocol contract** | Confirm fee/royalty/admin choices; collection-offer semantics; launch asset registry; ABI/events; expected accounting fixtures | Current plan | Reviewed interface, test matrix, dependencies and open decisions recorded | Product + Cairo |
| **M1 — reference settlement** | Test-first create/cancel/fill for listing, token offer and collection offer; explicit events; direct reads | M0 | Authorization, exact debit, expiry, pause cancellation, duplicate fill and callback tests pass | Cairo |
| **M2 — vertical slice** | One ERC-721, native RPC scanner/journal/projection, basic API and UI wallet adapter on devnet | M1 event fixtures | List → buy; offer → accept; cancel → reflected state; restart and replay agree with contract | Backend + frontend |
| **M3 — full indexing/data API** | All launch collection backfills; metadata; query/filter/holdings/account feeds; search; reorg recovery | M2 | Collection matrix and fixed-checkpoint reconciliation; no hosted reads | Backend |
| **M4 — cart and contract optimization** | `buy_many`; account bulk create/reprice/cancel; malicious asset cases; resource benchmarks | M1 | Atomic worst-case 25-item cart fits practical limits; no invariant regressions | Cairo |
| **M5 — complete trading product** | Seller/buyer dashboard, token and collection bids, sweep/cart, exact fee displays, new IDs and SEO | M2; final gate needs M3/M4 | Buyer/seller journeys pass with supported wallets, including failures | Frontend |
| **M6 — market/trust features** | Statistics/history, top executable bid, operator onboarding, authenticated inbox and reports | M3 + session design | Metrics reconcile; auth/content/notification acceptance tests pass | Backend + frontend + operator |
| **M7 — review and production readiness** | Independent contract review/fixes; fork tests; RPC/load/restore/failover; deployment configuration and class verification | M1/M4 interface frozen; final gate needs M3–M6 | Resolved review findings; green CI; rehearsed recovery; named operator | Cairo reviewer + platform |
| **M8 — migration and controlled launch** | Legacy inventory/cancel plan; Sepolia rehearsal; final classes/registry; new spender approvals; staged release and soak | M7 | All launch journeys work against real deployment; health within agreed thresholds | Release owner |

Critical path: M0 → M1 → M2 → validated event/API integration → completed product and contract review → M8. M3 and M4 can be scheduled concurrently after M2/M1 respectively; frontend can use fixed fixtures before backend completion. Independent review can start after the contract interface and implementation stabilize, but any material later changes need review coverage.

### First implementation batch

1. Create `contracts/marketplace` with pinned toolchain and native tests; establish approved dependency policy.
2. Commit machine-readable ABI/event fixtures and independent payment examples before UI integration.
3. Implement order creation/cancellation and direct getters test-first.
4. Implement one listing fill, then token/collection-offer acceptance with explicit payment bounds.
5. Add a minimal Node scanner and SQLite journal that decodes those events and survives duplicate input/restart.
6. Wire one existing token page to the new devnet flow and prove indexed convergence.

Do not begin by porting the old Torii infrastructure or implementing every API endpoint before the contract/event slice works.

### Implementation evidence — 6 October 2026

| Milestone | Current evidence | Remaining gate |
| --- | --- | --- |
| M0 | Confirmed pricing/royalty/admin defaults; version-1 ABI and reproducible class manifest checked in | Actual production fee/recipient/admin and final approved registry |
| M1 | Standalone Cairo implementation; 14 native tests including 256 accounting fuzz cases, authorization, royalty caps, pause/cancel, malicious reentry and late-cart rollback | Independent review and real launch-asset compatibility |
| M2 | Signed-account devnet listing/cart, token offer, collection offer and cancellation; native event decoder/index replay; direct preflight, metadata and wallet-signature verification | Supported browser-wallet rehearsal |
| M3 | Scanner, raw journal, per-source checkpoints, rewind, bounded metadata queue, filters/search/holdings/cursors; receipt-format and source-onboarding regressions | Full launch-registry historical backfill, fixed-checkpoint external reconciliation, dynamic game eligibility policies |
| M4 | 25-item account transaction succeeds on devnet; same-size repeated-fill comparison recorded | Mainnet-fork resource checks against actual launch assets |
| M5 | Retained UI wired to owned reads/writes; seller dashboard, offers, bulk actions, sweep, cart, transaction recovery, exact currency decimals; browser cart/portfolio smoke flows pass | Real wallet failure/recovery journeys on Sepolia |
| M6 | Statistics/floor history, bounded executable-bid evaluation, verified sessions, inbox, reports, moderation and operator refresh | Named moderation/operator policy and live operational rehearsal |
| M7 | Native backup/restore test, runtime dependency guard, pinned toolchain, CI jobs, Docker topology and runbook | Independent audit, representative HTTP/RPC load, production-size restore/failover, supported frontend wallet-library upgrade |
| M8 | No production deployment or legacy-order recreation performed | Sepolia rehearsal, migration/cancel decision, deployment inputs and seven-day soak |

Measured local evidence: signed devnet rehearsal indexed **55 orders and 54 NFTs**, then rewound/replayed order, ownership, floor and daily-stat projections identically. A 25-item native cart used **100,088,320 L2 gas units** versus **108,655,360** for 25 single fills in one account multicall (about 7.9% lower in these fixtures); both used 5,376 L1 data-gas units. These receipts include account execution, use test assets and are not a mainnet fee estimate.

A synthetic in-memory catalog with 10,000 NFTs and 2,000 listings initially exposed a 32.6-second query. Composite indexes reduced mixed-query p95 to **38.3 ms over 100 queries** on this machine. This is SQL timing, not the planned 50-requests/second HTTP or real-RPC capacity test. Scripts reproduce the measurements; local evidence is in ignored `.context/`.

Current validation: **500 frontend tests**, **32 native backend tests** (also passing from a temporary tree without `node_modules`), **14 Cairo tests** including 256 fuzz cases, and **4 browser smoke tests** pass. Frontend coverage is 70.6% statements/lines, above the unchanged 70% gate. Lint, strict typecheck, frozen-lockfile installation and production Next.js build pass. The optional screenshot-only test is skipped when no routes are requested; remote CI has not been run.

Production deployment is intentionally unconfigured. The remaining gates above are not completed by fixture tests, code review by the implementer, or a successful frontend build.

## 9. Test and optimization matrix

| Layer | Required checks |
| --- | --- |
| Contract | Maker authorization; terminal state; cancellation under pause; exact expiry; allowance/funds/ownership; exact payment; royalties; recipient aliases; reentrancy; false/reverting token calls |
| Collection offers | Correct collection, arbitrary valid token ID, one-shot consumption, royalty cap, seller minimum, token-specific royalty variation and concurrent attempts |
| Batch | 1/5/10/25 items, duplicate order/NFT rejection, one-currency bound, late failing item, overflow, full rollback |
| Indexer | Missing pages, provider failover, duplicate events, empty ranges, crash mid-block, differing stream heads, hash conflict, reorg, fresh replay |
| Product queries | Full-dataset filters/sorting, game-specific semantics, large IDs, precision, dynamic traits, pagination changes, funded versus nominal top bid |
| Application data | Wallet challenge replay/domain binding, access control, report abuse limits, notification deduplication/reorgs, backup preservation |
| UI | Complete workflows and failure states; no false success, duplicate transaction or cross-chain/cart identity confusion |
| Operations | Representative load, disk growth, RPC throttling/outage, asset failures, database restore and deployment rollback |

Measure Cairo storage writes, execution resources, calldata/events and external calls, including account/approval costs. Compare native cart settlement against repeated fills in account multicall. Keep uint256 token/payment precision. No gas savings are claimed before measurements.

Proposed initial operating targets: browse p95 under 500 ms; 25-row preflight p95 under 3 seconds; normal p95 relevant-stream lag no more than two accepted blocks; backups at most one hour old and recovery within two hours. Freshness also checks observation age. Validate targets at representative load and revise explicitly if the chosen topology cannot meet them.

## 10. Deployment and migration

Use distinct devnet, Sepolia/staging and mainnet configuration/state. New contracts need reproducible builds, verified class/address records and recorded administration/fee settings. Pin decoder and API versions to deployments.

Existing NFTs do not migrate. Existing marketplace approvals and orders do not automatically authorize the replacement. Users approve the new address and recreate intended orders. Inventory old active liquidity first; preserve a clearly labelled legacy read/cancel route where practical rather than mixing execution targets.

Roll out browse/holdings, then testnet trading, then new production listings/offers/fills under monitored release controls. A seven-day observation window is part of stabilization evidence, not a substitute for prelaunch review. Contract pause cannot prevent maker cancellation.

After orders exist on the new contract, rollback preserves their discoverability/cancellability and uses compatible UI/API versions. Never silently restore old settlement or resubmit user transactions.

## 11. Scheduling, cost and ownership

The earlier indexer-only/Torii estimates no longer apply. This includes a new financial contract, an independent indexer, broader product workflows and external review.

Time-box the initial interface/reference vertical-slice investigation to approximately five engineering days, reporting what is proved and what remains. Then estimate each milestone from measured contract test/compile costs, replay throughput, metadata volume and reusable frontend coverage. The time-box is not a promise that M0–M2 will all finish in five days.

Before scheduling mainnet, assign a Cairo lead, backend/indexing lead, frontend lead, independent reviewer and release/operator responsibility. People may hold multiple roles, but scheduling must account for that. Book external review availability early. No delivery date or monthly hosting figure is asserted without staffing, audit availability, workload and provider pricing.

Unresolved release inputs: actual production fee rate/recipient and administrator addresses; collection/currency inventory; RPC history limits; production host/budget/domain; backups and alert destinations; review provider; current legacy liquidity. None should be hidden inside a guessed completion date.

## 12. Definition of done

- A seller can bulk list, reprice/cancel and accept incoming token/collection offers with exact proceeds shown.
- A buyer can search/filter, inspect market information, buy/sweep, bid and manage offers with exact payment bounds.
- The contract independently rejects unauthorized, stale, double or overcharged fills; cart settlement is atomic.
- All new marketplace state rebuilds from public events and verified NFT sources; the UI/API makes no Torii/Arcade hosted-read dependency.
- Holdings and trade/offer state converge after accepted transactions, while rejected/reverted/pending-index outcomes remain distinct.
- Market metrics, account feeds, notifications, onboarding and reports work with correct ownership and provenance.
- Contract review, tests, load checks, restore/replay/failover and migration rehearsal have recorded passing evidence.
- Deployment identities and operator responsibilities are documented; cancellation and safe degradation remain available during incidents.

## 13. Supporting documents

- [Contract design](./CONTRACT-SCOPE.md): base ABI, settlement guarantees, tests and optimization candidates.
- [Backend design](./BACKEND-SCOPE.md): native Node indexing, storage, API, metadata and recovery details.
- [OpenSea coverage](./OPENSEA-COVERAGE.md): comparison and reasoning behind the broader product launch.
- [Domain glossary](../CONTEXT.md) and [architecture decision](./adr/0001-standalone-cairo-marketplace.md).
- [Existing-system assessment](./INDEXER-CURRENT-STATE-2026-10-06.md) and [contract findings](./CONTRACT-ASSESSMENT-2026-10-06.md): historical evidence, not current implementation instructions.

This master plan controls release scope and delivery status. Contract/backend documents provide detailed design; dated assessments and the OpenSea comparison preserve evidence and do not override the current plan.
