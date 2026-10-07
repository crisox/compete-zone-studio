---
name: Omni speech timing
description: Why ten-second videos need a validated short spoken script, not only a duration instruction.
---

Do not solve clipped speech by padding the end of a video or truncating a narration string. Prepare one complete, short spoken script with the CTA included, and give Omni explicit narration and closing time.

**Why:** A user-reported video already measured ten seconds; the problem was the amount of spoken copy, not a short media file. A timed prompt alone leaves conflicting long narration and CTA text for Omni to resolve.

**How to apply:** Keep spoken phonetic domain expansion in the budget, preserve the meaning rather than removing the last words, and let on-screen copy carry any extra detail. Validate before requesting the paid video. The Google Interactions API reference checked in October 2026 exposes only `task` in `video_config`, not a numeric duration setting; do not invent unsupported duration fields.
