# Rate Limiting

| Algorithm | Notes |
|---|---|
| Token bucket | Allows bursts; most common (AWS API Gateway) |
| Leaky bucket | Smooth constant output rate |
| Fixed window counter | Simple; burst at window edges |
| Sliding window log | Accurate; memory heavy |
| Sliding window counter | Good approximation, low memory |

Distributed: store counters in Redis with atomic ops (INCR + EXPIRE or Lua). Return `429` with `Retry-After`.
