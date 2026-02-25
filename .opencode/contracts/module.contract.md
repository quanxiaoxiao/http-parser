# Module Contract

Each protocol module must export:

## Required

- types
- main function
- predicate helpers (optional)
- tests

---

## Naming

decode:
  parseX()

encode:
  serializeX()

predicate:
  isX()

validate:
  validateX()

---

## Error Model

Must throw HttpError only.
