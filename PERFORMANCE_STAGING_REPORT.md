# POS Staging Performance Report

Date: 2026-08-25  
Supabase project: `tlknhjkbapqshykfrlbs`  
Baseline run: `231b4ab3`  
Retest run: `a967b876`

## Performance Summary

Core staging API operations generally met the one-second target. Login, category/table loading, reports, Realtime, and normal product pages were typically 0.18–0.55 seconds. A 100-item order completed in 0.61–1.19 seconds across the two runs. Realtime order delivery was 45–205ms after the HTTP response.

The 500-product menu path was measurably improved by loading remaining pages concurrently. The KDS query now filters inactive child records in PostgreSQL/PostgREST instead of transferring and filtering them in the Edge Function.

Performance is not fully certified because concurrent runs had intermittent multi-second outliers, browser profiling was unavailable, and no deployed Cloudflare staging URL/configuration exists in this checkout.

## Test Environment

- Client location: Asia/Kuala_Lumpur
- Runtime date: 2026-08-25
- Frontend: Vite staging mode on `127.0.0.1:5174`
- Backend: hosted Supabase staging project
- Workload driver: Node fetch clients plus 10 independent Supabase Auth sessions
- Browser connection: unavailable due browser runtime initialization failure
- Cloudflare: not testable; no `wrangler.jsonc`, deploy script, or deployed URL was available

Targets used:

- Common API/UI action: under 500ms where feasible
- Typical API query: under 1 second
- Critical order submit: under 2 seconds normally
- Realtime update: within 1–2 seconds

## Dataset Size

- 500 temporary products
- 10 temporary categories
- 10 authenticated manager sessions
- 101 active test orders at peak
- Order sizes: 1, 10, 30, and 100 items
- Report query-plan test: 10,000 synthetic paid orders/items/payments/receipts in a rolled-back local transaction
- All staging fixtures and users were deleted; independent residue checks returned zero rows

## Measurements

All values are end-to-end staging HTTP timings. Multi-sample values show median and p95. Payloads are uncompressed response body sizes.

| Operation | Baseline | Retest | Payload / notes |
|---|---:|---:|---|
| Login | 176ms / 235ms | 177ms / 209ms | 1.96KB |
| Categories | 363ms / 475ms | 374ms / 511ms | 1.58KB |
| Products, 50 | 519ms / 820ms | 479ms / 511ms | 16KB |
| Products, 100 | 511ms / 604ms | 434ms / 552ms | 32KB |
| Products, 200 | 528ms / 3,467ms | 453ms / 497ms | 64KB; baseline contained one outlier |
| Category containing 50 products | 429ms / 513ms | 423ms / 655ms | 16KB |
| Full 500-product catalogue, sequential | 1,438ms / 1,637ms | 1,363ms / 1,427ms | 160KB, three requests |
| Full 500-product catalogue, optimized | — | 941ms / 1,106ms | 160KB, first page then two parallel requests |
| Tables | 334ms / 399ms | 346ms / 469ms | 3.4KB |
| KDS, 10 test orders | 420ms / 430ms | 511ms / 513ms | 121KB including pre-existing active staging rows |
| KDS, 30 test orders | 469ms / 581ms | 429ms / 573ms | 157KB |
| KDS, 100 test orders | 512ms / 856ms | 551ms / 573ms | 282KB |
| Two concurrent users | 438ms / 512ms | 513ms / 561ms | Two 100-product responses |
| Five concurrent users | 542ms / 543ms | 499ms median; 7,796ms outlier | Five 100-product responses |
| Ten concurrent users | 1,462ms / 4,269ms | 581ms / 600ms | Ten 100-product responses |
| Daily report | 374ms / 508ms | 399ms / 460ms | 3KB |
| Product sales report | 386ms / 512ms | 410ms / 513ms | 425B |

Single order-submit samples varied between runs:

| Items | Baseline | Retest |
|---:|---:|---:|
| 1 | 564ms | 2,629ms |
| 10 | 512ms | 2,796ms |
| 30 | 447ms | 511ms |
| 100 | 1,190ms | 614ms |

The 1/10-item retest calls occurred immediately after an Edge Function deployment and are consistent with cold-start/platform variance rather than item-count scaling: the later 30/100-item calls were faster. More sustained samples are required before accepting the under-two-second submit target at p95.

Realtime measurements:

