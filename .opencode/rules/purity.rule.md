# Purity Rule

Core parsing logic MUST be pure.

## Required

- deterministic output
- no global state
- no hidden mutation
- input → output only

---

## Allowed Side Effects

ONLY inside:

- stream-pipeline.ts
- external adapters

---

## Forbidden

❌ Date.now()
❌ random values
❌ IO operations
❌ shared mutable cache
