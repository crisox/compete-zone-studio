---
name: Preview instrumentation
description: TypeScript-valid JSX patterns that can fail in the instrumented Replit preview.
---

Avoid explicit generic type arguments on JSX component tags in the instrumented web preview.

**Why:** Replit's component metadata transform inserted attributes before the type arguments, producing invalid JSX even though TypeScript accepted the source.

**How to apply:** Prefer inferred props, typed option arrays, or typed callback wrappers. Check the rendered preview after compiler validation; compiler success alone cannot catch this transform failure.
