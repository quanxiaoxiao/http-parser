# Protocol Boundary Rule

This project implements HTTP wire protocol logic.

All modules MUST follow protocol layering.

---

## Layers

decode/
  parses raw bytes → structured data

encode/
  serializes structured data → bytes

headers/
  RFC header semantics

message/
  HTTP message abstraction

utils/
  validation helpers only

---

## Forbidden

❌ decode importing encode
❌ encode importing decode
❌ business logic inside utils
❌ mutation of parsed input

---

## Rule

Each layer moves data ONE direction only.
