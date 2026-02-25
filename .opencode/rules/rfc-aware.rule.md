# RFC Aware Rule (HTTP/1.1)

This repository implements HTTP wire-level behavior.

All generated or modified code MUST respect HTTP/1.1
semantics defined primarily by:

- RFC 7230 (Message Syntax and Routing)
- RFC 7231 (Semantics and Content)

AI must treat RFC behavior as SOURCE OF TRUTH,
not implementation convenience.

---

## 1. Message Grammar Awareness

HTTP message structure:

start-line
*( header-field CRLF )
CRLF
[ message-body ]

### Requirements

- CRLF MUST be "\r\n"
- LF-only line endings are invalid
- empty line terminates headers
- parsing must stop exactly at boundary

Forbidden:

❌ accepting malformed line endings silently
❌ trimming structural whitespace blindly

---

## 2. Start Line Rules

### Request Line

METHOD SP REQUEST-TARGET SP HTTP-VERSION CRLF

Must validate:

- single SP separators
- HTTP-Version format: HTTP/1.1
- method token validity

### Status Line

HTTP-VERSION SP STATUS-CODE SP REASON-PHRASE CRLF

Must validate:

- 3-digit status code
- numeric only
- reason phrase optional but preserved

---

## 3. Header Field Semantics

Header format:

field-name ":" OWS field-value OWS

### Requirements

- header names are case-insensitive
- field-name must be token
- OWS allowed but not required
- original value SHOULD remain recoverable

Forbidden:

❌ lowercasing values automatically
❌ trimming meaningful spaces
❌ merging headers unless RFC allows

---

## 4. Message Body Framing

Body presence determined by:

1. Transfer-Encoding
2. Content-Length
3. message type rules

Priority:

Transfer-Encoding > Content-Length

### Rules

- chunked encoding overrides content-length
- multiple content-length must match
- invalid framing MUST throw error

Forbidden:

❌ guessing body size
❌ reading until stream end by default

---

## 5. Incremental Parsing Requirement

HTTP is a streaming protocol.

Parser MUST:

- support partial buffers
- pause safely
- resume parsing
- never assume full message availability

AI must prefer state machines over full-string parsing.

---

## 6. Error Handling (RFC Compliance)

Invalid syntax MUST:

- stop parsing
- throw HttpError
- never auto-correct silently

Examples:

- invalid header token
- malformed chunk size
- illegal start line

---

## 7. Encode / Decode Consistency

Generated serializers MUST preserve:

- header order (when possible)
- semantic equivalence
- message framing correctness

Roundtrip expectation:

decode(X) → Y
encode(Y) → protocol-equivalent X

---

## 8. Robustness Principle (STRICT MODE)

Do NOT apply:

"be liberal in what you accept"

Instead follow:

"be correct in what you parse"

Parser correctness > compatibility hacks.

---

## 9. AI Decision Rule

When unsure:

1. prefer RFC correctness
2. reject ambiguous input
3. preserve raw protocol meaning
4. avoid normalization unless specified

---

## 10. Required Tests For RFC-Sensitive Changes

Any RFC-impacting change MUST include:

- valid example
- invalid example
- boundary case
- incremental parsing case
- roundtrip encode/decode test

