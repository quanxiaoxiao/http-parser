# Rule Audit

Audit the provided code against ALL project rules.

## Context

This repository follows strict protocol-engine rules.

You MUST load and apply:

- all files under `.opencode/rules/`
- all files under `.opencode/contracts/`
- all files under `.opencode/checklists/`

Rules have higher priority than implementation.

---

## Task

Analyze the given files and evaluate:

1. rule compliance
2. architectural violations
3. protocol correctness risks
4. streaming safety
5. state machine correctness

---

## Output Format

### ✅ Passed Rules
list rules satisfied

### ⚠️ Warnings
non-breaking issues

### ❌ Violations
rule name + explanation + location

### 🔧 Fix Suggestions
minimal changes required

### Risk Level
LOW | MEDIUM | HIGH | CRITICAL

---

## Important

Do NOT rewrite code.

Only audit.

