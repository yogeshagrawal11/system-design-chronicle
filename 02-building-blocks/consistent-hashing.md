# Consistent Hashing

Map both nodes and keys onto a hash ring; a key belongs to the first node clockwise.

- Adding/removing a node moves only ~K/N keys instead of nearly all.
- **Virtual nodes** (many points per server) smooth out load imbalance.

```mermaid
flowchart LR
    K1((key A)) --> N1[Node 1]
    K2((key B)) --> N2[Node 2]
    K3((key C)) --> N3[Node 3]
```

Used in: DynamoDB, Cassandra, CDNs, distributed caches.
