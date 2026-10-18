SD.concept({
  id: 'latency-throughput-bandwidth',
  category: 'core',
  order: 5,
  icon: '⏱️',
  title: 'Latency, Throughput & Bandwidth',
  tagline: 'How long one request takes, how many get done per second, and how much the pipe can carry.',
  summary:
    "Three performance numbers that are constantly confused:\n\n- **Latency**: the time for one operation to complete (ms, µs). Users feel this.\n- **Throughput**: how much work actually gets done per unit time (requests/s, MB/s). The business pays for this.\n- **Bandwidth**: the *maximum* data rate a link or device can carry (Gbps). Throughput is always ≤ bandwidth.\n\n" +
    "They interact but do not move together. Adding bandwidth does not make a small API call faster, batching raises throughput while adding latency, and running a server near 100% utilization maximizes throughput at the cost of exploding queueing latency. Good designs state targets for both, e.g. *p99 < 200 ms at 20k req/s*.",
  analogy:
    "A highway. **Bandwidth** is the number of lanes. **Throughput** is how many cars actually pass a point per hour (fewer than the lanes could carry if there is an accident or a toll booth). **Latency** is how long your one car takes to get from A to B. Adding lanes does not make your car go faster, it just lets more cars travel at once.",
  sections: [
    {
      h: 'Where latency comes from',
      md: "Network latency has four parts:\n\n- **Propagation**: distance / speed of light in fiber (~200,000 km/s, so ~5 µs per km). New York ↔ London (5,600 km) is ≥ 28 ms one way, ~56 ms round trip, and no amount of engineering beats it.\n- **Transmission**: size / bandwidth. 1 MB over 100 Mbps = 80 ms.\n- **Queuing**: waiting in router, NIC or server queues. Grows sharply with utilization.\n- **Processing**: parsing, TLS crypto, app logic, DB queries.\n\nA fresh HTTPS request also pays for setup: DNS lookup (0-100 ms), TCP handshake (1 RTT), TLS 1.3 handshake (1 RTT; TLS 1.2 needs 2), and only then the request itself. That is why connection reuse, keep-alive and CDNs (which shrink RTT) matter so much.",
    },
    {
      h: 'Latency numbers every programmer should know',
      md: "Approximate modern figures (popularized by Jeff Dean and Peter Norvig, updated for current hardware). Learn the **orders of magnitude**, not the digits: memory is ~100x faster than SSD, SSD ~100x faster than a cross-continent round trip.",
      table: {
        headers: ['Operation', 'Time', 'Scaled: if 1 ns = 1 s'],
        rows: [
          ['L1 cache reference', '~1 ns', '1 second'],
          ['Branch mispredict', '~3 ns', '3 seconds'],
          ['L2 cache reference', '~4 ns', '4 seconds'],
          ['Mutex lock/unlock (uncontended)', '~17 ns', '17 seconds'],
          ['Main memory reference', '~100 ns', '1.7 minutes'],
          ['Compress 1 KB (Snappy/LZ4)', '~2 µs', '33 minutes'],
          ['Send 1 KB over 10 Gbps network', '~1 µs', '17 minutes'],
          ['Read 1 MB sequentially from RAM', '~3 µs', '50 minutes'],
          ['Random 4 KB read from NVMe SSD', '~20-100 µs', '6-28 hours'],
          ['Read 1 MB sequentially from NVMe SSD', '~100-300 µs', '1-3.5 days'],
          ['Round trip within same data center', '~500 µs', '5.8 days'],
          ['Redis GET over the network (same AZ)', '~0.5-1 ms', '6-12 days'],
          ['HDD disk seek', '~5-10 ms', '2-4 months'],
          ['Read 1 MB sequentially from HDD', '~5 ms', '2 months'],
          ['Round trip US East ↔ US West', '~65 ms', '2 years'],
          ['Round trip US ↔ Europe', '~80-100 ms', '2.5-3 years'],
          ['Round trip US ↔ Australia/India', '~150-250 ms', '5-8 years'],
        ],
      },
      callout: { type: 'good', md: "Rules of thumb: a page that makes **10 sequential cross-region calls** spends a full second in transit. A tight loop calling Redis 1,000 times costs ~1 s; a single `MGET` costs ~1 ms. **Round trips, not CPU, dominate most web latency.**" },
    },
    {
      h: 'Measure with percentiles, not averages',
      md: "Latency distributions have long tails (GC pauses, cache misses, retransmits, noisy neighbours). If 98 requests take 50 ms and 2 take 2 s, the average is 89 ms, which describes nobody. Use **p50** (typical), **p95/p99** (bad-but-common) and **p99.9** (worst regular case).\n\nTails matter more than they seem because of **fan-out**: if a page calls 100 backends in parallel and each has a 1% chance of being slow, then `1 - 0.99^100 ≈ 63%` of page loads hit at least one slow call. Your p99 backend latency becomes your *median* page latency. Mitigations: hedged requests, timeouts, fewer dependencies.",
    },
    {
      h: 'Bandwidth, throughput and how they combine with latency',
      md: "Bandwidth is quoted in **bits**/s, files in **bytes**: 1 Gbps ≈ 125 MB/s at best. Rough device ceilings: NIC 10-100 Gbps, SATA SSD ~550 MB/s, NVMe SSD 3-7 GB/s, RAM 20-50 GB/s per channel set.\n\n`transfer time ≈ latency + size / bandwidth`\n\n- A 1 KB API call over 1 Gbps with 50 ms RTT: 8 µs transmitting, 50 ms waiting → **latency-bound**. More bandwidth does nothing.\n- A 10 GB backup over the same link: ~80 s transmitting → **bandwidth-bound**. Lower RTT does little.\n\nTCP also needs `bandwidth x RTT` bytes in flight to fill a link (the **bandwidth-delay product**). At 1 Gbps and 100 ms RTT that is 12.5 MB; with a small window you get a fraction of the link no matter how fat it is.",
      table: {
        headers: ['Workload', 'Dominant metric', 'Levers'],
        rows: [
          ['Trading, multiplayer games, VoIP', 'Latency (and jitter)', 'Co-location, UDP, fewer hops'],
          ['Typical web/mobile API', 'p99 latency at a target RPS', 'Caching, CDNs, connection reuse, fewer round trips'],
          ['Video streaming, large downloads', 'Bandwidth / throughput', 'CDN, adaptive bitrate, compression'],
          ['ETL, backups, log shipping', 'Throughput', 'Batching, parallelism, compression'],
        ],
      },
    },
    {
      h: "Little's Law and the utilization trap",
      md: "**Little's Law**: `concurrency = throughput x latency`. A service handling 2,000 req/s at 50 ms has ~100 requests in flight. If a dependency slows to 500 ms, you need 1,000 concurrent slots to keep 2,000 req/s; with a 200-thread pool, throughput collapses to 400 req/s and a queue builds. This is how one slow database turns into a site-wide outage.\n\nQueueing theory (M/M/1) says wait time grows like `ρ / (1 - ρ)` with utilization ρ: at 50% busy you wait ~1x the service time, at 80% ~4x, at 90% ~9x, at 95% ~19x. That is why latency-sensitive services target 50-70% utilization, and why batching (Kafka `linger.ms`, DB group commit) is a deliberate trade of latency for throughput.",
    },
  ],
  diagram: {
    intro: "Where the milliseconds go in a first HTTPS request from Europe to a US origin, versus via a nearby CDN edge.",
    nodes: [
      { id: 'browser', label: 'Browser', sub: 'Frankfurt', type: 'client', col: 0, row: 1, desc: 'Starts with no cached DNS and no open connection.' },
      { id: 'dns', label: 'DNS Resolver', type: 'dns', col: 1, row: 0, desc: 'Recursive resolver at the ISP. Cached answers cost ~1-5 ms; a cold lookup can cost 50-100 ms.' },
      { id: 'edge', label: 'CDN Edge', sub: 'Frankfurt, ~10 ms RTT', type: 'cdn', col: 2, row: 2, desc: 'Terminates TCP+TLS close to the user so handshakes cost a short RTT, then reuses a warm long-haul connection to the origin.', tech: ['CloudFront', 'Fastly'] },
      { id: 'origin', label: 'Origin Server', sub: 'Virginia, ~90 ms RTT', type: 'service', col: 4, row: 1, desc: 'App logic, typically 5-50 ms of processing.' },
      { id: 'db', label: 'Database', type: 'db', col: 5, row: 1, desc: 'Same-AZ query: ~0.5 ms network + query time. N+1 queries multiply this.' },
    ],
    edges: [
      { from: 'browser', to: 'dns', label: 'lookup' },
      { from: 'browser', to: 'origin', label: 'direct: 90 ms RTT' },
      { from: 'browser', to: 'edge', label: '10 ms RTT' },
      { from: 'edge', to: 'origin', label: 'warm conn' },
      { from: 'origin', to: 'db', label: '~1 ms' },
    ],
    flows: [
      {
        id: 'direct', name: 'Direct to origin (~400 ms)',
        steps: [
          { from: 'browser', to: 'dns', text: 'DNS lookup: ~30 ms (resolver cache miss on the authoritative side).' },
          { from: 'browser', to: 'origin', text: 'TCP SYN / SYN-ACK: 1 RTT = 90 ms.' },
          { from: 'origin', to: 'browser', text: 'TLS 1.3 handshake: another RTT = 90 ms.' },
          { from: 'browser', to: 'origin', text: 'Send `GET /api/feed`: half an RTT to arrive (45 ms).' },
          { from: 'origin', to: 'db', text: 'App runs 3 sequential queries (3 ms) plus 20 ms of processing.' },
          { from: 'origin', to: 'browser', text: 'Response travels back: 45 ms, plus transmission time. Total ≈ 330-400 ms, mostly speed of light.' },
        ],
      },
      {
        id: 'cdn', name: 'Via nearby CDN edge (~150 ms)',
        steps: [
          { from: 'browser', to: 'dns', text: 'DNS returns the nearest edge (GeoDNS/anycast): ~10 ms.' },
          { from: 'browser', to: 'edge', text: 'TCP + TLS handshakes with the edge: 2 x 10 ms = 20 ms.' },
          { at: 'edge', text: 'If the response is cacheable and cached, return now: total ≈ 40 ms.' },
          { from: 'edge', to: 'origin', text: 'Otherwise forward over an already-open, tuned connection to the origin: one 90 ms RTT, no handshakes.' },
          { from: 'origin', to: 'db', text: 'Same ~23 ms of backend work.' },
          { from: 'edge', to: 'browser', text: 'Edge relays the response. Total ≈ 150 ms, less than half of direct.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Latency = time per operation; throughput = operations per second; bandwidth = maximum capacity.',
    'Round trips and distance dominate web latency; you cannot beat the speed of light, only shorten the path.',
    'Report p50/p95/p99, never just averages; fan-out turns backend tails into user medians.',
    "Little's Law: concurrency = throughput x latency. Slow dependencies exhaust pools.",
    'Utilization above ~70-80% makes queueing latency explode.',
  ],
  pitfalls: [
    'Buying bandwidth to fix a latency problem caused by too many round trips.',
    'Mixing up bits and bytes (Gbps vs GB/s): an 8x error.',
    'N+1 query patterns: 100 sequential 1 ms DB calls = 100 ms.',
    'Benchmarking throughput without watching tail latency; the system looks fine until users complain.',
    'No timeouts: one slow dependency ties up every thread.',
  ],
  realWorld: [
    '**Amazon** found that every 100 ms of extra latency cost about 1% of sales; **Google** saw fewer searches when results slowed by 400 ms.',
    "**Google's 'The Tail at Scale'** paper popularized hedged requests: send a backup request after the p95 latency and take whichever returns first.",
    'High-frequency traders paid for microwave links between Chicago and New York because they beat fiber by a few milliseconds.',
    '**Kafka** producers batch records (`linger.ms`, `batch.size`) to push millions of messages/s per broker, trading a few ms of latency for throughput.',
  ],
  related: ['back-of-envelope-estimation', 'cdn', 'caching-101', 'tcp-vs-udp', 'http-https', 'batch-vs-stream-processing'],
  quiz: [
    { q: 'An API returns 2 KB responses and users in Asia see 600 ms latency to a US server. Which change helps most?', options: ['Upgrade the server NIC from 1 Gbps to 10 Gbps', 'Serve from a region or edge close to Asia and reuse connections', 'Compress the 2 KB response', 'Add more CPU cores'], answer: 1, explain: 'A 2 KB transfer is latency-bound; time is spent on long round trips and handshakes. Reducing distance and handshakes is the lever.' },
    { q: 'A service handles 1,000 req/s at 20 ms average latency. Roughly how many requests are in flight at once?', options: ['20', '50', '1,000', '20,000'], answer: 0, explain: "Little's Law: 1,000 req/s x 0.02 s = 20 concurrent requests." },
    { q: 'A page fans out to 50 backends in parallel; each has p99 = 1 s and p50 = 10 ms. Roughly what fraction of page loads wait ~1 s?', options: ['1%', '~5%', '~40%', '99%'], answer: 2, explain: '1 - 0.99^50 ≈ 0.39. With fan-out, rare per-call tails become common page-level delays.' },
    { q: 'Why do latency-sensitive services usually run at 50-70% CPU rather than 95%?', options: ['To save power', 'Queueing delay grows non-linearly as utilization approaches 100%', 'Load balancers require it', 'CPUs throttle above 70%'], answer: 1, explain: 'Wait time grows roughly like ρ/(1-ρ): about 4x service time at 80%, 19x at 95%.' },
    { q: 'You transfer 10 GB over a 1 Gbps link with 50 ms RTT. Which dominates the total time?', options: ['Latency (50 ms)', 'Transmission time (~80 s)', 'DNS lookup', 'TLS handshake'], answer: 1, explain: '10 GB = 80 Gb; at 1 Gb/s that is 80 s. Bulk transfers are bandwidth-bound.' },
  ],
  references: [
    { title: 'AlgoMaster: Latency vs Throughput', url: 'https://algomaster.io/learn/system-design/latency-vs-throughput' },
    { title: 'Latency Numbers Every Programmer Should Know (interactive)', url: 'https://colin-scott.github.io/personal_website/research/interactive_latency.html' },
    { title: 'Dean & Barroso: The Tail at Scale (CACM 2013)', url: 'https://research.google/pubs/the-tail-at-scale/' },
  ],
});
