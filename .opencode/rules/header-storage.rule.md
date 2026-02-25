# Header Storage Rule (Wire Fidelity vs Lookup Semantics)

HTTP headers exist simultaneously in two domains:

1. Wire representation (protocol truth)
2. Semantic lookup (application usage)

A compliant parser MUST preserve wire fidelity
while enabling efficient semantic access.

Header storage MUST NOT destroy protocol meaning.

---

## 1. Core Principle

Headers are an ORDERED MULTI-MAP.

Meaning:

- order MAY matter
- duplicate headers MAY exist
- casing is NOT semantically significant
- raw representation MUST remain recoverable

Parser MUST NOT collapse headers into a plain object.

Forbidden:

❌ Record<string, string>
❌ Map<string, string> (single value)
❌ last-write-wins storage

---

## 2. Dual Representation Model

Parser MUST maintain TWO logical views:

### Wire View (authoritative)

Represents exact parsed headers.

Required properties:

- original order preserved
- original casing preserved
- original value preserved
- duplicates preserved

Example:

```

Host: example.com
Set-Cookie: a=1
Set-Cookie: b=2

````

Must remain distinguishable entries.

---

### Semantic View (derived)

Used for lookup convenience.

Properties:

- case-insensitive keys
- normalized access
- aggregation allowed (RFC-permitted only)

Semantic view MUST be derived from wire view,
never replace it.

---

## 3. Required Data Model

Preferred structure:

```ts
type HeaderEntry = {
  name: string        // original casing
  value: string
  lowerName: string   // cached normalized key
}
````

Storage:

```ts
headers: HeaderEntry[]
```

Lookup index MAY exist:

```ts
index: Map<string, number[]>
```

Index MUST reference wire entries — not copy them.

---

## 4. Case Handling Rules

Header names are case-insensitive.

Parser MUST:

* preserve original casing
* provide lowercase lookup

Forbidden:

❌ rewriting stored header name casing
❌ lowercasing wire representation

Normalization applies ONLY to lookup keys.

---

## 5. Duplicate Header Semantics

Duplicates MUST be preserved exactly.

Parser MUST NOT merge headers unless RFC explicitly allows.

Examples:

### MUST NOT merge

* Set-Cookie
* Warning
* WWW-Authenticate

### MAY merge (semantic layer only)

Comma-separated headers (RFC-defined).

Merging MUST NOT alter wire storage.

---

## 6. Ordering Requirement

Header order MUST be preserved.

Reasons:

* signature validation
* proxy correctness
* debugging fidelity
* encoder symmetry

Encoder SHOULD emit headers in original order
when possible.

---

## 7. Whitespace Preservation

Parser MUST preserve meaningful whitespace
inside values.

Allowed normalization:

* optional leading OWS removal (semantic view only)

Forbidden:

❌ trimming stored value destructively
❌ collapsing internal spaces

Wire representation remains authoritative.

---

## 8. Incremental Parsing Compatibility

Header storage MUST support streaming assembly.

Parser MAY build entries incrementally:

```
name partial → complete
value partial → complete
commit entry
```

Entry MUST be added ONLY after CRLF termination.

Partial headers MUST NOT appear in storage.

---

## 9. Memory Constraints

Parser SHOULD avoid unnecessary allocation.

Allowed:

* slice referencing
* delayed string materialization

Forbidden:

❌ copying entire header block repeatedly
❌ rebuilding header arrays during parsing

---

## 10. Encode Compatibility

Encoder MUST reconstruct protocol-equivalent headers.

Roundtrip invariant:

decode(headers_wire)
→ semantic access
encode(...)
→ equivalent wire headers

Original ordering SHOULD be preserved.

---

## 11. Lookup API Expectations

Parser SHOULD expose:

```ts
get(name: string): string | undefined
getAll(name: string): string[]
has(name: string): boolean
entries(): HeaderEntry[]
```

Lookup MUST be case-insensitive.

Wire entries remain immutable.

---

## 12. FSM Interaction

Header storage MUST integrate with FSM:

```
HEADERS state:
    parse line
    validate
    commit entry
```

Storage mutation allowed ONLY at commit point.

---

## 13. Error Safety

Invalid header MUST:

* prevent entry commit
* transition parser to ERROR

Partial header data MUST be discarded safely.

---

## 14. AI Generation Constraints

AI-generated implementations MUST:

1. store headers as ordered list
2. preserve duplicates
3. separate wire and semantic views
4. avoid object-based header storage

Forbidden generation:

```ts
headers[name.toLowerCase()] = value
```

Required direction:

```ts
headers.push(entry)
index.get(lower).push(position)
```

---

## 15. Required Tests

Implementations MUST include:

* duplicate header preservation
* casing preservation
* order preservation
* case-insensitive lookup
* roundtrip encode/decode
* incremental header split test

---

## 16. Architectural Invariant

Wire representation is SOURCE OF TRUTH.

Semantic access is a VIEW.

Never invert this relationship.

