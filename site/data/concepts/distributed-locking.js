SD.concept({
  id: 'distributed-locking',
  category: 'distributed',
  order: 4,
  icon: '🔒',
  title: 'Distributed Locking',
  tagline: 'Mutual exclusion across machines — why every lock must be a lease, and why leases are unsafe without fencing tokens.',
  summary:
    "A **distributed lock** ensures only one process across a fleet does something at a time: runs the nightly billing job, writes a particular file, owns a Kafka partition. Because the holder can crash, every practical lock is a **lease**: it expires after a TTL unless renewed.\n\n" +
    "Leases introduce the central hazard: a holder can be **paused** (GC, VM migration, page faults, a delayed network packet) for longer than the TTL, the lease expires, someone else acquires it — and then the first holder wakes up and keeps writing, believing it still owns the lock. The fix is a **fencing token**: a number that increases with every grant, sent along with every write, so the protected resource can reject writes from stale holders.\n\n" +
    "First ask *why* you need the lock. For **efficiency** (avoid doing work twice), a single Redis `SET NX PX` is fine. For **correctness** (two holders would corrupt data), use a consensus-backed service (ZooKeeper, etcd) *and* fencing tokens.",
  analogy:
    "A hotel key card that stops working at noon. If you fall asleep in the room past noon, the hotel gives the room to someone else. Without fencing, you wake up and keep using the room. With fencing, the door lock remembers the newest card number it has seen — your old card number is lower, so the door simply will not open.",
  diagram: {
    intro: 'Two clients compete for the same lease and both write to shared storage. Play the flows to see how a pause breaks a naive lock and how fencing saves it.',
    nodes: [
      { id: 'c1', label: 'Client 1', sub: 'JVM, may GC-pause', type: 'service', col: 0, row: 0, desc: 'Acquires the lock first, then suffers a long stop-the-world pause in the middle of its critical section.' },
      { id: 'c2', label: 'Client 2', type: 'service', col: 0, row: 2, desc: 'Waits for the lock and acquires it legitimately once Client 1’s lease expires.' },
      { id: 'lock', label: 'Lock Service', sub: 'leases + tokens', type: 'auth', col: 2, row: 1, desc: 'Grants a lease with a TTL and a **monotonically increasing token**. With ZooKeeper the token can be the znode’s `zxid`/version; with etcd, the key’s revision.', tech: ['ZooKeeper', 'etcd', 'Consul', 'Redis'] },
      { id: 'storage', label: 'Storage', sub: 'checks tokens', type: 'storage', col: 4, row: 1, desc: 'The resource being protected. For fencing to work, it must remember the highest token it has accepted and reject lower ones — e.g. a conditional write `WHERE token < :t`.' },
    ],
    edges: [
      { from: 'c1', to: 'lock', label: 'acquire / renew' },
      { from: 'c2', to: 'lock', label: 'acquire' },
      { from: 'c1', to: 'storage', label: 'write(token)', curve: -0.15 },
      { from: 'c2', to: 'storage', label: 'write(token)', curve: 0.15 },
    ],
    flows: [
      {
        id: 'happy', name: 'Normal lease lifecycle',
        steps: [
          { from: 'c1', to: 'lock', text: 'Client 1 requests the lock `invoice-job` with a 10 s lease.' },
          { from: 'lock', to: 'c1', text: 'Granted with token **33**. Client 1 knows it may act until the lease expires.' },
          { from: 'c1', to: 'storage', text: 'Writes with token 33; storage records `maxToken = 33`.' },
          { from: 'c1', to: 'lock', text: 'Long job: renews the lease every 3 s.' },
          { from: 'c1', to: 'lock', text: 'Done — releases the lock *only if it still owns it* (compare-and-delete on its unique value).' },
          { from: 'c2', to: 'lock', text: 'Client 2 can now acquire it and receives token 34.' },
        ],
      },
      {
        id: 'unsafe', name: 'Broken: GC pause without fencing',
        steps: [
          { from: 'c1', to: 'lock', text: 'Client 1 acquires the lease (TTL 10 s).' },
          { at: 'c1', text: 'Client 1 checks "do I still hold the lock?" — yes — and is about to write…' },
          { at: 'c1', text: '…when a **15-second stop-the-world GC pause** freezes the whole process.' },
          { at: 'lock', text: 'The lease expires at 10 s. As far as the lock service knows, Client 1 crashed.' },
          { from: 'c2', to: 'lock', text: 'Client 2 acquires the lock — correctly.' },
          { from: 'c2', to: 'storage', text: 'Client 2 writes its update to the file.' },
          { from: 'c1', to: 'storage', text: 'Client 1 wakes up, unaware any time passed, and writes its stale update. **Both clients wrote; data is corrupted.**' },
          { at: 'storage', text: 'Note: checking the lock right before writing does not help — the pause can happen between the check and the write.' },
        ],
      },
      {
        id: 'fenced', name: 'Fixed: fencing tokens',
        steps: [
          { from: 'c1', to: 'lock', text: 'Client 1 acquires the lease and gets token **33**.' },
          { at: 'c1', text: 'Same 15-second GC pause.' },
          { at: 'lock', text: 'Lease expires.' },
          { from: 'c2', to: 'lock', text: 'Client 2 acquires the lock and gets token **34** — strictly greater.' },
          { from: 'c2', to: 'storage', text: 'Client 2 writes with token 34. Storage accepts and records `maxToken = 34`.' },
          { from: 'c1', to: 'storage', text: 'Client 1 wakes and writes with token 33.' },
          { at: 'storage', text: '33 < 34 → **rejected**. Client 1 learns it lost the lock and aborts. Data stays correct.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Efficiency lock or correctness lock?',
      md: 'Martin Kleppmann’s framing is the most useful first question.',
      table: {
        headers: ['', 'Efficiency lock', 'Correctness lock'],
        rows: [
          ['Purpose', 'Avoid doing the same work twice', 'Prevent two writers corrupting shared state'],
          ['Cost of occasional failure', 'A duplicate email, a wasted compute run', 'Lost updates, corrupted file, double payment'],
          ['Good implementation', 'Single Redis: `SET key val NX PX 30000`; release with compare-and-delete Lua script', 'Consensus store (ZooKeeper/etcd/Consul) + fencing tokens checked by the resource'],
          ['Is Redlock worth it?', 'Overkill — 5 nodes for an approximate guarantee', 'Not enough — no fencing tokens, depends on timing'],
        ],
      },
    },
    {
      h: 'The Redlock debate',
      md: "**Redlock** acquires the same key on a majority of N (typically 5) independent Redis nodes within a time limit. Kleppmann’s critique:\n\n" +
        "1. **No fencing tokens.** Its random lock value is not monotonic, so a resource cannot tell an old holder from a new one. Producing safe monotonic tokens across nodes essentially requires consensus.\n" +
        "2. **Safety depends on timing.** It assumes bounded network delay, bounded process pauses and bounded clock drift. A clock that jumps forward on one Redis node can expire a key early, letting a second client gather a majority while the first still believes it holds the lock.\n" +
        "3. **Pauses after acquisition** (like the GC flow above) break it exactly as they break a single-node lock.\n\n" +
        "Antirez (Redis’s author) replied that with monotonic clocks and careful ops the assumptions are reasonable. The practical takeaway most engineers accept: Redlock is fine for efficiency; for correctness, use a consensus system *and* fencing.",
      callout: { type: 'warn', md: 'Proper consensus algorithms (Raft, Paxos, ZAB) never rely on timing for **safety** — only for liveness. A lock whose safety depends on "pauses are always shorter than X" is making a synchronous-system assumption real systems violate (GitHub once observed ~90 s packet delays).' },
    },
    {
      h: 'Implementing locks correctly',
      md: "- **Acquire atomically**: `SET lock:job <uuid> NX PX 30000` (Redis), create an ephemeral sequential znode (ZooKeeper), or `PUT` with a lease and `create_revision == 0` transaction (etcd).\n" +
        "- **Release safely**: only delete if the value is still *your* uuid — otherwise you may delete someone else’s lock after yours expired.\n" +
        "- **Renew** well before expiry (e.g. at 1/3 of TTL) and stop work immediately if a renewal fails.\n" +
        "- **Avoid herds**: in ZooKeeper, each waiter watches only the znode just before it, not the lock itself, so a release wakes one waiter rather than all of them.\n" +
        "- **Fence the resource**: pass the token to every write; the resource rejects tokens lower than the max it has seen. If the resource cannot check tokens (e.g. a third-party API), use idempotency keys or make the operation itself conditional.\n" +
        "- **Consider not locking**: optimistic concurrency (`UPDATE … WHERE version = 7`), single-writer partitioning (each key owned by one consumer), or database row locks (`SELECT … FOR UPDATE`) are often simpler.",
    },
  ],
  keyPoints: [
    'Distributed locks are leases: they expire so a crashed holder cannot block forever.',
    'Process pauses and network delays can outlast a lease, creating two simultaneous "holders".',
    'Fencing tokens (monotonic, checked by the resource) are what make leases safe.',
    'Efficiency locks: single Redis is fine. Correctness locks: consensus store + fencing.',
    'Release only if you still own the lock (compare-and-delete).',
    'Often you can avoid a lock with optimistic concurrency or single-writer partitioning.',
  ],
  pitfalls: [
    'Assuming "I checked the lock right before writing" is safe — the pause can come after the check.',
    'Deleting the lock unconditionally on release and removing another client’s lock.',
    'TTL too short for the job (lock expires mid-work) or too long (crash blocks progress for minutes).',
    'Relying on wall-clock time across machines for lock expiry decisions.',
    'Using Redlock for money movement or other correctness-critical work.',
  ],
  realWorld: [
    '**Google Chubby** provides coarse-grained locks with *sequencers* — its name for fencing tokens.',
    '**HBase / Kafka (pre-KRaft)** used ZooKeeper ephemeral nodes for leader and partition ownership, with epochs to fence old leaders.',
    '**etcd** leases plus key revisions give natural fencing tokens; Kubernetes leader election is built on them.',
    'Martin Kleppmann’s 2016 post and antirez’s reply are a classic, readable debate on lock safety.',
  ],
  related: ['consensus-algorithms', 'heartbeats', 'paper-chubby', 'paper-zookeeper', 'idempotency', 'acid-transactions'],
  quiz: [
    { q: 'Client A holds a 10 s lease, then pauses for 20 s. Client B gets the lock and writes. A wakes and writes. What prevents corruption?', options: ['A shorter TTL', 'A fencing token: storage rejects A’s write because its token is lower than B’s', 'A checks the lock before writing', 'Using Redlock'], answer: 1, explain: 'Only a check at the resource, with a monotonically increasing token, can detect the stale holder.' },
    { q: 'You need a lock only to avoid sending a daily report email twice. Best choice?', options: ['5-node Redlock', 'ZooKeeper with fencing', 'A single Redis `SET NX PX` lock', 'Two-phase commit'], answer: 2, explain: 'It is an efficiency lock; a rare duplicate is harmless, so the simplest option wins.' },
    { q: 'Why must lock release check the stored value before deleting?', options: ['To save memory', 'Your lease may have expired and another client now holds the lock; an unconditional delete would release *their* lock', 'Redis requires it', 'To renew the TTL'], answer: 1, explain: 'Compare-and-delete ensures you only remove a lock you still own.' },
    { q: 'What is the core objection to Redlock for correctness-critical locks?', options: ['It is too slow', 'It provides no fencing tokens and its safety depends on bounded pauses, delays and clock drift', 'It needs ZooKeeper', 'It cannot expire keys'], answer: 1, explain: 'Timing assumptions are violated in practice, and without fencing the resource cannot reject stale writers.' },
  ],
  references: [
    { title: 'Martin Kleppmann — How to do distributed locking', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html' },
    { title: 'antirez — Is Redlock safe?', url: 'http://antirez.com/news/101' },
    { title: 'Burrows — The Chubby lock service', url: 'https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/' },
  ],
});
