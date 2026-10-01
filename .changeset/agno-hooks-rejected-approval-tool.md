---
'@rodrigocoliveira/agno-hooks': patch
---

A tool behind a rejected `@approval` no longer reads as pending after the run continues. A rejected approval runs nothing, so no tool event reaches the stream, and a background continue's terminal event carries no `tools`: the run kept the tool exactly as it was at the pause. When a continue that skipped an approval-gated tool ends, the store now reads the run once and takes those tools from the server's copy (`confirmed: false`, `confirmation_note`).
