# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# project-setup
- Provide a single entry point (Makefile at root) for non-technical users. Confidence: 1
- Setup and installation must be fully automated with zero manual interruption. Confidence: 1

# workflow
- Index and analyze the entire relevant codebase to fully understand the problem before attempting to write or suggest a solution. Confidence: 1
- Do not restart the dev server; it's already running and changes are picked up automatically after rebuilding. Confidence: 0.65
- When building features incrementally, work on a single development instance (avoid separate dev+test environments) — changes are tested on the same live data. Confidence: 0.85
- For complex debugging/troubleshooting issues, step back and formulate a clear, structured plan with rationale before making any changes — avoid scattered incremental attempts. Confidence: 0.90
- Write comments that explain the intent behind the code, never the implementation details; if the implementation is hard to explain, it must be refactored. Confidence: 0.95
- Use a "react/" prefix for Git branch names when working on the React architecture (not "feature/"), and never push React architecture branches to main. Confidence: 0.75

# python-tooling
- Apply formatting and linting changes only to files that have been modified, rather than formatting the entire project blindly. Confidence: 0.90
- Enforce project-standard formatting using Black (88-character limit) and Ruff for quick fixes. Confidence: 1
- Treat Flake8 static analysis as a blocker: fix all issues before committing and never ignore warnings. Confidence: 1

# code-structure
- Enforce a hard limit of 300 lines per file; immediately split exceeding files into smaller, domain-specific modules. Confidence: 1
- Keep functions small, unit-testable, and strictly adhering to the Single Responsibility Principle. Confidence: 0.95
- Use descriptive, verb-noun naming conventions (e.g., `load_config_file()`) and strictly avoid vague variable names like `data`, `temp`, `info`, or `util`. Confidence: 1
- Prefer dependency injection over internal imports or global state management. Confidence: 0.85

# code-patterns
- Design code to be explicit, flat, and sparse rather than implicit, nested, and dense (adhere to the Zen of Python philosophy). Confidence: 0.85
- Maintain strict separation of concerns and clear boundaries between Data, Business Logic, and I/O layers. Confidence: 0.95
- Favor composition over inheritance, and implement design patterns (Factory, Builder, Strategy) only when they measurably simplify the code. Confidence: 0.90
- Reuse existing rate-limiting, anti-ban, and broadcast infrastructure instead of building ad-specific duplication. Confidence: 0.65

# error-handling
- Never let errors pass silently unless they are explicitly caught, silenced, and documented. Confidence: 1
- Show user-friendly messages for internal token errors (e.g. WhatsApp tokens) instead of cryptic technical error messages like "invalid or expired token". Confidence: 1
- Implement a global error banner mechanism across all components that shows human-readable messages without trace or technical details in non-debugging mode. Confidence: 0.85
- Gracefully degrade on failure — isolate errors to the individual feature so one component crashing doesn't bring down the entire app. Confidence: 1

# loading-states
- Use real component-specific skeletons and spinners for all async operations, not generic/fake loading indicators — e.g., show a skeleton of the QR code with a spinner overlay while session is initializing. Confidence: 1

# ui-ux
- Apply the 60/30/10 rule for color distribution (Neutral/Surface/Accent) strictly using semantic tokens (e.g., `bg-default`, `accent-primary`). Confidence: 0.90
- Ensure WCAG AA/AAA compliance by never relying on color alone to convey meaning, status, or state. Confidence: 1
- Adhere strictly to an 8-point spatial system (8px, 16px, 24px) and align all layouts to a baseline grid. Confidence: 0.95
- Limit typography to a focused scale: approximately 4 core sizes and 2 primary weights (Regular, SemiBold). Confidence: 0.85
- Use specific, action-oriented microcopy for interactive elements (e.g., "Save changes" instead of "Submit"). Confidence: 0.95

# architecture
- Think in systems rather than isolated features, prioritizing overall maintainability and minimal cognitive load. Confidence: 0.95
- Prefer a single Docker container deployment that bundles all services together under one roof. Confidence: 0.87
- Fix issues permanently at the source (Dockerfile, setup scripts, config) rather than applying temporary runtime patches to running containers. Confidence: 0.90
- WA_Automation UI is the primary customer-facing interface; OpenWA serves as the internal engine/API layer not directly exposed to users. Confidence: 0.80
- Before implementing major architectural changes, present the plan for user approval first and ask clarifying questions. Confidence: 1
- Use only React (no Django/Python) in the tech stack; use OpenWA's Bull MQ instead of Celery for task queuing. Confidence: 0.85
- Leverage OpenWA's built-in Redis and BullMQ instead of adding redundant separate services. Confidence: 0.65
- When dealing with undocumented features, explore iteratively (try, fail, refine) within the actual capabilities of the underlying OpenWA engine rather than hacking/patching around it. Confidence: 0.70
- For ngrok in docker-compose, conditionally include `--url=${NGROK_URL:-}` in the command when NGROK_URL is set in .env. Confidence: 0.65
