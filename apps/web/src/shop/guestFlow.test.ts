import { describe, expect, test } from 'bun:test';
import {
  NO_FLOW,
  stageOf,
  summariseFeedback,
  type FeedbackPacket,
} from './guestFlow';

function packet(over: Partial<FeedbackPacket> & { simulated?: boolean }): FeedbackPacket {
  return {
    id: 'f1',
    status: 'open',
    opened_on: '2026-08-15',
    subject: { id: '/shop' },
    steps: [],
    ...over,
  } as FeedbackPacket;
}

const step = (slug: string, status: string) => ({ spec_slug: slug, status });

describe('stageOf', () => {
  test('an open packet reports the step someone is actually working', () => {
    expect(
      stageOf(
        packet({
          steps: [step('triage', 'completed'), step('build', 'ready'), step('closed', 'pending')],
        }),
      ),
    ).toBe('being built');
  });

  test('active beats ready — that is the one in hand', () => {
    expect(
      stageOf(packet({ steps: [step('investigate', 'active'), step('build', 'ready')] })),
    ).toBe('under investigation');
  });

  test('an open packet with nothing actionable says queued, not "in progress"', () => {
    // Inventing progress for a packet nobody has picked up is exactly
    // the lie this panel exists to avoid.
    expect(stageOf(packet({ steps: [step('closed', 'pending')] }))).toBe('queued');
  });

  test('a stage the protocol adds tomorrow degrades to a neutral label', () => {
    expect(stageOf(packet({ steps: [step('re-triage', 'ready')] }))).toBe('in progress');
  });

  test('a closed packet reports WHICH terminal it reached', () => {
    const done = packet({ status: 'closed', steps: [step('closed', 'completed')] });
    const dup = packet({ status: 'closed', steps: [step('duplicate', 'completed')] });
    const no = packet({ status: 'closed', steps: [step('declined', 'completed')] });
    expect(stageOf(done)).toBe('done');
    expect(stageOf(dup)).toBe('already reported');
    expect(stageOf(no)).toBe('not taken up');
  });

  test('a skipped terminal is not the one it reached', () => {
    expect(
      stageOf(
        packet({
          status: 'closed',
          steps: [step('duplicate', 'skipped'), step('closed', 'completed')],
        }),
      ),
    ).toBe('done');
  });
});

describe('summariseFeedback', () => {
  test('counts received, done and in flight', () => {
    const s = summariseFeedback([
      packet({ id: 'a', status: 'closed', steps: [step('closed', 'completed')] }),
      packet({ id: 'b', status: 'closed', steps: [step('declined', 'completed')] }),
      packet({ id: 'c' }),
    ]);
    expect(s.received).toBe(3);
    expect(s.done).toBe(1); // declined is closed but nothing was done
    expect(s.inFlight).toBe(1);
  });

  test('simulated packets are not counted — the claim has to be true', () => {
    const s = summariseFeedback([
      packet({ id: 'real' }),
      packet({ id: 'sim', simulated: true }),
    ]);
    expect(s.received).toBe(1);
    expect(s.recent.map((r) => r.id)).toEqual(['real']);
  });

  test('recent is newest first, with what is still moving ahead of what finished', () => {
    const s = summariseFeedback([
      packet({ id: 'old', opened_on: '2026-08-01' }),
      packet({ id: 'finished', opened_on: '2026-08-15', status: 'closed',
               steps: [step('closed', 'completed')] }),
      packet({ id: 'moving', opened_on: '2026-08-15' }),
    ]);
    expect(s.recent.map((r) => r.id)).toEqual(['moving', 'finished', 'old']);
  });

  test('respects the recent limit without touching the counts', () => {
    const many = Array.from({ length: 9 }, (_, i) => packet({ id: `f${i}` }));
    const s = summariseFeedback(many, 3);
    expect(s.recent).toHaveLength(3);
    expect(s.received).toBe(9);
  });

  test('a packet with no subject still renders as being about something', () => {
    const s = summariseFeedback([packet({ subject: null })]);
    expect(s.recent[0]?.about).toBe('the app');
  });

  test('nothing in, nothing claimed', () => {
    expect(summariseFeedback([])).toEqual(NO_FLOW);
  });
});
