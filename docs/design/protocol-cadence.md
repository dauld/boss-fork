# Design: protocol cadence — the clock coordinates, systemd supervises

**Status:** in-review — open questions tracked at `/system/design`
**Origin:** David, 2026-08-12 (verbatim, `bacca14e`): "We should be
using dispatcher to coordinate the conductor as well rather than
systemd. We want every protocol internalized so we can measure,
experiment, and update."
**Related**: [protocol-policy-publish.md](./protocol-policy-publish.md) —
revises its "timers never migrate" boundary ·
[internal-forge.md](./internal-forge.md) — supersedes half of Q6's
resolution, with its objection answered ·
[job-packet-network.md](./job-packet-network.md) ·
the clock-as-service rule, documented in the header of
`infra/lint/no-wallclock.sh` (no doc was ever written for it)

## The claim

A protocol's cadence — when its windows open, how often its
reconciliation runs — is part of the protocol, and today it is the
one part living outside the system: in systemd timer units, on a
box, invisible to the log, changeable only by an operator with sudo.
Internalizing it means three things his sentence names exactly:

- **measure** — every window-open and every reconcile tick is an
  event in the log, so "how often does the train actually run" and
  "what did the cadence cost" are queries, not folklore;
- **experiment** — cadence is a dispatcher rule row, edited through
  the rules API and hot-reloaded by the existing 30-second
  supervision (`1e576baf`), so trying a 3×-daily train is a data
  change with an audit trail;
- **update** — no unit files, no daemon-reload, no drift between
  boxes; the cadence deploys with the registry like every other
  protocol change (and under 3P, a protocol edit already is a
  network configuration change).

systemd is not deleted; it is demoted to what an OS is for —
**keeping processes alive**. Coordination of work belongs to BOSS.

## The maintenance-family objection, answered

internal-forge Q6 chose raw timers deliberately: "the dispatcher's
schedule runner fires on SIM-day boundaries, and at warp a daily
rule fires every couple of wall-minutes. Maintenance is wall-clock
work." That was an objection to the runner's *time basis*, not to
internalized cadence. The answer is to make the basis explicit:
a cadence rule declares `basis: wall | clock`. Wall-basis rules fire
from wall time regardless of warp (backups, certificate renewals,
the train's twice-daily); clock-basis rules keep today's sim-day
semantics (the brewery's daily cycles). With the basis field, the
maintenance family's timers migrate too — same guarantee they moved
to systemd for, now as measurable data. This doc supersedes the
timer-as-spawner half of that resolution once the basis lands.

## The conductor as a subscribed executor

The dispatcher cannot exec a binary on another box, and should not
learn to. The conductor becomes what every other actor already is:
**an executor with a queue**. A cadence rule emits the window packet
(`train.window.opened`, payload naming the window); the conductor —
`boss train serve`, a durable consumer exactly like the dispatcher's
own JetStream loop — claims it and runs the phases it already owns.
systemd keeps `boss-train.service` alive (a simple long-running
unit, no timers); the OS supervises the process, BOSS coordinates
the work. Reconcile ticks ride the same shape at their own cadence.
Every phase the conductor completes is already Job/step data; with
the trigger internalized, the train protocol is measurable
end-to-end: cadence → window → board → CI → merge → arrivals.

## Sequencing

Strictly after the Rust conductor lands (`26d61c97`) and never under
a moving train: (1) the cadence-rule schema + basis field + runner
support; (2) `boss train serve` consuming window packets, proven in
shadow against the timers; (3) the timers delete, systemd unit goes
long-running; (4) the maintenance family migrates onto wall-basis
rows, retiring its ExecStartPre wrapper pattern.

## Decision history

All four questions resolved by David, 2026-08-15, on review job
`47f3c3d2`. Each was accepted as proposed; the notes below record what
that commits us to, and — for Q1 — where the running system does not
yet match the decision.

- **2026-08-15 — the cadence row is a `[[cadence]]` sibling of
  `[[rule]]`.** `name`, `basis: wall|clock`, `every` (interval) or `at`
  (times-of-day), `emit` (topic + payload template): same table, same
  hot-reload, same ratchet posture as a dispatcher rule, and the
  departure board's "next departure" line reads it as data.
  **THE IMPLEMENTATION DIVERGES AND THIS DECISION IS THE ONE TO
  FOLLOW.** What shipped (114-cadence-rules.sql) is a SEPARATE
  `cadence_rules` table, read by `boss train cadence` through its own
  sqlx pool rather than through the dispatcher's registry. The
  divergence is not cosmetic: because that pool points at boss-gcp's
  local Postgres while packets live on the cluster, the registry an
  operator can read has not been the registry the loop obeys — measured
  2026-08-14, cluster `cadence_firings` 0 rows against 244 locally, and
  an agent read the system of record and told David a four-car dock
  would board when it would not. Folding cadence into the dispatcher
  rules table is what makes that class impossible rather than merely
  fixed; tracked as `protocol-data-agrees-between-record-and-runtime`
  in docs/invariants.toml.
- **2026-08-15 — one clock in the system.** The clock service already
  knows both times (`ClockNow` carries wall and sim), so the cadence
  runner evaluates wall-basis rows against wall time from that same
  feed. No component grows a second time source, and warp keeps
  compressing days for everything at once.
- **2026-08-15 — exactly-once windows come from a deterministic firing
  id.** `cadence:<name>:<window-stamp>`, deduped by the outbox, with
  catch-up on start emitting at most the single most-recent missed
  window per rule. No thundering backfill, matching the conductor's own
  one-window-at-a-time cadence. Live and observable: a catch-up firing
  for the 06:05Z window ran at 14:26Z on 2026-08-15 and fired once.
- **2026-08-15 — window packets are ordinary packets, claimed through
  the same CAS as human queues.** `boss train serve` claims a window
  the way an actor claims a step, which gives the departure board's
  live dot its data and makes a second conductor instance safe by
  construction rather than by deployment discipline. This supersedes
  the current arrangement, where a firing is claimed in
  `cadence_firings` BEFORE the verb runs and the conductor's flock
  decides afterwards whether the work happens — so a verb that loses
  the lock consumes its window and leaves silently. That defect is
  filed as `4ed0e791`: the 06:00/18:00 boarding window collided with
  the 10-minute reconcile every single time and had never, in the
  system's history, boarded a train. A claim that happens where the
  work happens is exactly what removes it.
