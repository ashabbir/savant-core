---
id: rules.infra.k8s
type: rule
tags: [infra, k8s]
priority: 905
includes: []
---
- Resource requests/limits required; liveness/readiness probes mandatory.
- Use ConfigMaps/Secrets; no credentials in images/env.
- Deploy with rolling updates; define PodDisruptionBudgets.

