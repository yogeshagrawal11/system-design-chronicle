# Scalability

**Vertical scaling** — bigger machine. Simple, but has a hard ceiling and a single point of failure.
**Horizontal scaling** — more machines. Requires stateless services, load balancing, and data partitioning.

## Key techniques
- Keep app servers **stateless**; move session state to a shared store (Redis) or tokens (JWT).
- **Replicate** for read scaling and availability; **shard** for write scaling and storage.
- **Cache** at every layer: client, CDN, app, database.
- **Async processing** with queues to absorb spikes.

## Latency vs throughput
- Latency: time for one request. Throughput: requests per unit time.
- Optimize p99, not just average.
