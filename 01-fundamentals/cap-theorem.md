# CAP & PACELC

**CAP:** during a network **P**artition, a distributed system must choose **C**onsistency or **A**vailability.

| Choice | Behavior during partition | Examples |
|---|---|---|
| CP | Rejects/blocks requests to stay consistent | ZooKeeper, etcd, HBase |
| AP | Serves possibly stale data | Cassandra, DynamoDB (default), Riak |

**PACELC:** if **P**artition → choose **A** or **C**; **E**lse → choose **L**atency or **C**onsistency.
Most real trade-offs happen in the "Else" case (normal operation).
