# Consistency Models

From strongest to weakest:

| Model | Guarantee |
|---|---|
| Linearizable | Every read sees the latest write, in real-time order |
| Sequential | All nodes see operations in the same order |
| Causal | Causally related operations seen in order |
| Read-your-writes | A client always sees its own writes |
| Eventual | Replicas converge if writes stop |

**Quorums:** with N replicas, write quorum W and read quorum R, `R + W > N` gives overlap so reads see the latest write.
