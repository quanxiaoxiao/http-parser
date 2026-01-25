import * as assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';

import {
  createPipelineState,
  subscribe,
  unsubscribe,
  pushAll,
  pipe,
  when,
  isFinished,
  hasError,
  getError,
} from './pipeline.js';

import type { PipelineState } from './pipeline.js';

/* ---------- helpers ---------- */

type MockEvent = {
  type: string;
  payload?: unknown;
};

type MockHttpState = {
  events: readonly MockEvent[];
  error?: Error;
  finished?: boolean;
};

const mockDecoder =
  (events: MockEvent[] = []) =>
  (prev: MockHttpState | null, _chunk: Buffer): MockHttpState => ({
    events,
    finished: prev?.finished ?? false,
  });

/* ---------- tests ---------- */

test('createPipelineState returns empty initial state', () => {
  const state = createPipelineState<MockHttpState>();

  assert.equal(state.httpState, null);
  assert.equal(state.subscriptions.size, 0);
});

test('subscribe registers handler and emits event', () => {
  const state0 = createPipelineState<MockHttpState>();

  let called = false;

  const state1 = subscribe(state0, 'data', (event) => {
    called = true;
    assert.equal(event.type, 'data');
  });

  const next = (state1 as PipelineState<MockHttpState>);

  // simulate pushInternal behavior
  const httpState = mockDecoder([{ type: 'data' }])(null, Buffer.from('x'));
  for (const e of httpState.events) {
    next.subscriptions.get(e.type)?.forEach((h) => h(e));
  }

  assert.equal(called, true);
});

test('unsubscribe removes handler', () => {
  const state0 = createPipelineState<MockHttpState>();

  let called = false;
  const handler = () => {
    called = true;
  };

  const state1 = subscribe(state0, 'data', handler);
  const state2 = unsubscribe(state1, 'data', handler);

  const httpState = mockDecoder([{ type: 'data' }])(null, Buffer.from('x'));
  for (const e of httpState.events) {
    state2.subscriptions.get(e.type)?.forEach((h) => h(e));
  }

  assert.equal(called, false);
});

test('wildcard subscription (*) receives all events', () => {
  const state0 = createPipelineState<MockHttpState>();

  const received: string[] = [];

  const state1 = subscribe(state0, '*', (e) => {
    received.push(e.type);
  });

  const httpState = mockDecoder([
    { type: 'a' },
    { type: 'b' },
  ])(null, Buffer.from('x'));

  for (const e of httpState.events) {
    state1.subscriptions.get(e.type)?.forEach((h) => h(e));
    state1.subscriptions.get('*')?.forEach((h) => h(e));
  }

  assert.deepEqual(received, ['a', 'b']);
});

test('pushAll applies push function sequentially', () => {
  const chunks = [Buffer.from('1'), Buffer.from('2')];

  const push = (state: number, _chunk: Buffer) => state + 1;

  const result = pushAll(chunks, push)(0);

  assert.equal(result, 2);
});

test('pipe composes pipeline transformations', () => {
  const inc = (n: number) => n + 1;
  const double = (n: number) => n * 2;

  const result = pipe(inc, double)(1);

  assert.equal(result, 4);
});

test('when conditionally applies transformation', () => {
  const inc = (n: number) => n + 1;

  const fn = when(
    (n) => n > 0,
    inc,
  );

  assert.equal(fn(1), 2);
  assert.equal(fn(0), 0);
});

test('hasError and getError reflect httpState.error', () => {
  const err = new Error('boom');

  const state: PipelineState<MockHttpState> = {
    httpState: { events: [], error: err },
    subscriptions: new Map(),
  };

  assert.equal(hasError(state), true);
  assert.equal(getError(state), err);
});

test('isFinished returns false when httpState is null', () => {
  const state = createPipelineState<MockHttpState>();

  assert.equal(isFinished(state), false);
});
