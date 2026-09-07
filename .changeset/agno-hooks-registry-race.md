---
"@rodrigocoliveira/agno-hooks": patch
---

Fixed a race where a freshly-created store could be destroyed before it was retained, breaking the first send on a new session in some browsers.
