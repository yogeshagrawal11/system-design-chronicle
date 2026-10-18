SD.paper({
  id: 'paper-chubby',
  title: 'Chubby',
  year: 2006,
  authors: 'Mike Burrows (Google) — OSDI 2006',
  icon: '🔒',
  tagline: 'The Chubby lock service for loosely-coupled distributed systems: Paxos packaged as a tiny, highly available file system with locks.',
  summary:
    "Chubby is Google's **coarse-grained lock service**. Systems like GFS and Bigtable use it to **elect a primary** (whoever grabs the lock is the master), to publish small pieces of configuration, and to record which servers are alive. It also became Google's internal **name service**.\n\n" +
    "Its interface looks like a simple file system: paths like `/ls/cell/bigtable/master`, where every file or directory can also act as a **reader-writer lock**, and files hold small amounts of data. Clients get **events** (e.g. *contents changed*) and keep a consistent **cache** of what they read.\n\n" +
    "A Chubby *cell* is five replicas that use **Paxos** to elect a master and replicate a database; the master serves all requests. The paper's lasting contribution is less the algorithm and more the **engineering**: why a lock service is a better product than a consensus library, how sessions, leases and **sequencers** keep locks safe despite delays, and how caching lets one cell serve tens of thousands of clients.",
  problem:
    "Many Google systems needed to agree on things — most commonly *which replica is the primary*. In principle each could embed Paxos, but in practice that was hard: developers rarely design for high availability up front, retrofitting consensus into a running service is painful, and a 3- or 5-replica quorum is expensive when you only need one small decision.\n\n" +
    "What developers wanted was familiar: **locks** they already understood, a place to **store and advertise** a small result (\"the master is at 10.1.2.3:4000\"), and **notifications** when it changed — all highly available and simple enough for anyone to use correctly.",
  analogy:
    "A town hall with a single front desk, backed by four clerks who keep identical copies of every record. To become the official \"head of the water department\" you sign the register at the desk; your signature is valid only while you keep checking in. " +
    "Everyone else can look up who signed, and the desk phones them if it changes. If you stop checking in, your claim expires after a grace period — and every order you issued carries a numbered stamp, so contractors can refuse instructions from a former head who has not yet realised they were replaced.",
  sections: [
    {
      h: 'Why a lock service, not a Paxos library',
      md:
        "Burrows argues a centralised service beats a client library for several practical reasons:\n\n" +
        "- **Easy adoption** — a prototype that starts with one server can add leader election later with a couple of lock calls, no redesign.\n" +
        "- **Publishing results** — once elected, the primary needs to advertise itself; a service that stores small files and sends change events does both.\n" +
        "- **Familiar interface** — programmers already know locks (though not always how they behave under failure).\n" +
        "- **Fewer servers per client** — a client of Chubby can make progress with just *one* server of its own; the quorum lives inside Chubby.\n\n" +
        "Locks are **coarse-grained**: held for hours or days (e.g. master election), not milliseconds. That keeps load low, so modest servers can handle many clients and a brief Chubby outage does not stop already-elected masters. Locks are **advisory**: they only exclude other lock holders, they do not stop anyone reading the file.",
    },
    {
      h: 'Cell architecture, Paxos and caching',
      md:
        "A **cell** has typically **five replicas** in different failure domains. They run **Paxos** to elect a **master** and grant it a **master lease** of a few seconds, renewed while it keeps winning a majority. Only the master serves reads and writes; writes are replicated to a majority via Paxos, reads are served by the master alone. Clients find the master by asking any replica listed in DNS.\n\n" +
        "To protect the master, clients **cache file data and metadata** in memory. The cache is **consistent and write-through**: before modifying a file, the master sends invalidations to every client that may have it cached and waits until each acknowledges (or its lease expires). Invalidations ride on the KeepAlive replies.\n\n" +
        "In practice reads vastly outnumber writes, so caching absorbs most of the load; the paper reports cells serving around **90,000 clients**, with proxies and namespace partitioning available for further scaling.",
      table: {
        headers: ['Mechanism', 'Purpose'],
        rows: [
          ['Paxos among 5 replicas', 'Elect a master and durably replicate the database'],
          ['Master lease', 'Lets the master serve reads without consulting replicas'],
          ['Client sessions + KeepAlives', 'Track client liveness; deliver events and invalidations'],
          ['Consistent client cache', 'Absorb reads so one master can serve tens of thousands of clients'],
          ['Sequencers & lock-delay', 'Stop delayed requests from a lock holder that has lost the lock'],
        ],
      },
    },
    {
      h: 'Sessions, KeepAlives and failover',
      md:
        "Each client maintains a **session** with the master, kept alive by **KeepAlive** RPCs. The master holds each KeepAlive until shortly before the session lease (default about **12 s**) expires and then replies with a new lease — a long-poll that also carries events and cache invalidations.\n\n" +
        "The client keeps its own, slightly conservative idea of the lease. If it expires without a reply, the client enters **jeopardy**: it disables its cache and tells the application. It then waits a **grace period** (about 45 s by default) trying to reach a master. If it does, the session continues and the application learns it is safe; if not, the session is declared expired.\n\n" +
        "On **master failover**, a new master is elected via Paxos, picks a new **epoch number** (rejecting requests with old epochs), rebuilds in-memory state from the replicated database, waits out the old master's possible leases, and lets clients reconnect. With the grace period, most applications ride through a failover — which typically took a few seconds to tens of seconds — **without noticing**.",
    },
    {
      h: 'Making locks safe: sequencers and lock-delay',
      md:
        "Distributed locks have a nasty failure mode: client A acquires a lock, sends a request to a storage server, then stalls (GC pause, network hiccup). Its lock expires, client B acquires it and writes. A's **delayed request** then arrives and clobbers B's data.\n\n" +
        "Chubby offers two defences:\n\n" +
        "- **Sequencers:** a lock holder can request an opaque byte string describing the lock — name, mode and **generation number** (incremented on every acquisition). It passes the sequencer with each request; the receiving server checks it with Chubby (or compares generation numbers) and rejects stale ones. This is what is now called a **fencing token**.\n" +
        "- **Lock-delay:** for servers that do not check sequencers, if a holder fails or disconnects, Chubby blocks others from acquiring the lock for a configurable delay (up to a minute), giving in-flight requests time to drain.",
    },
    {
      h: 'Surprises from production',
      md:
        "- Chubby became Google's **primary name service** — replacing DNS for internal discovery, because its consistent caching beat DNS's TTL-based staleness. Name lookups, not locking, became the dominant load.\n" +
        "- Developers often treated Chubby as always available or as a general database; Google added **quotas** (small files only) and **reviews** of new clients' usage patterns.\n" +
        "- Many clients did not handle failover well, so the libraries hid jeopardy and grace periods by default.\n" +
        "- Exposing a full consensus protocol would have been less used; a **narrow, familiar abstraction** won.",
    },
  ],
  diagram: {
    intro: "A Chubby cell: five replicas, one master elected by Paxos. Clients talk to the master through a client library that keeps a session, a cache and delivers events. A storage server checks sequencers to fence out stale lock holders.",
    nodes: [
      { id: 'app1', label: 'GFS / Bigtable', sub: 'candidate master A', type: 'client', col: 0, row: 1, desc: 'An application replica trying to become primary by acquiring an exclusive lock on a Chubby file. Uses the Chubby client library.' },
      { id: 'app2', label: 'Other Replica', sub: 'candidate master B', type: 'client', col: 0, row: 3, desc: 'A competing replica. It waits for the lock and is notified via events if the holder disappears.' },
      { id: 'lib', label: 'Chubby Library', sub: 'session + cache', type: 'gateway', col: 1, row: 2, desc: 'Inside each client process: maintains the session with KeepAlives, caches file data consistently, handles jeopardy and grace periods, and delivers events.' },
      { id: 'master', label: 'Chubby Master', sub: 'holds master lease', type: 'service', col: 3, row: 2, desc: 'The elected replica. Serves all reads and writes, tracks sessions and locks, sends cache invalidations, and replicates writes through Paxos.' },
      { id: 'r1', label: 'Replica 2', type: 'db', col: 4, row: 1, desc: 'Keeps a copy of the database via Paxos and votes in master elections. Answers clients only with the master’s location.' },
      { id: 'r2', label: 'Replica 3', type: 'db', col: 4, row: 3, desc: 'Replica in another failure domain.' },
      { id: 'r3', label: 'Replicas 4–5', type: 'db', col: 5, row: 2, multi: true, desc: 'Remaining replicas. With 5 replicas, the cell survives 2 failures.' },
      { id: 'dns', label: 'DNS', sub: 'lists replicas', type: 'dns', col: 2, row: 0, desc: 'Clients find a cell’s replicas through DNS and ask any of them who the current master is.' },
      { id: 'store', label: 'Storage Server', sub: 'checks sequencers', type: 'storage', col: 2, row: 4, desc: 'A resource protected by the lock (e.g. a file server). It validates each request’s sequencer and rejects ones with an old generation number.' },
    ],
    edges: [
      { from: 'app1', to: 'lib' },
      { from: 'app2', to: 'lib' },
      { from: 'lib', to: 'dns', label: 'find cell' },
      { from: 'lib', to: 'master', label: 'RPC / KeepAlive' },
      { from: 'master', to: 'r1', label: 'Paxos', both: true },
      { from: 'master', to: 'r2', label: 'Paxos', both: true },
      { from: 'master', to: 'r3', both: true },
      { from: 'app1', to: 'store', label: 'request + sequencer', curve: -0.3 },
      { from: 'app2', to: 'store' },
    ],
    flows: [
      {
        id: 'elect', name: 'Primary election via a lock',
        steps: [
          { from: 'lib', to: 'dns', text: 'Candidate A’s library looks up the cell’s replicas in DNS and asks one of them for the master’s address.' },
          { from: 'app1', to: 'lib', text: 'A calls Open("/ls/cell/bigtable/master") and Acquire() in exclusive mode.' },
          { from: 'lib', to: 'master', text: 'The request goes to the Chubby master over A’s session.' },
          { from: 'master', to: 'r1', text: 'The master records “lock held by A, generation 42” and replicates it to a majority via Paxos.' },
          { from: 'master', to: 'lib', text: 'Lock granted. A writes its address into the file’s contents (another Paxos-replicated write).' },
          { from: 'app2', to: 'lib', text: 'Candidate B’s Acquire() blocks; it reads the file (served from cache after the first read) to find the current primary.' },
          { at: 'master', text: 'A is now the primary for as long as it keeps its session alive — typically hours or days.' },
        ],
      },
      {
        id: 'fencing', name: 'Sequencers fence a stale holder',
        steps: [
          { from: 'app1', to: 'lib', text: 'A, the lock holder, asks for a sequencer: (lock name, exclusive, generation 42).' },
          { at: 'app1', text: 'A sends a write to the storage server with sequencer 42, then freezes in a long GC pause.' },
          { at: 'master', text: 'A’s session lease expires; the lock is released. B acquires it with generation 43.' },
          { from: 'app2', to: 'store', text: 'B writes to the storage server with sequencer 43. The server records 43 as the newest generation.' },
          { from: 'app1', to: 'store', text: 'A wakes up and its delayed write (sequencer 42) finally arrives.' },
          { at: 'store', text: 'The server sees 42 < 43 and rejects it — B’s data is safe. Without a sequencer, lock-delay would have kept B waiting instead.' },
        ],
      },
      {
        id: 'failover', name: 'Chubby master failover',
        steps: [
          { at: 'master', text: 'The Chubby master crashes. Its master lease will run out within a few seconds.' },
          { at: 'lib', text: 'Client libraries stop receiving KeepAlive replies. Their local session leases expire and they enter jeopardy: caches are disabled and apps are warned.' },
          { from: 'r1', to: 'r2', text: 'The surviving replicas run Paxos and elect Replica 2 as the new master with a new epoch number.' },
          { at: 'r1', text: 'The new master rebuilds sessions and locks from the replicated database and waits out the old master’s possible lease.' },
          { from: 'lib', to: 'r1', text: 'Within the 45 s grace period, clients reconnect (via DNS and any replica) and send KeepAlives with the new epoch.' },
          { from: 'r1', to: 'lib', text: 'Sessions are re-established; caches are re-enabled; locks are still held by their owners.' },
          { at: 'app1', text: 'Bigtable’s master never lost its lock. To applications, the failover was just a short pause.' },
        ],
      },
    ],
  },
  ideas: [
    'Package consensus as a **lock service with small files**, not a library — far easier for developers to adopt correctly.',
    '**Coarse-grained, advisory locks** keep load low and survive brief service outages.',
    '**Paxos-replicated cell of 5** with a leased master serving all requests.',
    '**Consistent client caching** with master-driven invalidations lets one cell serve ~90k clients.',
    '**Sessions, KeepAlives, jeopardy and grace periods** let clients ride through failover.',
    '**Sequencers (fencing tokens)** and lock-delay protect resources from stale lock holders.',
    'Real usage can surprise you — Chubby became mostly a **name service**.',
  ],
  impact:
    "Chubby made **\"just use a coordination service\"** the standard answer for leader election and service discovery. Inside Google it underpins GFS, Bigtable, Borg, and many others; Bigtable even reported that a measurable fraction of its unavailability came from Chubby outages, underscoring how central it was.\n\n" +
    "Yahoo! built **ZooKeeper** (2010) as an open, more general alternative, which in turn shaped **etcd** (Kubernetes's backbone) and **HashiCorp Consul**. The idea of a **fencing token** that Chubby called a sequencer is now standard advice for any distributed lock — for example, in critiques of Redis-based Redlock. " +
    "Google's companion paper, *Paxos Made Live* (2007), describes the engineering of Chubby's Paxos layer and remains one of the best accounts of turning consensus theory into production software.",
  related: ['paper-paxos', 'paper-zookeeper', 'paper-bigtable', 'paper-gfs', 'distributed-locking', 'consensus-algorithms', 'service-discovery', 'distributed-lock-service', 'heartbeats', 'failover'],
  sims: ['raft-election'],
  url: 'https://static.googleusercontent.com/media/research.google.com/en//archive/chubby-osdi06.pdf',
  quiz: [
    {
      q: 'Why did Google build Chubby as a lock service rather than shipping a Paxos library for each system?',
      options: ['Paxos libraries are slower', 'A service is easier to adopt: familiar locks, a place to publish the result, events, and clients need no quorum of their own', 'Locks are more consistent than Paxos', 'Libraries cannot run on Linux'],
      answer: 1,
      explain: 'Retrofitting consensus into an application is hard. A lock service provides election, advertisement and notification with a couple of calls.',
    },
    {
      q: 'A lock holder pauses, loses the lock, and its delayed write later reaches a storage server. What Chubby feature lets the server reject it?',
      options: ['KeepAlives', 'Sequencers carrying a lock generation number', 'Client caching', 'DNS'],
      answer: 1,
      explain: 'The server compares the generation in the sequencer with the newest it has seen and rejects stale ones — a fencing token.',
    },
    {
      q: 'What does a Chubby client do when its local session lease expires without hearing from the master?',
      options: ['Immediately releases all locks and exits', 'Enters jeopardy: disables its cache, warns the app, and waits a grace period for a new master', 'Elects itself master', 'Switches to another cell'],
      answer: 1,
      explain: 'Jeopardy plus a grace period (default ~45 s) lets clients survive a master failover without losing their session.',
    },
    {
      q: 'Why can one Chubby master serve tens of thousands of clients?',
      options: ['It shards every file across all replicas', 'Clients keep consistent caches invalidated by the master, so most reads never reach it, and locks are coarse-grained', 'It uses UDP', 'Reads go to any replica'],
      answer: 1,
      explain: 'Reads dominate and are absorbed by client caches; coarse locks mean few acquire/release operations.',
    },
    {
      q: 'What became the most common use of Chubby in practice?',
      options: ['Fine-grained row locking', 'Name service / discovery — storing and caching small records like who the primary is', 'Storing large files', 'Message queueing'],
      answer: 1,
      explain: 'Its consistent caching made it a better internal name service than DNS, and lookups became the dominant load.',
    },
  ],
});
