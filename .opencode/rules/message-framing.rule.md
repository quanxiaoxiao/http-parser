# Message Framing Rule (HTTP Wire Boundary Authority)

HTTP parsing correctness depends primarily on
MESSAGE FRAMING — not header parsing.

This rule defines how a parser determines the
EXACT byte boundary of an HTTP message body.

Framing logic is the authority that decides:

    where a message ends
    when parsing completes
    how many bytes belong to the body

Framing MUST be resolved BEFORE body parsing begins.

---

## 1. Core Principle

Parser MUST determine message body framing using
protocol semantics — NEVER by guessing or buffering
until stream end.

Parsing order:

1. start-line
2. headers
3. framing resolution   ← REQUIRED STEP
4. body parsing

Body parsing MUST NOT begin until framing is known.

---

## 2. Framing Decision Priority (HTTP/1.1)

Framing MUST follow strict precedence:

```

Transfer-Encoding
↓
Content-Length
↓
Message Semantics (status/method)
↓
Connection Close (EOF framing)
↓
No Body

```

Lower rules MUST NOT override higher ones.

---

## 3. Transfer-Encoding Rules

If header contains:

```

Transfer-Encoding: chunked

````

Then:

- chunked framing MUST be used
- Content-Length MUST be ignored
- parser transitions to CHUNKED_BODY state

Requirements:

- chunk-size parsed as HEX
- each chunk terminated by CRLF
- zero-sized chunk ends body
- trailer headers allowed

Forbidden:

❌ mixing chunked with fixed-length parsing  
❌ accepting malformed chunk size  
❌ reading beyond terminating chunk

---

## 4. Content-Length Rules

If Transfer-Encoding is absent and Content-Length exists:

Parser MUST:

- parse Content-Length as base-10 integer
- reject non-numeric values
- reject negative values
- reject overflow

Multiple Content-Length headers:

- allowed ONLY if values identical
- otherwise MUST throw HttpError

Body length equals EXACTLY Content-Length bytes.

Forbidden:

❌ early termination  
❌ reading extra bytes  
❌ implicit trimming

---

## 5. Message Semantics (No Body Cases)

Body presence depends on message type.

Parser MUST treat following as NO BODY:

### Responses

- status 1xx
- status 204
- status 304

### Requests

- CONNECT (after successful response)
- HEAD response bodies MUST NOT be parsed

Parser transitions directly to COMPLETE.

---

## 6. Connection Close Framing (EOF)

If ALL are true:

- no Transfer-Encoding
- no Content-Length
- semantics allow body

Then body is framed by connection close.

Rules:

- parser reads until stream EOF
- completion occurs ONLY when transport ends

Forbidden:

❌ assuming EOF will occur
❌ buffering indefinitely without transport signal

EOF framing MUST be explicitly enabled by adapter layer.

---

## 7. Framing Resolution State

Parser MUST include explicit framing state.

Example:

```ts
enum BodyKind {
  NONE,
  CONTENT_LENGTH,
  CHUNKED,
  EOF
}
````

Framing decision MUST occur exactly once per message.

---

## 8. FSM Integration Requirement

State transitions MUST follow:

```
START_LINE
  → HEADERS
  → FRAMING_RESOLVED
  → BODY (optional)
  → COMPLETE
```

Forbidden:

❌ entering BODY without framing decision
❌ inferring framing from buffer size
❌ changing framing mid-parse

---

## 9. Streaming Safety Requirements

Parser MUST handle:

* chunk boundary split across buffers
* CRLF split across chunks
* partial chunk-size arrival
* partial body delivery

Parser MUST consume bytes incrementally.

---

## 10. Completion Semantics

Message completion occurs ONLY when:

* chunked terminator parsed
* Content-Length satisfied
* semantic no-body confirmed
* EOF received (EOF framing)

Completion MUST be deterministic.

---

## 11. Error Conditions (Mandatory)

Parser MUST throw HttpError when:

* conflicting framing headers exist
* invalid chunk syntax detected
* body exceeds declared length
* premature stream end occurs
* framing undecidable

Parser MUST NOT attempt recovery.

---

## 12. Encode Compatibility

Encoder MUST produce messages whose framing
would resolve identically under this rule.

Roundtrip invariant:

decode(X) → Y
encode(Y) → protocol-equivalent X

---

## 13. AI Generation Constraints

When generating parsing logic, AI MUST:

1. implement framing resolver FIRST
2. select body parser SECOND
3. process body LAST

AI MUST NOT begin from body parsing logic.

---

## 14. Required Tests

Every framing implementation MUST include:

* chunked valid case
* chunked invalid size
* content-length exact match
* mismatched content-length headers
* CRLF boundary split test
* byte-by-byte streaming test
* EOF framing simulation

