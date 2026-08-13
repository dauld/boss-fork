# The three layers

**Status**: in-review — this is intended as the living reading frame
everything else is measured against, and becomes `living` once its
two open questions are settled.
**Origin**: David, 2026-08-13 (verbatim): *"The network is the
substrate, the fat protocols dictate the current operating model, the
actors run it."*
**Supersedes as the primary frame**:
[human-powered-state-machine.md](./human-powered-state-machine.md),
which is now a **lens** over this rather than the foundation.

---

## The statement

**The network is the substrate. The fat protocols dictate the current
operating model. The actors run it.**

Three layers, each replaceable without disturbing the others. That
separation is the whole point: it is what lets a company change how
it works without rebuilding what it works *on*.

## 1. The network is the substrate

The bottom layer knows nothing about breweries, invoices, or trains.
It knows:

- **Packets** — jobs. An immutable envelope, a fixed compatible
  protocol set at creation, and a payload. Packets do not mutate into
  other packets; crossing fabrics is **translation**, a new packet
  admitted with a `translated_from` edge.
- **Stations** — data-defined priority queues that route or hold
  packets until there is bandwidth or capability to handle them. The
  network's nodes. Actor, group, constraint, and batch stations are
  all the same row shape.
- **Routes** — motion between stations. Edges in the map.
- **The log** — every state change, immutably. Projections are pure
  functions of it; the substrate's memory *is* the log.
- **Admission** — the one edge where a packet enters and its protocol
  set is fixed.

This layer is physics. It has no opinion about what the work means.

## 2. The fat protocols dictate the current operating model

Workflows are protocols, and they are **fat**: the meaning lives in
the protocol, not in the endpoints. A station does not know what a
`ship-a-change` is. Neither does the code. The protocol row does — it
carries the steps, the predicates that order them, the evidence each
requires, the terminals that end them, and the obligations their
arrival creates elsewhere.

That is why protocols are **registry data**: append-only, versioned,
with in-flight packets pinned to the version they were admitted
under. Changing how the company works is publishing a row, not
shipping code. It is also why they can be **experimented on** —
two versions are two arms, cohorts are fixed at admission, and the
verdict is a query over the log.

"The **current** operating model" is the load-bearing word. The
protocols are not the system; they are what the system is *doing this
month*. A protocol that cannot be replaced without a deploy has
leaked into the substrate, and that leak is the defect to hunt.

## 3. The actors run it

Humans and registered agents are the CPUs. Nothing moves without an
actor claiming a step and doing it. Actors have:

- **Stations** — a personal queue, the same row shape as every other.
- **Capability** — skills and authority, enforced at the claim.
- **Bandwidth** — finite, which is why queues hold rather than drop.
- **Identity that includes what they are** — `[agent-mode]:[model]`
  for agents, because a different model is a different CPU.

Actors are not users of the system. They are the part of it that
executes. The software describes the machine and instruments it; the
actors *are* the machine running.

## What the framing buys

- Change the operating model without touching the substrate: publish
  a protocol version.
- Add actors without changing protocols: they arrive at stations.
- Measure everything uniformly: it is all packets, stations, and
  motion, so cycle time, queue depth, and loss are one vocabulary
  rather than per-feature metrics.
- Locate a defect by layer: a thing that should be data living in
  code is a protocol leak; a packet no station can present is a
  substrate failure; work that never gets claimed is an actor
  problem.

## Where the OS reading went

The "human-powered state machine OS" framing is not wrong and is not
discarded — it is **a lens**, and a good one for reasoning about
execution: the log as memory, the StepType registry as the
instruction alphabet, a step's status as a program counter, policy as
the privilege model. It answers "how does a single packet get
executed". It is simply not the substrate. The network is.

The practical consequence, and the reason this doc exists: when the
two framings disagree in a design argument, **the network framing
wins**, because it is the one that survives changing the operating
model.

## Open questions

### Q1: What happens to the older frame documents?

`human-powered-state-machine.md` is still accurate as an execution
lens and is referenced from CLAUDE.md as the reading frame. Options:
retitle it explicitly as a lens and keep it; fold its still-load-
bearing invariants into this doc and delete it; or leave both and
accept two front doors.

Proposed: **retitle and keep**, with a pointer here at the top. Its
invariants (executors as CPUs, no bespoke code paths for new work
types) are the ones most often cited in review, and moving them would
break every reference for a naming improvement.

### Q2: How far does "fat protocols" go — should policy be protocol data too?

Today policy is its own subsystem with its own rules. Under this
framing, an entitlement is arguably part of what a protocol *means*
(who may complete this step is as protocol-shaped as what evidence it
requires), and `entitlements` already exists on the WorkflowSpec.
Whether policy collapses into protocols or stays a peer is a real
architectural question this doc should not answer by implication.
