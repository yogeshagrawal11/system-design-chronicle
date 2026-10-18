# Databases & Sharding

## SQL vs NoSQL
| | SQL | NoSQL |
|---|---|---|
| Schema | Fixed | Flexible |
| Transactions | ACID | Often limited / per-item |
| Scaling | Vertical + read replicas; sharding is manual | Built-in horizontal |
| Good for | Relations, complex queries | High scale, simple access patterns |

## Replication
Leader–follower · Multi-leader · Leaderless (quorum)

## Sharding strategies
- **Range:** easy range scans; risk of hot spots.
- **Hash:** even distribution; range queries are hard.
- **Directory:** lookup service maps key → shard; flexible but extra hop.

Re-sharding pain → use consistent hashing or many virtual shards.
