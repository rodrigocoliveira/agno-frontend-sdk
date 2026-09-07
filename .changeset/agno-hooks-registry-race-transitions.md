---
"@rodrigocoliveira/agno-hooks": patch
---

Fixed a second case of the same store-destroyed-before-use race, specifically when a route change (or any other React-scheduled low-priority update, such as one wrapped in `startTransition`) defers a component's commit past a single event-loop tick.
