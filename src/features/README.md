# Feature boundaries

Application capabilities belong in feature-oriented modules under this directory.
Presentation components should consume typed feature interfaces; they must not
implement signing, key management, RPC access, authorization policy, or agent
execution themselves.

No feature logic is initialized in Phase 0.
