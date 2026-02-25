# Protocol Invariants Rule (HTTP Wire Physical Laws)

This rule enforces fundamental invariants
that **must never be violated** in any parser implementation,
regardless of optimizations, AI generation, or future refactors.

Violating these invariants breaks protocol correctness
and cannot be corrected downstream.

These are the **ground truth constraints** for HTTP/1.1 wire-level parsing.

---

## 1. Byte Stream Conservation

- Every byte received MUST either be consumed or remain in buffer.
- Parser MUST not invent or discard bytes silently.
- `consume(chunk)` MUST advance cursor only; no data loss allowed.

Forbidden:

❌ skipping bytes  
❌ double-consuming bytes  
❌ trimming wire data for convenience

---

## 2. Framing Determinism

- Message boundaries MUST always be exactly as defined by RFC rules.
- Framing resolution MUST be independent of buffer sizes or transport quirks.
- BODY length and termination MUST match Transfer-Encoding / Content-Length / semantic rules.

Forbidden:

❌ guessing body size  
❌ inferring end-of-message by timeout  
❌ consuming beyond framing limit

---

## 3. FSM Completeness

- All protocol states MUST be explicitly enumerated.
- Transitions MUST be deterministic and cover all possible inputs.
- No “hidden” or inferred states allowed.

Forbidden:

❌ boolean flag hacks for phase  
❌ implicit phase tracking  
❌ skipping transition logic

---

## 4. Roundtrip Symmetry

- Every parse + encode cycle MUST preserve wire fidelity.
- `decode(X) → Y; encode(Y) → X'` must satisfy:

    X' ≡ protocol-equivalent X

- Header order, duplication, and casing MUST remain recoverable.
- Body framing MUST match exactly.

Forbidden:

❌ destructive normalization  
❌ merging headers silently  
❌ changing message semantics

---

## 5. Immutability and Ownership

- Input bytes belong to adapter; parser MUST treat as immutable.
- Parser MAY keep minimal internal buffer for partial tokens only.
- Parser MUST report consumed bytes; adapter is responsible for freeing.

Forbidden:

❌ modifying source buffer  
❌ retaining external buffer references beyond consume()  
❌ hidden allocations affecting ownership

---

## 6. Lifecycle Integrity

- Parser MUST support sequential messages (keep-alive / pipelining)
- Completion of one message MUST not corrupt next.
- Parser MUST not assume new instance per message.

Forbidden:

❌ discarding remaining bytes  
❌ implicit resets  
❌ mixing lifecycle with FSM state

---

## 7. Error Inviolability

- Invalid input MUST transition parser to ERROR state.
- No silent recovery allowed.
- Partial parsing MUST not violate byte ownership or framing.

Forbidden:

❌ auto-correcting malformed headers  
❌ ignoring invalid chunk size  
❌ swallowing EOF

---

## 8. Header Truth Model

- Wire representation is authoritative.
- Semantic lookup is derived.
- Duplicate headers, casing, and order MUST be preserved.

Forbidden:

❌ overwriting wire representation  
❌ merging headers arbitrarily  
❌ destroying original order

---

## 9. Streaming & Incremental Safety

- Parser MUST handle arbitrary chunk boundaries.
- CRLF, chunk-size, header names, and bodies may split across buffers.
- Byte-by-byte, chunk-by-chunk parsing MUST remain correct.

Forbidden:

❌ assuming full line or full header block  
❌ rescanning already consumed bytes  
❌ buffering entire stream

---

## 10. Encoder Consistency

- Encoder MUST produce messages identical under RFC semantics.
- Every decode → encode → decode cycle MUST result in protocol-equivalent wire.

Forbidden:

❌ outputting normalized or reordered headers without explicit rule  
❌ changing body length semantics  
❌ violating framing invariants

---

## 11. Test Requirements

For any RFC-sensitive change:

- roundtrip encode/decode tests  
- boundary split tests  
- incremental byte-by-byte parsing tests  
- duplicate header preservation tests  
- chunked body compliance tests  
- EOF framing simulation tests

---

## 12. Architectural Summary

This rule enforces the **HTTP wire physical laws**:

| Dimension | Invariant |
|---|---|
| Bytes | never lost, never duplicated |
| Framing | deterministic and RFC-compliant |
| FSM | complete, deterministic, explicit |
| Lifecycle | multi-message, reusable, reset-safe |
| Headers | wire-truth preserved |
| Errors | no silent correction |
| Streaming | incremental and chunk-safe |
| Encode | roundtrip fidelity |

---

## ✅ Effect in Your `.opencode` System

```

state-machine.rule.md
↓
message-framing.rule.md
↓
byte-ownership.rule.md
↓
parser-lifecycle.rule.md
↓
header-storage.rule.md
↓
protocol-invariants.rule.md

