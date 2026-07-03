# workflow
- Use `caffeinate` (macOS) when starting Docker containers via `docker compose up` to prevent the system from sleeping during the process. Confidence: 0.85
- Index and analyze the entire relevant codebase to fully understand the problem before attempting to write or suggest a solution. Confidence: 1
- Do not restart the dev server; it's already running and changes are picked up automatically after rebuilding. Confidence: 0.65
- When building features incrementally, work on a single development instance (avoid separate dev+test environments) — changes are tested on the same live data. Confidence: 0.85
- For complex debugging/troubleshooting issues, step back and formulate a clear, structured plan with rationale before making any changes — avoid scattered incremental attempts. Confidence: 0.90
- Write comments that explain the intent behind the code, never the implementation details; if the implementation is hard to explain, it must be refactored. Confidence: 0.95
- Use a "react/" prefix for Git branch names when working on the React architecture (not "feature/"), and never push React architecture branches to main. Confidence: 0.75
