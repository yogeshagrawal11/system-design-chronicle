# Back-of-the-Envelope Estimation

## Handy numbers
| Quantity | Value |
|---|---|
| Seconds per day | ~86,400 ≈ 10^5 |
| 1M req/day | ~12 QPS |
| 1B req/day | ~12K QPS |
| Peak factor | 2–5x average |

## Latency (approx.)
| Operation | Time |
|---|---|
| L1 cache | 1 ns |
| Main memory | 100 ns |
| SSD random read | 100 µs |
| Round trip same DC | 0.5 ms |
| HDD seek | 10 ms |
| Round trip cross-continent | 150 ms |

## Recipe
1. DAU × actions/user/day → requests/day → ÷ 10^5 → QPS.
2. Writes/day × object size × retention → storage.
3. QPS × response size → bandwidth.
