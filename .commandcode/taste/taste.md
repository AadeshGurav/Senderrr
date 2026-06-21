# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# project-setup
- Provide a single entry point (Makefile at root) for non-technical users. Confidence: 1
- Setup and installation must be fully automated with zero manual interruption. Confidence: 1

# workflow
- Do not restart the dev server; it's already running and changes are picked up automatically after rebuilding. Confidence: 0.65
- For complex debugging/troubleshooting issues, step back and formulate a clear, structured plan with rationale before making any changes — avoid scattered incremental attempts. Confidence: 0.90
- Use a "react/" prefix for Git branch names when working on the React architecture (not "feature/"), and never push React architecture branches to main. Confidence: 0.65

# error-handling
- Show user-friendly messages for internal token errors (e.g. WhatsApp tokens) instead of cryptic technical error messages like "invalid or expired token". Confidence: 1
- Implement a global error banner mechanism across all components that shows human-readable messages without trace or technical details in non-debugging mode. Confidence: 0.85
- Gracefully degrade on failure — isolate errors to the individual feature so one component crashing doesn't bring down the entire app. Confidence: 1

# loading-states
- Use real component-specific skeletons and spinners for all async operations, not generic/fake loading indicators — e.g., show a skeleton of the QR code with a spinner overlay while session is initializing. Confidence: 1

# infrastructure
- Fix issues permanently at the source (Dockerfile, setup scripts, config) rather than applying temporary runtime patches to running containers. Confidence: 0.90

# architecture
- Prefer a single Docker container deployment that bundles all services together under one roof. Confidence: 0.85
- WA_Automation UI is the primary customer-facing interface; OpenWA serves as the internal engine/API layer not directly exposed to users. Confidence: 0.80
- Before implementing major architectural changes, present the plan for user approval first and ask clarifying questions. Confidence: 1
- Use only React (no Django/Python) in the tech stack; use OpenWA's Bull MQ instead of Celery for task queuing. Confidence: 0.85
- Leverage OpenWA's built-in Redis and BullMQ instead of adding redundant separate services. Confidence: 0.65

