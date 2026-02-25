# Byte Ownership Rule (Streaming Buffer Authority)

HTTP wire parsing operates on a continuous byte stream.

Correctness and performance depend on clear ownership
of input bytes and deterministic consumption rules.

This rule defines WHO owns bytes, WHO may mutate data,
and HOW bytes move through the parser.

---

## 1. Core Principle

Parser DOES NOT own input memory.

Parser ONLY owns:

    cursor position
    parsing state
    minimal internal buffer (if required)

Input byte storage belongs to the caller (adapter).

Parser MUST treat input as immutable.

---

## 2. Ownership Model

### Adapter (Transport Layer) Owns

- byte buffers
- memory allocation
- buffer lifetime
- EOF signaling

### Parser Owns

- read cursor
- state machine state
- framing progress
- partial token context

Parser MUST NOT assume buffer persistence
beyond current consume() call unless copied explicitly.

---

## 3. Immutability Requirement

Input buffers MUST be treated as read-only.

Forbidden:

❌ modifying incoming Uint8Array / Buffer  
❌ in-place normalization  
❌ rewriting CRLF  
❌ trimming data inside source buffer

All transformations must operate logically,
not physically.

---

## 4. Cursor Authority

Parser advances through data using a cursor.

Example model:

```ts
consume(buffer):
    while cursor < buffer.length:
        advance()
````

Rules:

* cursor MUST move forward only
* bytes MUST NOT be re-consumed
* cursor progression MUST be monotonic

Forbidden:

❌ resetting cursor backward
❌ rescanning processed bytes
❌ rebuilding full input string

---

## 5. Consumption Contract

After consume(chunk):

Parser MUST report how many bytes were consumed.

Example:

```ts
const consumed = parser.consume(chunk)
```

Adapter MAY discard consumed bytes.

Parser MUST NEVER access discarded data again.

---

## 6. Partial Token Handling

Streaming may split tokens across chunks:

Examples:

* CRLF split
* header name split
* chunk-size split
* UTF-8 boundary split

Parser MAY keep a minimal internal buffer ONLY for:

* incomplete token fragments

Requirements:

* buffer size MUST remain bounded
* accumulated data MUST be minimal
* completed bytes MUST be released

Forbidden:

❌ accumulating entire message
❌ concatenating full stream history

---

## 7. Zero-Copy Preference

Parser SHOULD avoid copying bytes whenever possible.

Preferred operations:

* slicing (view)
* index referencing
* offset tracking

Copying allowed ONLY when:

* token crosses chunk boundary
* normalization explicitly required
* adapter memory cannot persist safely

---

## 8. Message Boundary Integrity

Parser MUST stop consuming EXACTLY at message boundary.

Remaining bytes belong to next message lifecycle.

Example:

```
[msg1][msg2-start]
          ^
          stop here
```

Parser MUST NOT consume into next message.

---

## 9. Buffer Lifetime Safety

Parser MUST assume:

* adapter may reuse buffers
* adapter may free memory
* chunk references may become invalid

Therefore:

Parser MUST NOT retain references to external buffers
after consume() returns unless explicitly documented.

---

## 10. FSM Interaction

State transitions MUST depend only on:

* current state
* current byte
* internal minimal context

FSM MUST NOT depend on historical buffers.

---

## 11. Performance Invariant

Parser complexity MUST remain:

```
O(n) over total bytes processed
```

Forbidden patterns:

❌ repeated string concatenation
❌ full-buffer regex parsing
❌ re-tokenizing previous input
❌ quadratic scanning

Each byte SHOULD be examined once.

---

## 12. Error Safety

On error:

* parser stops advancing cursor
* remaining bytes untouched
* adapter retains ownership

Parser MUST NOT partially consume ambiguous data.

---

## 13. Adapter Boundary Contract

Adapter responsibilities:

* pass chunks in arrival order
* discard consumed bytes
* signal EOF explicitly

Parser responsibilities:

* deterministic byte consumption
* no hidden buffering assumptions

Parser MUST remain transport-agnostic.

---

## 14. AI Generation Constraints

AI-generated parsers MUST:

1. expose consume(chunk) API
2. track explicit cursor
3. avoid string-based parsing pipelines
4. avoid accumulating full payload

Forbidden generation:

```ts
buffer += chunk
parse(buffer)
```

Required direction:

```ts
consume(chunk)
advance(byte)
transition(state)
```

---

## 15. Required Tests

Implementations MUST include:

* byte-by-byte streaming test
* CRLF split across chunks
* header split mid-token
* chunk-size split test
* unread remainder preservation
* large body streaming test

---

## 16. Architectural Invariant

Bytes flow ONE direction:

```
Adapter → Parser → Message
```

Ownership NEVER flows backward.

Parser interprets bytes.
Adapter stores bytes.

Never mix responsibilities.

