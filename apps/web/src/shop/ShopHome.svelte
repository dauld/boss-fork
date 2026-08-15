<script lang="ts">
  // Brewery storefront — direct-to-consumer beer catalog at /shop.
  //
  // Catalog metadata (name / price / package / tasting notes) lives
  // in apps/web/src/shop/brewery-products.ts as a static module.
  // Inventory STATE (on-hand per SKU) reads from the live
  // /api/inventory/items endpoint so the storefront tracks the same
  // numbers the warehouse + ops surfaces see.
  //
  // /shop is a personal/everyone surface in the three-axis IA
  // (alongside My Day + Inbox), not a tenant-gated tier —
  // any employee or guest can browse. Checkout opens a Job (Work
  // axis) so the order becomes operational state the same way a
  // wholesale-keg-order would.

  import { href, navigate } from '../router';
  import {
    BREWERY_PRODUCTS,
    type BreweryProduct,
    packageLabel,
    priceLabel,
  } from './brewery-products';
  import {
    NO_FLOW,
    summariseFeedback,
    type FeedbackPacket,
    type GuestFlowSummary,
  } from './guestFlow';

  type InventoryRow = Readonly<{
    part_sku: string;
    on_hand: number;
    allocated: number;
  }>;

  let stock = $state<Map<string, number>>(new Map());

  $effect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/inventory/items');
        if (!r.ok) return;
        const body = (await r.json()) as InventoryRow[] | { data: InventoryRow[] };
        const rows = Array.isArray(body) ? body : (body.data ?? []);
        if (cancelled) return;
        const m = new Map<string, number>();
        for (const row of rows) {
          if (row.part_sku.startsWith('FP-')) {
            m.set(
              row.part_sku,
              Math.max(0, (row.on_hand ?? 0) - (row.allocated ?? 0)),
            );
          }
        }
        stock = m;
      } catch {
        // Silent — render the catalog with "—" availability rather
        // than blocking the page on a transient inventory blip.
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  // The feedback guests have sent, and where each piece actually got
  // to. Guest-safe: /api/jobs applies the same read scope at the door
  // that every other surface gets, so a session that may not see
  // packets simply renders no panel rather than an error — the
  // storefront below is what most visitors came for.
  let flow = $state<GuestFlowSummary>(NO_FLOW);

  $effect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/jobs?kind=user-feedback&limit=100');
        if (!r.ok) return;
        const body = await r.json();
        const rows: FeedbackPacket[] = Array.isArray(body) ? body : (body.data ?? []);
        if (!cancelled) flow = summariseFeedback(rows);
      } catch {
        // Same posture as the inventory read: a transient blip costs
        // the panel, never the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  function availability(sku: string): { label: string; tone: 'in' | 'low' | 'out' | 'unknown' } {
    if (!stock.has(sku)) return { label: 'check availability', tone: 'unknown' };
    const n = stock.get(sku)!;
    if (n <= 0) return { label: 'sold out', tone: 'out' };
    if (n <= 6) return { label: `only ${n} left`, tone: 'low' };
    return { label: `${n} in stock`, tone: 'in' };
  }
</script>

