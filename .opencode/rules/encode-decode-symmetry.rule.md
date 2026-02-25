# Encode Decode Symmetry Rule

Every structure that can be decoded
SHOULD be encodable back.

decode(X) → Y
encode(Y) ≈ X

---

## Requirements

- field names preserved
- header normalization reversible
- body length consistent
- start-line equivalent

---

## Tests Required

roundtrip test must exist:

decode → encode → decode
