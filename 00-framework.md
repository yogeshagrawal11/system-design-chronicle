# System Design Framework

A repeatable approach for a 45–60 minute design discussion.

| Step | Time | Goal |
|---|---|---|
| 1. Requirements | 5–10 min | Functional + non-functional; agree on scope |
| 2. Estimation | 5 min | QPS, storage, bandwidth, read/write ratio |
| 3. API design | 5 min | Core endpoints / interfaces |
| 4. Data model | 5 min | Entities, access patterns, DB choice |
| 5. High-level design | 10–15 min | Boxes and arrows covering the happy path |
| 6. Deep dives | 10–15 min | Bottlenecks, scaling, failure modes |
| 7. Wrap-up | 5 min | Trade-offs, monitoring, future work |

## 1. Requirements checklist
- **Functional:** What must users be able to do? What is explicitly out of scope?
- **Non-functional:** Scale (DAU), latency targets, availability (99.9 vs 99.99), consistency, durability, security/privacy.

## 6. Deep-dive prompts
- Where is the single point of failure?
- What happens at 10x traffic? Which component breaks first?
- Hot keys / celebrity problem?
- How is data replicated, and what happens during a partition?
- How do we observe it (metrics, logs, traces, alerts)?
