# Message Queues

Decouple producers and consumers, absorb spikes, enable async work.

| | Queue (SQS, RabbitMQ) | Log (Kafka, Kinesis) |
|---|---|---|
| Consumption | Message deleted after ack | Retained; consumers track offsets |
| Replay | No | Yes |
| Ordering | Best effort / FIFO queues | Per partition |

## Delivery semantics
At-most-once · At-least-once (most common — make consumers **idempotent**) · Exactly-once (costly)

Use a **dead-letter queue** for poison messages.
