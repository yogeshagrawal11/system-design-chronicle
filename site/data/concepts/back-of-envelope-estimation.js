SD.concept({
  id: 'back-of-envelope-estimation',
  category: 'core',
  order: 10,
  icon: '🧮',
  title: 'Back-of-the-Envelope Estimation',
  tagline: 'Rough, fast arithmetic for QPS, storage, bandwidth and server counts, to know which problems are real.',
  summary:
    "Before drawing boxes, estimate the **scale**: how many requests per second, how much data per day, how much bandwidth, how many machines. The goal is not precision but the **order of magnitude**: is it 100 QPS (one server) or 1,000,000 QPS (a distributed system)? 10 GB (fits in RAM) or 10 PB (needs object storage and sharding)?\n\n" +
    "The method: write down assumptions, round aggressively to powers of ten, keep units on every number, compute average then **peak** (×2 to ×10), and sanity-check the result against what one machine can do. Five minutes of arithmetic often decides the architecture: whether you need caching, sharding, a CDN or a queue.",
  analogy:
    "Planning a road trip: you do not compute fuel to the millilitre. You think '800 km, about 8 L per 100 km, so ~64 L, call it two tanks, one fuel stop'. That rough answer is enough to decide whether to rent a car or take a plane.",
  sections: [
    {
      h: 'Numbers to memorize',
      md: "Powers of two map neatly onto powers of ten. Use the right column in interviews.",
      table: {
        headers: ['Power of 2', 'Exact value', '≈ Power of 10', 'Name'],
        rows: [
          ['2^10', '1,024', '10^3 (thousand)', '1 KB'],
          ['2^20', '1,048,576', '10^6 (million)', '1 MB'],
          ['2^30', '1,073,741,824', '10^9 (billion)', '1 GB'],
          ['2^40', '~1.1 x 10^12', '10^12 (trillion)', '1 TB'],
          ['2^50', '~1.1 x 10^15', '10^15 (quadrillion)', '1 PB'],
          ['2^32', '~4.3 billion', '4 x 10^9', 'Max unsigned 32-bit int / IPv4 addresses'],
          ['2^64', '~1.8 x 10^19', '18 quintillion', 'Max unsigned 64-bit int'],
        ],
      },
    },
    {
      h: 'Time and rate conversions',
      md: "The single most useful fact: **one day ≈ 86,400 s ≈ 10^5 s**. So 1 million events/day ≈ 12/s, and **1 billion/day ≈ 12,000/s**.",
      table: {
        headers: ['Per day', 'Per second (avg)', 'Typical peak (x2-x3)'],
        rows: [
          ['1 million', '~12', '~25-35'],
          ['10 million', '~115', '~250-350'],
          ['100 million', '~1,150', '~2,500-3,500'],
          ['1 billion', '~11,600', '~25,000-35,000'],
          ['10 billion', '~115,000', '~250,000-350,000'],
        ],
      },
      callout: { type: '', md: "Other handy ones: 1 month ≈ 2.6 M s (~2.5 x 10^6); 1 year ≈ 31.5 M s (~3 x 10^7); 1 Gbps ≈ 125 MB/s ≈ 10 TB/day." },
    },
    {
      h: 'What one machine can do (rough 2020s ceilings)',
      md: "Compare your estimate against these to decide how many machines you need. They vary 10x with workload, so treat them as starting points.",
      table: {
        headers: ['Component', 'Rough capacity per node', 'Notes'],
        rows: [
          ['Stateless web/API server', '1,000-10,000 req/s', 'Depends on work per request; 5k is a fair default'],
          ['NGINX serving static/proxy', '10,000-50,000+ req/s', 'Mostly network-bound'],
          ['Redis / Memcached', '100,000-1,000,000 ops/s', 'Single-threaded Redis ~100k+; pipelining raises it'],
          ['PostgreSQL / MySQL', '5,000-50,000 simple queries/s', 'Writes far lower than reads; joins much lower'],
          ['Kafka broker', '~100 MB/s-1 GB/s, ~1M msgs/s', 'Sequential disk + batching'],
          ['Cassandra node', '~10,000-50,000 writes/s', 'Write-optimized LSM tree'],
          ['RAM per server', '64-512 GB common', 'Up to TBs on large instances'],
          ['Network per server', '10-25 Gbps common', '100 Gbps on high-end'],
        ],
      },
    },
    {
      h: 'Worked example: a Twitter-like service',
      md: "**Assumptions** (state them out loud): 300 M monthly active users, 50% daily active → 150 M DAU. Each DAU posts 2 tweets/day and reads the timeline 20 times/day (20 tweets per load). 20% of tweets carry media averaging 500 KB. Tweet text + metadata ≈ 300 bytes. Keep data 5 years.\n\n**Write QPS**: 150 M x 2 = 300 M tweets/day ÷ 10^5 ≈ **3,000 writes/s**, peak ~6,000-10,000/s.\n\n**Read QPS**: 150 M x 20 = 3 B timeline loads/day ÷ 10^5 ≈ **30,000 reads/s**, peak ~60,000-100,000/s. Read:write = 10:1 → cache timelines aggressively.\n\n**Storage, text**: 300 M x 300 B = 90 GB/day → ~33 TB/year → **~165 TB in 5 years** (x3 replication ≈ 0.5 PB).\n\n**Storage, media**: 300 M x 20% x 500 KB = 30 TB/day → ~11 PB/year → **~55 PB in 5 years** → object storage + CDN, not a database.\n\n**Egress bandwidth**: suppose each timeline load fetches 2 media items at 200 KB (thumbnails). 3 B x 400 KB = 1.2 PB/day ÷ 10^5 ≈ **12 GB/s ≈ 100 Gbps** → CDN is mandatory.\n\n**Servers**: 100k peak reads/s ÷ 5k per server ≈ 20 API servers, round up to ~40-60 for headroom and AZ redundancy. Timeline cache: 150 M users x 800 tweet IDs x 8 B ≈ 1 TB of RAM → a Redis cluster of ~10-20 nodes.",
      callout: { type: 'good', md: "What the numbers told us: text fits comfortably in a sharded DB; media dominates storage by **300x** and must go to blob storage; bandwidth forces a CDN; reads dominate writes so precomputed, cached timelines are worth it. That is most of the architecture, decided by arithmetic." },
    },
    {
      h: 'Technique and common mistakes',
      md: "1. **Clarify and write assumptions** (DAU, actions per user, object sizes, retention).\n2. **Round to one significant figure** and powers of ten: 86,400 → 10^5, 2.6 M → 2.5 M.\n3. **Carry units** on every line; most errors are bits vs bytes or per-day vs per-second.\n4. **Compute average, then peak** (x2-x3 for typical consumer apps, x10+ for flash sales or live events).\n5. **Add overheads**: replication (x3), indexes (+20-50%), headroom (run at 50-70%).\n6. **Sanity-check** against single-machine limits and real-world numbers (Twitter actually sees ~6,000 tweets/s on average).\n\nMistakes to avoid: using registered users instead of DAU, forgetting replication, confusing Gbps with GB/s (8x), and spending 15 minutes on arithmetic that does not change any design decision.",
    },
  ],
  sims: ['estimator'],
  compare: {
    title: 'Handy object sizes',
    headers: ['Object', 'Typical size'],
    rows: [
      ['UUID / 128-bit ID', '16 bytes (36 as text)'],
      ['64-bit ID / timestamp', '8 bytes'],
      ['Tweet / short message with metadata', '~300 B - 1 KB'],
      ['JSON API response', '1-50 KB'],
      ['Web page (HTML only)', '~50-100 KB'],
      ['Compressed photo (phone)', '200 KB - 3 MB'],
      ['1 minute of 1080p video', '~50-100 MB'],
      ['1 minute of audio (128 kbps)', '~1 MB'],
    ],
  },
  keyPoints: [
    '1 day ≈ 10^5 seconds; 1 M/day ≈ 12/s; 1 B/day ≈ 12k/s.',
    '2^10 ≈ 10^3: KB, MB, GB, TB, PB step by 1,000.',
    'Estimate average, then peak; then add replication and headroom.',
    'Compare with single-machine capacity to count servers.',
    'Aim for order-of-magnitude correctness, and let the numbers drive design choices.',
  ],
  pitfalls: [
    'Using total registered users as active users.',
    'Mixing bits and bytes, or days and seconds.',
    'Forgetting peak traffic: designing for the average means falling over every evening.',
    'Ignoring replication and index overhead in storage estimates.',
    'False precision: 3,472.2 QPS implies accuracy you do not have; say ~3.5k.',
  ],
  realWorld: [
    '**Jeff Dean** popularized this style of estimation at Google, alongside the latency numbers table.',
    '**Twitter** has reported averages around 6,000 tweets/s with record peaks above 140,000/s (2013 Castle in the Sky airing): peaks can be 20x+ the average.',
    '**WhatsApp** handled ~100 B messages/day in 2020, about 1.2 M messages/s on average.',
  ],
  related: ['latency-throughput-bandwidth', 'scalability', 'database-sharding', 'cdn', 'caching-101'],
  quiz: [
    { q: 'A service receives 500 million requests per day. What is the approximate average QPS?', options: ['~600', '~6,000', '~60,000', '~500,000'], answer: 1, explain: '500 M ÷ ~86,400 s ≈ 5,800, roughly 6,000 req/s.' },
    { q: 'Users upload 10 M photos/day at 2 MB each. Roughly how much new storage per year before replication?', options: ['~7 TB', '~70 TB', '~7 PB', '~70 PB'], answer: 2, explain: '10 M x 2 MB = 20 TB/day; x 365 ≈ 7.3 PB/year.' },
    { q: 'You estimate 40,000 peak QPS and one API server handles ~4,000 QPS. How many servers should you plan for?', options: ['10 exactly', 'About 15-20, to allow headroom and AZ failure', '4', '400'], answer: 1, explain: '10 is the bare minimum at 100% utilization. Running at ~60% and surviving an AZ loss pushes you to 15-20.' },
    { q: 'A link is 10 Gbps. About how many bytes per second can it carry at most?', options: ['10 GB/s', '1.25 GB/s', '80 GB/s', '125 MB/s'], answer: 1, explain: 'Divide bits by 8: 10 Gb/s ÷ 8 = 1.25 GB/s.' },
  ],
  references: [
    { title: 'Jeff Dean: Designs, Lessons and Advice from Building Large Distributed Systems', url: 'https://www.cs.cornell.edu/projects/ladis2009/talks/dean-keynote-ladis2009.pdf' },
    { title: 'Twitter Engineering: New Tweets per second record', url: 'https://blog.twitter.com/engineering/en_us/a/2013/new-tweets-per-second-record-and-how' },
  ],
});
