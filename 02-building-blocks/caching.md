# Caching

## Patterns
| Pattern | How | Trade-off |
|---|---|---|
| Cache-aside | App reads cache, on miss reads DB and fills cache | Simple; possible stale data |
| Read-through | Cache loads from DB on miss | Cache library must know DB |
| Write-through | Write to cache and DB synchronously | Consistent; slower writes |
| Write-behind | Write to cache, flush to DB async | Fast; risk of data loss |

## Eviction
LRU · LFU · FIFO · TTL

## Pitfalls
- **Thundering herd / stampede:** use request coalescing or locks.
- **Hot keys:** replicate the key or add local in-process cache.
- **Invalidation:** prefer TTL + explicit delete on write.