| Metric | Baseline | Retest |
|---|---:|---:|
| Order request | 540ms | 447ms |
| Event from request start | 745ms | 492ms |
| Event after response | 205ms | 45ms |

## Slowest Operations

1. Intermittent concurrent-user calls: 4.27s for ten users in baseline and 7.80s for five users in retest.
2. Cold/deployment-adjacent order submissions: 2.63–2.80s.
3. Sequential 500-product catalogue: 1.36–1.44s median before optimization.
4. KDS payload: 282KB at 100 test orders and currently unpaginated.

## Database Findings

- Product/category, order/status, order-item/status, payment/order, paid-at, receipt/issued-at, and kitchen-batch indexes already exist.
- Local `EXPLAIN (ANALYZE, BUFFERS)` on small operational tables completed product and kitchen predicates in 0.04ms and 0.09ms. Sequential scans were appropriate for the tiny tables.
- With 10,000 synthetic paid transactions, the daily aggregation executed in 7.2ms and product aggregation in 8.0ms.
- PostgreSQL correctly selected sequential scans/hash joins for month-wide aggregation covering almost the entire dataset. Adding indexes would increase insert/update and storage cost without improving that workload.
- No index was added without evidence.

## RLS Findings

- Frequent policies call stable, security-definer helpers (`current_pos_role` and `can_read_pos_order`). Security remains enforced for all tested requests.
- The Edge Functions perform an authenticated user lookup and active-profile lookup before business queries. This adds fixed network/query overhead but should not be removed or replaced with unverified JWT decoding.
- RLS was not weakened for performance.

## Frontend Findings

- Production build: 373KB main JS (101.7KB gzip), 272KB shared constants chunk (77KB gzip), 64.9KB CSS (11.5KB gzip), plus small lazy screen chunks.
- Product images use native `loading="lazy"`.
- Product cache deduplicates in-flight refreshes and retains data for two minutes.
- Category/search filtering uses `useMemo`, avoiding network calls on category switching.
- A 500-product catalogue still renders all matching cards; browser frame/render profiling was unavailable, so virtualization was not added blindly.
- Browser repeated-render and long-session memory measurements remain unverified.

## Realtime Findings

- Authenticated event delivery was 45–205ms after the create-order response.
- Subscription functions return cleanup callbacks that remove their Supabase channels; React effect cleanup invokes them.
- Prior disconnect/reconnect testing recovered database truth without duplicate transactions.
- Browser sleep/wake, tab throttling, and extended memory observation remain unverified.

## Improvements Applied

### Parallel catalogue page loading

- Before: 1,363ms median for 500 products during the comparison run
- After: 941ms median
- Improvement: 30.9%
- Cost: up to two additional simultaneous requests for a 500-row catalogue; the existing two-minute cache limits repetition

### Server-side KDS child filtering

- Before: 856ms p95 for the 100-order workload
- After: 573ms p95
- Improvement: 33.1% p95 in these runs
- Payload: unchanged at ~282KB because every generated batch/item was active; the change prevents completed/voided child history from being transferred in mixed real-world orders

The updated `orders` Edge Function was deployed to staging. The frontend catalogue optimization is present in the repository but cannot be deployed without the missing Cloudflare project configuration.

## Network and Cloudflare Findings

- The staging Supabase measurements include real WAN/TLS latency.
- Socket disconnect/reconnect behavior has been verified, but deliberate bandwidth/latency throttling was unavailable without browser tooling.
- Local Vite returned the HTML in ~2ms, but this is not a Cloudflare measurement.
- Static caching, Brotli delivery, CDN TTFB, and production HTTPS headers could not be verified without a deployed staging URL.
- Authenticated Supabase API responses must not be cached at Cloudflare.

## Remaining Risks and Production Blockers

- Intermittent 2.6–7.8s platform/API outliers need a longer soak test with at least 30 samples per operation and controlled request pacing.
- KDS and unpaid-order endpoints are unpaginated; 100 active test orders already produced a 282KB response.
- Rendering 500 product cards and long-session browser memory behavior have not been profiled.
- Cloudflare caching/compression/HTTPS behavior is unknown because deployment configuration is absent.
- The frontend optimization has not been published to a Cloudflare staging site.

## Final Decision

**PERFORMANCE NOT READY**

Database execution and typical API/Realtime timings are healthy, but full performance acceptance is blocked by intermittent multi-second concurrency/cold-start outliers, unbounded KDS growth, and the missing browser/Cloudflare staging verification.