<div class="catalog theme-exec">
  <header class="shop-hero">
    <div class="shop-hero-inner">
      <h1 class="shop-hero-title">Welcome to Algedonic Ales</h1>
      <p class="shop-hero-sub">
        A working brewery, and a working example. Every order, batch
        and delivery here is modelled in BOSS — so the stock numbers
        below are not a mock-up, they come straight off the warehouse
        projection. What you see is what's in the cooler right now.
      </p>
      <p class="shop-hero-sub">
        As a guest you can browse and order the beer, follow an order
        through the brewery, and — using the feedback control in the
        bar at the top — tell us what you think. That last one is the
        interesting part: your feedback becomes a real job in the real
        IT department, and you can watch where it goes.
      </p>
    </div>
  </header>

  {#if flow.received > 0}
    <!-- The claim this panel makes is unusual, so it is made from live
         data or not at all: these are `user-feedback` Jobs moving
         through the same stations, protocols and trains as every other
         piece of work in the system. Nothing here is rounded, and the
         ones that were declined say so. -->
    <section class="guest-flow">
      <h2 class="guest-flow-title">Guest feedback, in the works</h2>
      <div class="guest-flow-stats">
        <div class="guest-stat">
          <span class="guest-stat-n">{flow.received}</span>
          <span class="guest-stat-l">received</span>
        </div>
        <div class="guest-stat">
          <span class="guest-stat-n">{flow.done}</span>
          <span class="guest-stat-l">acted on</span>
        </div>
        <div class="guest-stat">
          <span class="guest-stat-n">{flow.inFlight}</span>
          <span class="guest-stat-l">still moving</span>
        </div>
      </div>
      <ul class="guest-flow-list">
        {#each flow.recent as item (item.id)}
          <li class="guest-flow-row">
            <span class="guest-flow-about">{item.about}</span>
            <span class="guest-flow-stage" class:is-done={item.finished}>{item.stage}</span>
            <span class="guest-flow-when">{item.opened_on}</span>
          </li>
        {/each}
      </ul>
      <p class="guest-flow-foot">
        Each one is a job packet with an owner, a protocol and an audit
        trail — the same machinery that moves a keg order.
      </p>
    </section>
  {/if}

  <h2 class="guest-shop-title">From the brewery</h2>
  <section class="shop-grid">
    {#each BREWERY_PRODUCTS as p (p.sku)}
      {@const to = href(`/ux/shop/${encodeURIComponent(p.sku)}`)}
      {@const avail = availability(p.sku)}
      {@const isLimited = p.available_until !== null}
      <article class="shop-card brewery-card">
        <button
          type="button"
          class="shop-card-area"
          onclick={() => navigate(to)}
          aria-label={`View details for ${p.brand} (${packageLabel(p.package)})`}
        >
          <div class="shop-card-image brewery-image">
            <span class="shop-card-category">{p.style}</span>
            {#if isLimited}
              <span class="shop-card-limited">Limited</span>
            {/if}
          </div>
          <div class="shop-card-body">
            <h3 class="shop-card-title">{p.brand}</h3>
            <p class="shop-card-tagline">{p.tagline}</p>
            <div class="shop-card-specs">
              <span class="chip chip-muted">{p.abv_pct}% ABV</span>
              <span class="chip chip-muted">{p.ibu} IBU</span>
              <span class="chip chip-muted">{packageLabel(p.package)}</span>
            </div>
            <div class="shop-card-pricing">
              <div class="shop-card-price">
                <span class="shop-card-price-value">{priceLabel(p.unit_price_cents)}</span>
              </div>
              <div class="shop-card-avail shop-card-avail-{avail.tone}">
                {avail.label}
              </div>
            </div>
          </div>
        </button>
        <a
          href={to}
          onclick={(e) => e.stopPropagation()}
          class="shop-card-cta"
        >
          View details
        </a>
      </article>
    {/each}
  </section>
</div>

<style>
  /* The feedback panel is instrument text, not marketing: mono for the
     numbers and stages so it reads as a live board rather than a
     testimonial wall. Same idiom as the yard. */
  .guest-flow {
    border: 1px solid var(--hairline, #2A3138);
    border-radius: 8px;
    padding: 16px 18px;
    margin: 0 0 24px;
  }
  .guest-flow-title {
    font-size: 15px;
    margin: 0 0 12px;
  }
  .guest-flow-stats {
    display: flex;
    gap: 28px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .guest-stat {
    display: flex;
    flex-direction: column;
  }
  .guest-stat-n {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 26px;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .guest-stat-l {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: var(--ls-nav, 0.14em);
    text-transform: uppercase;
    color: var(--static, #7A838C);
    margin-top: 2px;
  }
  .guest-flow-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .guest-flow-row {
    display: flex;
    gap: 12px;
    align-items: baseline;
    padding: 6px 0;
    border-bottom: 1px solid var(--hairline, #2A3138);
  }
  .guest-flow-row:last-child {
    border-bottom: none;
  }
  .guest-flow-about {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .guest-flow-stage {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: var(--ls-label, 0.1em);
    text-transform: uppercase;
    white-space: nowrap;
  }
  /* Finished reads quieter than moving: the panel is about work in
     flight, and a wall of green ticks would say the opposite. */
  .guest-flow-stage.is-done {
    color: var(--static, #7A838C);
  }
  .guest-flow-when {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--static, #7A838C);
    white-space: nowrap;
  }
  .guest-flow-foot {
    color: var(--static, #7A838C);
    font-size: 13px;
    line-height: 1.6;
    margin: 12px 0 0;
    max-width: 70ch;
  }
  .guest-shop-title {
    font-size: 15px;
    margin: 0 0 12px;
  }
  .brewery-image {
    background: linear-gradient(135deg, #c2410c 0%, #7c2d12 100%);
    color: rgba(255, 255, 255, 0.92);
    padding: 18px 16px;
    min-height: 90px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    position: relative;
  }
  .shop-card-area {
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    width: 100%;
    cursor: pointer;
    display: block;
    color: inherit;
    font: inherit;
  }
  .shop-card-limited {
    background: rgba(0, 0, 0, 0.35);
    color: #fef3c7;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 600;
  }
  .shop-card-avail {
    font-size: 13px;
    font-weight: 500;
  }
  .shop-card-avail-in { color: #16a34a; }
  .shop-card-avail-low { color: #ca8a04; }
  .shop-card-avail-out { color: #dc2626; }
  .shop-card-avail-unknown { color: #78716c; }
</style>
