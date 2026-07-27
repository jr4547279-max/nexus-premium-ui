---
name: Next build generated files
description: Environment-specific behavior of Next.js route type generation during local builds
---

Next.js 16 local builds can rewrite the generated route-reference import in next-env.d.ts from .next/dev/types/routes.d.ts to .next/types/routes.d.ts.

**Why:** The build and dev server use different generated route type locations, so a successful build can leave a tracked generated-file diff even when no source code changed.

**How to apply:** Treat this as generated state; verify the working tree after builds and avoid committing the generated import change unless the project intentionally standardizes on the production-generated path.
