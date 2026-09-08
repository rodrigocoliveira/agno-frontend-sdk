---
"@rodrigocoliveira/agno-hooks": patch
---

Fixed a still-running run reattached on page load (hydrate) never counting as `isBusy` and never being reachable by a no-arg `cancel()` — after a reload, a run you were actively watching stream showed a disabled Send button instead of Stop, and there was no way to cancel it until it finished on its own. A reattached run is now marked `local` exactly like a run started or manually resumed in this session, so it blocks new sends and can be cancelled the same way.
