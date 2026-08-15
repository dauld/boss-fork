// What happened to the feedback guests sent — the honest version.
//
// Origin (David, feedback cef0f06f): "We need a better Guest landing
// experience. It should welcome people to Algedonic Ales, introduce
// them to the guest experience, and I think it would be cool if we
// could show how Guest feedback has been flowing through the real IT
// department to add functionality as we go."
//
// The claim the landing page makes is unusual and worth making
// carefully: the feedback control in the chrome bar does not file a
// ticket into a void — it opens a `user-feedback` Job that moves
// through the same stations, protocols and trains as every other piece
// of work in this system, and the page shows where each one actually
// got to. That is only impressive if it is TRUE, so nothing here
// invents a stage, rounds a count, or hides the ones that were
// declined.

/** A feedback packet as the jobs API serves it. Steps arrive with the
 *  job on the list endpoint, so the current stage needs no second
 *  call. */
export type FeedbackPacket = Readonly<{
  id: string;
  status: string;
  opened_on: string;
  closed_on?: string | null;
  subject?: Readonly<{ id?: string }> | null;
  steps?: ReadonlyArray<
    Readonly<{ spec_slug?: string | null; title?: string | null; status: string }>
  >;
}>;

/** Where a packet is now, in words a guest can read. Keyed by the
 *  protocol's own step slugs, so a stage the protocol adds tomorrow
 *  degrades to a neutral label instead of a wrong one. */
const STAGE_LABELS: Readonly<Record<string, string>> = {
  submitted: 'just arrived',
  triage: 'being read',
  investigate: 'under investigation',
  'design-review': 'in design',
  build: 'being built',
  'needs-info': 'waiting on more detail',
};

/** Terminal step slugs and how the outcome reads. `closed` is the
 *  protocol's "something was actually done" terminal. */
const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  closed: 'done',
  duplicate: 'already reported',
  declined: 'not taken up',
};

export type GuestFeedbackItem = Readonly<{
  id: string;
  /** The surface it was about — the route path is the Subject id. */
  about: string;
  opened_on: string;
  stage: string;
  /** True once the packet reached a terminal. */
  finished: boolean;
}>;

export type GuestFlowSummary = Readonly<{
  received: number;
  /** Reached the `closed` terminal — feedback that changed something. */
  done: number;
  /** Still moving. */
  inFlight: number;
  recent: readonly GuestFeedbackItem[];
}>;

export const NO_FLOW: GuestFlowSummary = {
  received: 0,
  done: 0,
  inFlight: 0,
  recent: [],
};

function slugOf(step: { spec_slug?: string | null; title?: string | null }): string {
  return (step.spec_slug ?? step.title ?? '').trim();
}

/** The stage a packet is at.
 *
 *  An OPEN packet reports the step someone is actually working — the
 *  first ready or active one. A packet with nothing actionable is
 *  "queued": honest about the fact that it is waiting rather than
 *  inventing progress.
 *
 *  A CLOSED packet reports which terminal it reached, because "done"
 *  and "not taken up" are different answers and a guest deserves the
 *  real one. */
export function stageOf(packet: FeedbackPacket): string {
  const steps = packet.steps ?? [];
  if (packet.status !== 'open') {
    for (const s of steps) {
      const label = OUTCOME_LABELS[slugOf(s)];
      if (label && s.status === 'completed') return label;
    }
    return 'closed';
  }
  const working = steps.find((s) => s.status === 'active') ?? steps.find((s) => s.status === 'ready');
  if (!working) return 'queued';
  return STAGE_LABELS[slugOf(working)] ?? 'in progress';
}

/** Summarise the feedback corpus for the guest landing.
 *
 *  `limit` caps the recent list only; the counts are over everything
 *  passed in. Simulated packets are dropped — the demo tenant
 *  generates synthetic work, and counting it here would turn a true
 *  claim into a marketing number. */
export function summariseFeedback(
  packets: readonly FeedbackPacket[],
  limit = 5,
): GuestFlowSummary {
  const real = packets.filter((p) => !(p as { simulated?: boolean }).simulated);
  const done = real.filter(
    (p) =>
      p.status !== 'open' &&
      (p.steps ?? []).some((s) => slugOf(s) === 'closed' && s.status === 'completed'),
  ).length;
  const inFlight = real.filter((p) => p.status === 'open').length;

  // Newest first, and in-flight ahead of finished at the same date:
  // the point of the panel is that work is MOVING, so what is moving
  // reads first.
  const recent = [...real]
    .sort((a, b) => {
      const byOpen = (b.opened_on ?? '').localeCompare(a.opened_on ?? '');
      if (byOpen !== 0) return byOpen;
      const aOpen = a.status === 'open' ? 0 : 1;
      const bOpen = b.status === 'open' ? 0 : 1;
      return aOpen - bOpen;
    })
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      about: (p.subject?.id ?? '').trim() || 'the app',
      opened_on: p.opened_on,
      stage: stageOf(p),
      finished: p.status !== 'open',
    }));

  return { received: real.length, done, inFlight, recent };
}
