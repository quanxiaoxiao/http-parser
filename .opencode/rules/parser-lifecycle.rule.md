# Parser Lifecycle Rule (Streaming Message Engine)

HTTP/1.1 parsing operates on a continuous byte stream,
NOT a single message buffer.

A parser MUST be modeled as a LONG-LIVED STREAM ENGINE
capable of processing multiple sequential messages.

This rule defines parser lifecycle states,
transitions, and reuse guarantees.

---

## 1. Core Principle

Parser lifetime ≠ Message lifetime.

A single parser instance MUST support:

    multiple HTTP messages
    sequential parsing
    persistent connections (keep-alive)

Parser MUST NOT assume input ends after one message.

---

## 2. Lifecycle Overview

Parser operates as a lifecycle state machine:

```

INIT
↓
READY
↓
PARSING
↓
MESSAGE_COMPLETE
↓
READY (next message)
↓
CLOSED / ERROR

```

Message completion MUST NOT destroy parser state.

---

## 3. Lifecycle States

### INIT

Parser created but not yet consuming input.

Requirements:

- internal state initialized
- buffers empty
- no message context exists

Transition:

INIT → READY

---

### READY

Parser prepared to receive a new message.

Requirements:

- framing state cleared
- message context reset
- cursor preserved

Allowed input:

- start-line bytes

Transition:

READY → PARSING

---

### PARSING

Parser actively consuming bytes.

Parser MUST:

- advance FSM states
- accumulate message structure
- resolve framing
- process body incrementally

Forbidden:

❌ resetting parser internally  
❌ allocating new parser instance

Transition:

PARSING → MESSAGE_COMPLETE

---

### MESSAGE_COMPLETE

One full HTTP message parsed successfully.

Parser MUST:

- expose parsed message
- stop consuming further bytes temporarily
- preserve remaining unread bytes

Parser MUST NOT automatically reset.

Consumer decides next action.

Allowed transitions:

MESSAGE_COMPLETE → READY  
MESSAGE_COMPLETE → CLOSED

---

### ERROR

Entered when invalid protocol input detected.

Requirements:

- parsing stops immediately
- further input rejected
- HttpError stored or thrown

Transition:

ERROR → CLOSED only.

---

### CLOSED

Parser permanently terminated.

No further parsing allowed.

---

## 4. Sequential Message Requirement

HTTP/1.1 connections MAY contain:

```

GET /a HTTP/1.1
...

GET /b HTTP/1.1
...

````

Parser MUST support back-to-back messages
within a single byte stream.

Remaining bytes after completion MUST be preserved.

Forbidden:

❌ discarding unread bytes  
❌ requiring new parser per message

---

## 5. Reset Semantics

Reset MUST be explicit.

Example API:

```ts
parser.nextMessage()
````

Reset MUST:

* clear message-specific state
* preserve transport continuity
* retain internal buffers

Forbidden:

❌ implicit reset during parsing
❌ hidden lifecycle transitions

---

## 6. Keep-Alive Awareness

Parser MUST remain reusable unless:

* Connection: close detected
* protocol error occurs
* transport closed externally

Connection semantics MUST NOT live inside FSM logic,
but lifecycle controller.

---

## 7. Streaming Integration

Parser lifecycle MUST tolerate:

* arbitrary chunk boundaries
* partial next-message arrival
* pipelined messages

Example valid input split:

```

[msg1-part][msg1-end][msg2-start]

```

Parser MUST:

* emit completion
* continue parsing remaining bytes after reset

---

## 8. Byte Ownership Across Lifecycle

Parser MUST NOT lose byte continuity
between messages.

Internal cursor MUST advance monotonically.

Remaining buffer belongs to NEXT lifecycle phase.

---

## 9. Completion Contract

Message completion MUST guarantee:

* framing satisfied
* FSM reached COMPLETE state
* no over-consumption occurred

Parser MUST stop EXACTLY at message boundary.

---

## 10. Adapter Responsibility Boundary

Lifecycle control responsibilities:

### Parser

* protocol correctness
* message boundaries
* parsing state

### Adapter (transport layer)

* socket lifecycle
* EOF signaling
* backpressure
* connection shutdown

Parser MUST NOT depend on transport APIs.

---

## 11. Error Lifecycle Behavior

On error:

* parser enters ERROR state
* parsing halts deterministically
* no recovery attempted

Recovery requires NEW parser instance.

---

## 12. AI Generation Constraints

AI-generated parsers MUST:

1. separate parser instance from message object
2. expose lifecycle transitions explicitly
3. avoid single-shot parse(buffer) APIs
4. support incremental consume()

Forbidden generation pattern:

```ts
parse(buffer): Message
```

Required pattern:

```ts
parser.consume(chunk)
parser.pollMessage()
parser.nextMessage()
```

---

## 13. Required Tests

Lifecycle tests MUST include:

* multiple messages in one buffer
* message boundary split across chunks
* pipelined messages
* reset correctness
* unread-byte preservation test
* keep-alive continuation

---

## 14. Architectural Invariant

Parser is a STREAM PROCESSOR.

Message is a TEMPORARY RESULT.

Never invert this relationship.

