# Rule Audit Checklist

## Protocol

- [ ] RFC aware rule satisfied
- [ ] start-line validated correctly
- [ ] header parsing compliant

## State Machine

- [ ] explicit states exist
- [ ] deterministic transitions
- [ ] resumable parsing

## Streaming

- [ ] chunk-safe parsing
- [ ] no full-buffer assumptions

## Performance

- [ ] no unnecessary buffer copies
- [ ] incremental consumption

