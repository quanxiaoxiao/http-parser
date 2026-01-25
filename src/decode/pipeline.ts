import type { Buffer } from 'node:buffer';

import {
  decodeRequest,
  decodeResponse,
  type HttpDecodeEvent,
  type HttpRequestState,
  type HttpResponseState,
  isMessageFinished,
} from './message.js';

type EventHandler = (event: HttpDecodeEvent) => void;
type EventSubscriptions = Map<string, readonly EventHandler[]>;

interface HttpPipelineState {
  readonly events: readonly HttpDecodeEvent[];
  readonly error?: Error;
}

export interface PipelineState<T extends HttpPipelineState> {
  readonly httpState: T | null;
  readonly subscriptions: EventSubscriptions;
}

type HttpStateUnion = HttpRequestState | HttpResponseState;
type Decoder<T extends HttpStateUnion> = (previous: T | null, input: Buffer) => T;

export const createPipelineState = <T extends HttpStateUnion>(): PipelineState<T> => ({
  httpState: null,
  subscriptions: new Map(),
});

export const subscribe = <T extends HttpStateUnion>(
  state: PipelineState<T>,
  eventType: string,
  handler: EventHandler,
): PipelineState<T> => {
  const existing = state.subscriptions.get(eventType);
  if (existing?.includes(handler)) {
    return state;
  }

  const subscriptions = new Map(state.subscriptions);
  subscriptions.set(eventType, [...(existing ?? []), handler]);

  return { ...state, subscriptions };
};

export const unsubscribe = <T extends HttpStateUnion>(
  state: PipelineState<T>,
  eventType: string,
  handler: EventHandler,
): PipelineState<T> => {
  const existing = state.subscriptions.get(eventType);
  if (!existing) return state;

  const next = existing.filter((function_) => function_ !== handler);
  if (next.length === existing.length) return state;

  const subscriptions = new Map(state.subscriptions);
  next.length === 0
    ? subscriptions.delete(eventType)
    : subscriptions.set(eventType, next);

  return { ...state, subscriptions };
};

const emitEvents = (
  subscriptions: EventSubscriptions,
  events: readonly HttpDecodeEvent[],
): void => {
  for (const event of events) {
    const specific = subscriptions.get(event.type);
    const wildcard = subscriptions.get('*');

    specific?.forEach((handler) => handler(event));
    wildcard?.forEach((handler) => handler(event));
  }
};

const pushInternal = <T extends HttpStateUnion>(
  state: PipelineState<T>,
  chunk: Buffer,
  decoder: Decoder<T>,
): PipelineState<T> => {
  const httpState = decoder(state.httpState, chunk);

  if (httpState.events.length > 0) {
    emitEvents(state.subscriptions, httpState.events);
  }

  return { ...state, httpState };
};

export const pushRequest = (
  state: PipelineState<HttpRequestState>,
  chunk: Buffer,
): PipelineState<HttpRequestState> =>
  pushInternal(state, chunk, decodeRequest);

export const pushResponse = (
  state: PipelineState<HttpResponseState>,
  chunk: Buffer,
): PipelineState<HttpResponseState> =>
  pushInternal(state, chunk, decodeResponse);

export const isFinished = <T extends HttpStateUnion>(
  state: PipelineState<T>,
): boolean =>
  state.httpState !== null && isMessageFinished(state.httpState);

export const getError = <T extends HttpStateUnion>(
  state: PipelineState<T>,
): Error | undefined =>
  state.httpState?.error;

export const hasError = <T extends HttpStateUnion>(
  state: PipelineState<T>,
): boolean =>
  state.httpState?.error !== undefined;

export const getHttpState = <T extends HttpStateUnion>(
  state: PipelineState<T>,
): T | null =>
  state.httpState;

export const clear = <T extends HttpStateUnion>(): PipelineState<T> =>
  createPipelineState();

export const pipe =
  <T extends HttpStateUnion>(
    ...functions: Array<(state: PipelineState<T>) => PipelineState<T>>
  ) =>
  (initial: PipelineState<T>): PipelineState<T> =>
    functions.reduce((state, function_) => function_(state), initial);

export const when =
  <T extends HttpStateUnion>(
    predicate: (state: PipelineState<T>) => boolean,
    function_: (state: PipelineState<T>) => PipelineState<T>,
  ) =>
  (state: PipelineState<T>): PipelineState<T> =>
    predicate(state) ? function_(state) : state;

export const pushAll =
  <T extends HttpStateUnion>(
    chunks: readonly Buffer[],
    pushFunction: (state: PipelineState<T>, chunk: Buffer) => PipelineState<T>,
  ) =>
  (state: PipelineState<T>): PipelineState<T> =>
    chunks.reduce(pushFunction, state);
