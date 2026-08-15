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
    NO_TRACK,
    placeOnTrack,
    type FeedbackPacket,
    type GuestTrack,
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
  let track = $state<GuestTrack>(NO_TRACK);

  $effect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/jobs?kind=user-feedback&limit=100');
        if (!r.ok) return;
        const body = await r.json();
        const rows: FeedbackPacket[] = Array.isArray(body) ? body : (body.data ?? []);
        if (!cancelled) track = placeOnTrack(rows);
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
      <h1 class="shop-hero-title">Come in — you're at Algedonic Ales</h1>
      <p class="shop-hero-lede">
        We're a small brewery that runs itself in the open. Pull up a
        stool: everything you can see here — the beer, the orders, the
        people doing the work — is the real thing, not a demo of one.
      </p>
    </div>
  </header>

  <!-- Orientation, in the order a visitor actually needs it: what can
       I do, what happens if I do it, what am I looking at. The first
       cut of this page opened with an instrument panel, which answers
       none of those (David: "looks too much like an employee view"). -->
  <section class="guest-tour">
    <article class="guest-tour-card">
      <h3 class="guest-tour-h">Drink the beer</h3>
      <p>
        Order direct from the brewery below. The availability on each
        card is read live off the warehouse — if it says two left,
        there are two left.
      </p>
    </article>
    <article class="guest-tour-card">
      <h3 class="guest-tour-h">Follow it through</h3>
      <p>
        Your order becomes a job, and that job moves through the same
        brewhouse, warehouse and delivery run a wholesale keg order
        does. You can watch it go.
      </p>
    </article>
    <article class="guest-tour-card">
      <h3 class="guest-tour-h">Tell us something</h3>
      <p>
        The feedback control in the bar at the top is not a suggestion
        box. What you send opens a job in our IT department — and the
        track below is where those jobs are right now.
      </p>
    </article>
  </section>

  {#if track.any}
    <!-- Job cards standing at the stop they have reached (David: "job
         cards moving through stations instead of just a static list").
         Live data or nothing: these are `user-feedback` Jobs on the
         same protocol every other piece of work here runs on, so
         nothing is rounded and the ones we turned down still show. -->
    <section class="guest-track-wrap">
      <h2 class="guest-track-title">What guests told us, and where it got to</h2>
      <div class="guest-track" role="list">
        {#each track.stops as stop (stop.key)}
          <div class="guest-stop" role="listitem">
            <div class="guest-stop-head">
              <span class="guest-stop-dot" class:has-cards={stop.cards.length > 0}></span>
              <span class="guest-stop-label">{stop.label}</span>
            </div>
            <div class="guest-stop-cards">
              {#each stop.cards as card (card.id)}
                <article class="guest-card">
                  <span class="guest-card-about">{card.about}</span>
                  <span class="guest-card-when">{card.when}</span>
                </article>
              {:else}
                <p class="guest-stop-empty">—</p>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <p class="guest-track-foot">
        {track.received} pieces of feedback so far, {track.done} of them
        already built and shipped{#if track.setAside > 0}, {track.setAside}
        we looked at and didn't take up{/if}. Every card is a job packet
        with an owner and an audit trail — the same machinery that moves
        a keg.
      </p>
    </section>
  {/if}

  <h2 class="guest-shop-title">On tap right now</h2>
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
  /* A visitor is not an operator. The greeting and the tour read as
     prose at a comfortable measure; only the track keeps a hint of the
     instrument idiom, because the track IS an instrument — it just has
     to be legible to someone who has never seen a station before. */
  .shop-hero-lede {
    font-size: 16px;
    line-height: 1.65;
    max-width: 62ch;
    margin: 8px 0 0;
  }
  .guest-tour {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin: 0 0 28px;
  }
  .guest-tour-card {
    border: 1px solid var(--hairline, #2A3138);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .guest-tour-h {
    font-size: 15px;
    margin: 0 0 6px;
  }
  .guest-tour-card p {
    margin: 0;
    line-height: 1.6;
    font-size: 14px;
    color: var(--fog, #E8ECEF);
  }

  .guest-track-wrap {
    margin: 0 0 28px;
  }
  .guest-track-title {
    font-size: 15px;
    margin: 0 0 14px;
  }
  /* Stops sit left-to-right so the eye reads motion. It scrolls
     sideways inside its own box rather than pushing the page wide —
     five stops fit most screens, and a phone gets a swipe. */
  .guest-track {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(150px, 1fr);
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 6px;
  }
  .guest-stop-head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--hairline, #2A3138);
    margin-bottom: 10px;
  }
  /* Lit only where something is standing. An all-lit track would say
     "busy everywhere", which is rarely true and always noticed. */
  .guest-stop-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--hairline, #2A3138);
    flex: 0 0 auto;
  }
  .guest-stop-dot.has-cards {
    background: var(--signal, #29C7B0);
  }
  .guest-stop-label {
    font-size: 12px;
    color: var(--fog, #E8ECEF);
    line-height: 1.3;
  }
  .guest-stop-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .guest-card {
    border: 1px solid var(--hairline, #2A3138);
    border-left: 2px solid var(--signal, #29C7B0);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .guest-card-about {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .guest-card-when {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--static, #7A838C);
  }
  .guest-stop-empty {
    color: var(--static, #7A838C);
    margin: 0;
    font-size: 13px;
  }
  .guest-track-foot {
    color: var(--static, #7A838C);
    font-size: 13px;
    line-height: 1.65;
    margin: 14px 0 0;
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
