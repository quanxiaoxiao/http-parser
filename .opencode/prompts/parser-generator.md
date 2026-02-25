# Parser Generator

Generate a protocol parser module.

## Input

- structure name
- RFC behavior description

## Output

1. types
2. parse function
3. predicates
4. tests

---

## Rules

- incremental parsing first
- never assume full buffer
- pure functions only
- throw HttpError on invalid input
