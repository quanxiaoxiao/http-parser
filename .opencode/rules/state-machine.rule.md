# State Machine Rule (Streaming Parser Requirement)

All protocol parsing logic MUST be implemented
as an explicit finite state machine (FSM).

This repository parses streaming HTTP wire data.
Parsing MUST work incrementally across chunks.

---

## 1. Core Principle

Parsing is a STATE TRANSITION process.

Never treat input as a complete string.

Parser must operate as:

    (state, input_chunk) -> (next_state, output?)

---

## 2. Required Properties

A parser MUST:

- maintain explicit parsing state
- support partial input
- resume safely
- consume bytes progressively
- stop exactly at protocol boundaries

Parser must be resumable at ANY byte offset.

---

## 3. State Definition

States MUST be explicit and enumerable.

Example:

```ts
enum ParserState {
  START_LINE,
  HEADERS,
  BODY,
  CHUNK_SIZE,
  CHUNK_DATA,
  COMPLETE,
  ERROR
}
````

Forbidden:

❌ implicit boolean flags
❌ hidden phase tracking
❌ parsing phase inferred from data length

---

## 4. Transition Rules

Each state MUST define:

* accepted input
* exit condition
* next state

Transitions must be deterministic.

Example pattern:

```ts
switch (state) {
  case START_LINE:
    return parseStartLine(ctx)
}
```

---

## 5. Streaming Requirement

Parser MUST assume:

* input arrives in arbitrary chunk sizes
* CRLF may split across chunks
* headers may split mid-character
* body boundaries may not align with buffers

Forbidden assumptions:

❌ full line available
❌ full header block available
❌ complete message buffered

---

## 6. Buffer Handling

Parser MUST:

* keep minimal internal buffer
* consume processed bytes
* never reparse consumed input

Preferred model:

cursor-based consumption.

Forbidden:

❌ repeated string concatenation
❌ full-buffer regex parsing
❌ re-scanning entire payload

---

## 7. Regex Limitation

Regex MAY be used ONLY for:

* token validation
* small local checks

Regex MUST NOT:

* parse full headers
* parse message structure
* detect message boundaries

FSM controls structure — not regex.

---

## 8. Completion Semantics

Parser completion MUST be explicit.

Valid completion conditions:

* CRLF CRLF reached (headers done)
* body length satisfied
* chunked terminator parsed

Never infer completion implicitly.

---

## 9. Error Transition

Invalid input MUST transition to:

```
ERROR state
```

Rules:

* stop consuming input
* throw HttpError
* no silent recovery

Parser must not auto-correct malformed data.

---

## 10. Encode Compatibility

FSM output must map cleanly to encoder input.

State transitions should produce structured,
serializable intermediate representations.

---

## 11. AI Generation Constraints

When generating parser code, AI MUST:

1. define states first
2. implement transition logic second
3. implement helpers last

Never start from string parsing logic.

---

## 12. Required Tests

Every FSM parser MUST include:

* chunk-split tests
* byte-by-byte parsing test
* boundary split test (CRLF split)
* invalid transition test
* completion detection test

Example:

input split at every byte boundary must still parse correctly.

---

## 13. Preferred Architecture Pattern

Parser structure SHOULD resemble:

```
createParser()
  → state
  → buffer
  → consume(chunk)
        → advance()
        → transition()
```

Stateless helpers + stateful controller.

