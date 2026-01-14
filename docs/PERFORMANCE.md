# PERFORMANCE.md

> **Performance Philosophy & Trade-offs**
>
> This library prioritizes **correctness, explainability, and observability** over raw throughput.
> Performance optimizations are **intentional and scoped**, not accidental.
>
> Target use cases:
>
> * Single or few requests
> * Teaching, auditing, fuzzing, and visualization
> * Security-oriented HTTP parsing
>
> Non-goals:
>
> * Edge proxy / CDN
> * High-QPS production servers
> * Zero-copy streaming optimizations by default

---

## Core Principle

> **Ask one question when writing code:**
>
> **“Does this run on every byte?”**
>
> * **Yes** → must be fast, minimal, and allocation-free
> * **No** → readability and clarity are allowed (and often preferred)

---

## Performance White-List

The following sections define where the codebase is **allowed to be slow**, **allowed with caution**, and **never allowed to be slow**.

This is a deliberate engineering contract.

---

## 1. Explicitly Allowed to Be Slow

These areas trade performance for clarity, determinism, and traceability.

### 1.1 Body Materialization

```ts
Buffer.concat(chunks)
```

**Allowed**

**Why**

* Executed only at phase boundaries (end of body)
* Clear ownership and lifetime semantics
* Ideal for tracing, visualization, and auditing

**Guideline**

* Encapsulate behind a semantic boundary (`finalizeBody`, `materializeBody`)
* Treat as a *phase*, not an implementation detail

---

### 1.2 Error Object Construction

```ts
new HttpDecodeError(code, context)
```

**Allowed**

**Why**

* Errors are exceptional paths
* Rich context > construction cost

**Guideline**

* Errors should include byte offset, state, and triggering limit
* Prefer explicit fields over compressed representations

---

### 1.3 Recoverable Error Branching

```ts
if (limits.allowBareLF) { ... }
```

**Allowed**

**Why**

* Represents protocol policy decisions
* Required for differential testing and visualization

**Guideline**

* Keep branches explicit
* Do not merge similar-looking cases for brevity

---

### 1.4 Parser → UI / Trace Event Emission

```ts
events.push({ type: 'state_enter', state })
```

**Allowed**

**Why**

* Observability is a core feature
* Trace replay requires semantic completeness

**Guideline**

* Stable, verbose event shapes are preferred
* Avoid compression or bit-packing

---

### 1.5 DFA / State Machine Readability

```ts
switch (state) {
  case HEADER_NAME:
  case HEADER_VALUE:
}
```

**Allowed**

**Why**

* State machine is the primary knowledge artifact
* Readability > micro-optimizations

**Guideline**

* Prefer more states over clever logic
* Avoid bit tricks or implicit transitions

---

## 2. Allowed With Caution

These areas may be slow, but must be **bounded** and **intentional**.

### 2.1 Header Storage

```ts
headersRaw: [string, string][]
```

**Caution**

**Why**

* Header count and size are limited
* Used for reconstruction and auditing

**Guideline**

* Preserve raw order and formatting
* Can be replaced later with indexed structures

---

### 2.2 Chunk Accumulation (Chunked Encoding)

```ts
chunks.push(chunk)
```

**Caution**

**Why**

* Chunk count is bounded by limits
* Not a streaming API

**Guideline**

* Enforce per-chunk and total size limits
* Do not auto-materialize early

---

### 2.3 Integer Parsing (Content-Length, Chunk Size)

```ts
parseInt(str, 16)
```

**Caution**

**Why**

* Executed on hot paths but with very small inputs

**Guideline**

* Validate input explicitly
* Prefer clarity over handwritten parsers

---

## 3. Never Allowed to Be Slow

These paths execute **per byte** or **per transition**.
Slowness here degrades the entire system.

### 3.1 Main Byte Consumption Loop

```ts
while (i < buffer.length) {
  const byte = buffer[i++];
}
```

**Never slow**

**Rules**

* No allocations
* No regex
* No substring / slicing

---

### 3.2 State Transitions

```ts
state = nextState;
```

**Never slow**

**Rules**

* Use enums / numeric states
* No object creation
* No deep cloning

---

### 3.3 Limit Counters

```ts
headerBytes += 1;
```

**Never slow**

**Rules**

* Primitive numbers only
* Inline operations
* No helper functions

---

### 3.4 CR / LF Detection

```ts
if (byte === CR) { ... }
```

**Never slow**

**Rules**

* Byte comparison only
* No string conversion

---

### 3.5 Header Termination Detection (CRLF CRLF)

```ts
if (prev === CR && byte === LF) { ... }
```

**Never slow**

**Rules**

* Maintain explicit state
* No backtracking or scanning

---

## Structural Rules

### Rule 1: Slowness Must Be Phase-Bound

Slow operations are only allowed at **phase boundaries**:

* start-line → headers
* headers → body
* body → finished

---

### Rule 2: Slowness Must Be Replaceable

Every intentionally slow operation must be encapsulated:

```ts
materializeBody()
```

Future versions may provide alternative implementations:

```ts
materializeBody({ mode: 'zero-copy' })
```

---

### Rule 3: Hot Paths Do Not Optimize for Elegance

In byte loops:

* Avoid abstraction
* Avoid DRY
* Avoid “clever” code

**Determinism > elegance**

---

## Summary

This library treats performance as a **scoped engineering decision**, not a global goal.

> **We are allowed to be slow where it buys understanding.**
> **We are never allowed to be slow where it breaks determinism.**

If a future change violates this document, it should be considered a **design regression**, not a micro-optimization opportunity.
