SD.paper({
  id: 'paper-gfs',
  title: 'The Google File System (GFS)',
  year: 2003,
  authors: 'Sanjay Ghemawat, Howard Gobioff, Shun-Tak Leung (Google) — SOSP 2003',
  icon: '🗄️',
  tagline: 'One master, many chunkservers, 64 MB chunks in triplicate: a file system built for huge files on failing hardware.',
  summary:
    "GFS is the distributed file system Google built to store its crawl data, indexes and logs across **thousands of commodity disks**. Its design is shaped by an honest look at Google's workload: files are huge (multi-GB), mostly **written once by appending** and then **read sequentially**, and machines fail constantly.\n\n" +
    "Files are split into fixed **64 MB chunks**, each stored as an ordinary Linux file on three **chunkservers**. A single **master** holds all metadata in memory — the namespace, the file→chunk mapping and where each chunk's replicas live — but **never touches file data**. Clients ask the master *where*, then talk to chunkservers directly for the bytes.\n\n" +
    "To keep this simple and fast GFS relaxes POSIX: it offers an atomic **record append** that may duplicate records, uses **leases** to give one replica authority to order mutations, separates the data flow from the control flow, and leaves applications to cope with a well-defined but *relaxed* consistency model.",
  problem:
    "Google in 2001–2003 had storage needs no existing file system served: hundreds of terabytes across thousands of cheap machines, with many producers appending to the same file at once (e.g. crawler output, logs) and batch jobs streaming through entire files.\n\n" +
    "At that scale **component failure is the normal case** — disks, memory, power supplies, network and operator errors break something every day — so failure detection and automatic recovery have to be built in. " +
    "Traditional distributed file systems optimised for small files, random writes and strict POSIX semantics, which cost a lot of complexity for things Google did not need, and coordinating locks for concurrent appenders would have been a bottleneck.",
  analogy:
    "A huge library with one librarian at the front desk and thousands of shelves in the back. The librarian has a perfect card catalogue in their head — which volumes make up each book and which shelves hold copies — but never carries books. " +
    "You ask the librarian once, note down the shelf numbers, and go fetch the pages yourself. Every volume has three copies on different aisles, so a collapsed shelf is just a reason to make another copy.",
  sections: [
    {
      h: 'Single master, metadata only',
      md:
        "A single master hugely simplifies placement and replication decisions because it has a global view. To keep it from becoming a bottleneck:\n\n" +
        "- **No file data passes through it.** Clients cache chunk locations and talk to chunkservers directly.\n" +
        "- **Metadata is in memory**, under 64 bytes per 64 MB chunk — so a petabyte of data needs only around 1 GB of master RAM, and scans for rebalancing or garbage collection are fast.\n" +
        "- Namespace changes are written to a replicated **operation log** (with periodic B-tree-like checkpoints) before the client sees success. That log *is* the durable state.\n" +
        "- Chunk locations are **not persisted**: the master asks chunkservers at start-up and keeps up to date via heartbeats, since the chunkserver is the final word on what it holds.\n" +
        "- Read-only **shadow masters** serve metadata if the primary is down; an external monitor restarts the master elsewhere from its log.",
      table: {
        headers: ['Design choice', 'Benefit', 'Cost'],
        rows: [
          ['64 MB chunks', 'Few master lookups, small metadata, long sequential reads', 'Small files become hot spots; internal fragmentation (lazy space allocation helps)'],
          ['3 replicas across racks', 'Survives disk, machine and rack loss', '3× raw storage'],
          ['Single master', 'Simple, globally informed placement decisions', 'Memory-bound metadata; failover takes manual or external action'],
          ['Relaxed consistency', 'Fast concurrent appends without distributed locks', 'Apps must handle padding and duplicate records'],
        ],
      },
    },
    {
      h: 'Leases and the write path',
      md:
        "For each chunk being mutated, the master grants a **lease** (initially 60 s, extended via heartbeats) to one replica, the **primary**. The primary decides a **serial order** for all mutations to that chunk, and every replica applies them in that order — so replicas stay identical without the master in the loop.\n\n" +
        "GFS separates **data flow** from **control flow**:\n\n" +
        "1. The client pushes data to the replicas along a **chain**, each machine forwarding to the nearest next one while still receiving (pipelining). This uses every machine's full outbound bandwidth instead of the client's alone — 1 MB can reach all replicas in about 80 ms.\n" +
        "2. Only once all replicas have the data buffered does the client send the small *write* command to the primary, which assigns it a serial number, applies it, and tells the secondaries to apply it in the same order.\n\n" +
        "If any secondary fails, the client gets an error and retries; the region may be left inconsistent until the retry succeeds.",
    },
    {
      h: 'Record append and the relaxed consistency model',
      md:
        "Many Google workloads had hundreds of producers writing results into one file — perfect for a queue or merge. **Record append** lets each client say \"append this record somewhere\"; GFS picks the offset and guarantees the record is written **atomically at least once**.\n\n" +
        "If the record does not fit in the current chunk, the primary pads the chunk and asks the client to retry on the next one. If a replica fails mid-append, the retry writes the record again — so some replicas may contain **duplicates or padding**.\n\n" +
        "GFS defines file regions as **consistent** (all replicas show the same bytes) and **defined** (consistent *and* reflecting a whole mutation). Successful appends are defined, interspersed with possibly inconsistent regions. Applications cope by:\n\n" +
        "- writing self-validating records with **checksums** so readers skip garbage and padding,\n" +
        "- including **unique record ids** so readers can drop duplicates,\n" +
        "- preferring appends and **atomic rename** over overwrites.",
    },
    {
      h: 'Keeping data alive',
      md:
        "- **Re-replication:** when a chunkserver dies, the master notices missing heartbeats and clones its chunks from surviving replicas, prioritising chunks that have lost the most copies.\n" +
        "- **Rebalancing:** the master periodically moves replicas to even out disk usage and spreads them across racks.\n" +
        "- **Stale replicas:** each chunk has a **version number** that the master bumps on every new lease. A replica that missed mutations while down reports an old version and is garbage collected.\n" +
        "- **Checksums:** each chunkserver checksums its data in 64 KB blocks and verifies on every read, so silent disk corruption is caught and repaired from another replica.\n" +
        "- **Lazy garbage collection:** deleting a file just renames it to a hidden name; space is reclaimed during background scans days later, which is simpler and safer than eager deletion.\n" +
        "- **Snapshots** use copy-on-write: the master revokes leases, duplicates metadata, and chunks are copied only when next written.",
    },
  ],
  diagram: {
    intro: "Control messages (small) go to the master; data (large) flows directly between client and chunkservers. Each chunk has three replicas, one of which holds the lease as primary.",
    nodes: [
      { id: 'client', label: 'GFS Client', sub: 'library in app', type: 'client', col: 0, row: 2, desc: 'Linked into applications (e.g. MapReduce workers). Translates file offsets into chunk indexes, asks the master for chunk locations, caches them, and reads/writes data directly with chunkservers.' },
      { id: 'master', label: 'GFS Master', sub: 'metadata in RAM', type: 'service', col: 2, row: 0, desc: 'Holds the namespace, file→chunk mapping and replica locations in memory. Grants leases, places and re-replicates chunks, garbage-collects deleted files. Never serves file data.' },
      { id: 'oplog', label: 'Operation Log', sub: 'replicated + ckpt', type: 'db', col: 4, row: 0, desc: 'Durable record of every metadata change, replicated to remote machines before the master acknowledges. Replayed (from the latest checkpoint) after a master restart.' },
      { id: 'shadow', label: 'Shadow Master', sub: 'read-only replica', type: 'service', col: 3, row: 0, desc: 'Tails the operation log to provide read-only metadata access when the primary master is down; may lag slightly.' },
      { id: 'cs1', label: 'Chunkserver A', sub: 'primary (lease)', type: 'storage', col: 3, row: 2, desc: 'Holds a replica of the chunk and currently has the lease, so it assigns the serial order of mutations and coordinates the secondaries.' },
      { id: 'cs2', label: 'Chunkserver B', sub: 'secondary', type: 'storage', col: 4, row: 3, desc: 'Stores a replica as a plain Linux file. Applies mutations in the order chosen by the primary. Checksums every 64 KB block.' },
      { id: 'cs3', label: 'Chunkserver C', sub: 'secondary', type: 'storage', col: 5, row: 2, desc: 'Third replica, ideally on a different rack, so a rack-level power or switch failure cannot take all copies.' },
      { id: 'cs4', label: 'Chunkserver D', sub: 'spare capacity', type: 'storage', col: 5, row: 4, multi: true, desc: 'One of hundreds of other chunkservers. Receives new replicas during re-replication and rebalancing.' },
    ],
    edges: [
      { from: 'client', to: 'master', label: 'where is chunk?' },
      { from: 'master', to: 'shadow', async: true },
      { from: 'shadow', to: 'oplog', label: 'tail', async: true },
      { from: 'master', to: 'oplog', label: 'log + flush', curve: -0.3 },
      { from: 'master', to: 'cs1', label: 'lease / heartbeat' },
      { from: 'client', to: 'cs1', label: 'data + write' },
      { from: 'cs1', to: 'cs2', label: 'forward' },
      { from: 'cs1', to: 'cs3', label: 'forward' },
      { from: 'cs2', to: 'cs4', label: 're-replicate', async: true },
      { from: 'cs3', to: 'cs4', async: true },
    ],
    flows: [
      {
        id: 'read', name: 'Reading a file',
        steps: [
          { at: 'client', text: 'The app wants bytes 200 MB–201 MB of /crawl/pages-07. The client computes chunk index = 200 / 64 = 3.' },
          { from: 'client', to: 'master', text: 'It asks the master for (file, chunk 3).' },
          { at: 'master', text: 'The master looks up the chunk handle and its replica locations in memory — no disk access.' },
          { from: 'master', to: 'client', text: 'It returns the handle, version and three locations (often for the next few chunks too). The client caches this.' },
          { from: 'client', to: 'cs1', text: 'The client reads the byte range from the closest replica directly. The master is no longer involved.' },
          { at: 'cs1', text: 'The chunkserver verifies the 64 KB block checksums before returning data; a mismatch is reported and the client reads another replica.' },
        ],
      },
      {
        id: 'write', name: 'Writing with a lease',
        steps: [
          { from: 'client', to: 'master', text: 'The client asks which replica holds the lease for the chunk it wants to modify.' },
          { at: 'master', text: 'No one holds it, so the master grants a 60 s lease to Chunkserver A, bumps the chunk version and logs it.' },
          { from: 'master', to: 'client', text: 'The master replies with the primary (A) and secondaries (B, C).' },
          { from: 'client', to: 'cs1', text: 'Data flow: the client pushes the data to the nearest replica…' },
          { from: 'cs1', to: 'cs2', text: '…which pipelines it on to the next replica while still receiving (and so on to C). Data is only buffered, not applied.' },
          { from: 'client', to: 'cs1', text: 'Control flow: once all replicas have the data, the client sends the write request to the primary.' },
          { at: 'cs1', text: 'The primary assigns the next serial number and applies the mutation locally.' },
          { from: 'cs1', to: 'cs3', text: 'It forwards the request; secondaries apply mutations in exactly the same serial order and acknowledge.' },
          { from: 'cs1', to: 'client', text: 'The primary reports success (or an error, in which case the client retries).' },
        ],
      },
      {
        id: 'recover', name: 'A chunkserver dies',
        steps: [
          { at: 'cs3', text: 'Chunkserver C’s disk controller fails and it stops sending heartbeats.' },
          { at: 'master', text: 'After missed heartbeats the master marks C dead. Thousands of chunks now have only 2 replicas.' },
          { at: 'master', text: 'It prioritises chunks with the fewest replicas left and those blocking client progress, and throttles cloning to protect foreground traffic.' },
          { from: 'master', to: 'cs1', text: 'Over the heartbeat channel, the master tells surviving replica holders (A or B) to clone each affected chunk to a server with free space on another rack.' },
          { from: 'cs2', to: 'cs4', text: 'Chunk data streams from a healthy replica to Chunkserver D.' },
          { at: 'cs4', text: 'D stores the chunk and reports it in its next heartbeat; the chunk is back to 3 replicas.' },
          { at: 'master', text: 'If C returns later with old version numbers, those stale replicas are garbage collected.' },
        ],
      },
    ],
  },
  ideas: [
    '**Design for the workload**: huge files, appends and streaming reads — not POSIX generality.',
    '**Separate metadata from data**: a single in-memory master for control, direct client↔chunkserver data path.',
    '**Large 64 MB chunks** keep metadata tiny and reduce master interactions.',
    '**Leases** delegate mutation ordering to a primary replica without involving the master per write.',
    '**Decouple data flow from control flow** and pipeline data along a chain of replicas.',
    '**Atomic record append** with at-least-once semantics, plus app-level checksums and ids, beats distributed locking for many writers.',
    'Treat **failure as normal**: heartbeats, re-replication, version numbers, checksums and lazy GC.',
  ],
  impact:
    "GFS was the storage layer under **MapReduce** and **Bigtable** and became the template for big-data storage. **HDFS** (Hadoop Distributed File System) is a near-direct open-source reimplementation — NameNode = master, DataNodes = chunkservers, 64/128 MB blocks, three replicas.\n\n" +
    "Google later hit the single-master limits (metadata for billions of small files, failover time) and replaced GFS with **Colossus**, which shards metadata into Bigtable-like storage and uses Reed–Solomon erasure coding instead of 3× replication. " +
    "The same ideas — metadata service separated from a fleet of storage nodes, large immutable or append-only extents, replication across failure domains, background repair — underpin **Amazon S3**, **Azure Storage**, **Ceph** and **Facebook Tectonic**.",
  related: ['paper-mapreduce', 'paper-bigtable', 'data-replication', 'checksums', 'heartbeats', 'fault-tolerance', 'spof', 'paper-chubby'],
  url: 'https://static.googleusercontent.com/media/research.google.com/en//archive/gfs-sosp2003.pdf',
  quiz: [
    {
      q: 'Why does a single GFS master not become a bandwidth bottleneck for thousands of clients?',
      options: ['It is a very powerful machine', 'Clients only ask it for small metadata (chunk locations), cache the answers, and move data directly with chunkservers', 'It is sharded across many machines', 'Chunkservers serve metadata too'],
      answer: 1,
      explain: 'The master handles only tiny control requests. All bulk data flows between clients and chunkservers.',
    },
    {
      q: 'What is the purpose of the chunk lease granted to a primary replica?',
      options: ['To encrypt the chunk', 'To let one replica decide a single serial order of mutations so all replicas apply them identically', 'To allow reads from that replica only', 'To lock the file against readers'],
      answer: 1,
      explain: 'The primary chooses the order, secondaries follow it. Leases expire, so the master can safely appoint a new primary if the old one disappears.',
    },
    {
      q: 'A record append succeeds after one retry. What might a reader find in the file?',
      options: ['Exactly one copy of the record, guaranteed', 'The record at least once, possibly with a duplicate or padding in some replicas', 'A corrupted record', 'Nothing until the file is closed'],
      answer: 1,
      explain: 'Record append is atomic but at-least-once. Applications include unique ids and checksums so readers can skip duplicates and padding.',
    },
    {
      q: 'Why does GFS push data along a chain of chunkservers instead of from the client to each replica in parallel?',
      options: ['To save disk space', 'So each machine’s full outbound bandwidth is used and the transfer is pipelined, avoiding a bottleneck at the client’s link', 'Because the master requires it', 'To avoid checksumming'],
      answer: 1,
      explain: 'With a chain, every machine forwards to its nearest neighbour while still receiving, so total time is close to size / bandwidth plus a small per-hop latency.',
    },
    {
      q: 'How does the master detect a stale replica that missed writes while its chunkserver was down?',
      options: ['By comparing file sizes', 'Via chunk version numbers incremented on every new lease', 'By reading every replica', 'Clients report it'],
      answer: 1,
      explain: 'A restarted chunkserver reports the versions it holds; anything older than the master’s current version is stale and gets garbage collected.',
    },
  ],
});
