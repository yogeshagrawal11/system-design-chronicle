SD.company({
  id: 'dropbox-magic-pocket',
  title: 'Dropbox Magic Pocket: Exabyte Block Storage',
  company: 'Dropbox',
  icon: '🗄️',
  tagline: 'Immutable 4 MB blocks, a sharded-MySQL index, cells of dumb storage boxes, erasure coding, and verifiers that never sleep.',
  summary:
    'Magic Pocket (MP) is the storage system Dropbox built to hold the *contents* of every user file after moving off Amazon S3. It stores **immutable, encrypted, compressed blocks of up to 4 MB**, addressed by their SHA-256 hash, in at least **two geographic zones**. ' +
    'Inside a zone, a **Block Index** (sharded MySQL) says which **cell** and **bucket** holds a block; a small **Replication Table** says which **volume** and which **OSDs** (storage machines with >1 PB each) hold that bucket. New data is replicated; older data is **erasure-coded**. ' +
    'A per-cell **Master** repairs, garbage-collects and re-encodes, but stays off the data path. Around all of it sits a stack of **verifiers** (disk scrubber, metadata scanner, storage watcher, trash inspector, cross-zone verifier) that consume more than half of disk and database load to prove, continuously, that nothing has been lost.',
  analogy:
    'A national library of sealed envelopes. The card catalogue (Block Index) tells you which branch (cell) and which shelf box (bucket) an envelope is in. A small branch register (Replication Table) says which physical shelves currently hold that box. ' +
    'Fresh envelopes are photocopied onto several shelves; old boxes get condensed into a clever code that needs less shelf space. Auditors walk the aisles all day, every day, checking that every envelope the catalogue mentions is really there.',
  numbers: [
    { value: 'Multi-EB', label: 'stored (exabytes)' },
    { value: '4 MB', label: 'max immutable block size' },
    { value: '~50 PB', label: 'raw per cell' },
    { value: '>1 PB', label: 'per storage machine (OSD)' },
    { value: '27 nines', label: 'modelled durability' },
  ],
  problem:
    'Dropbox stores files for hundreds of millions of users. File content had lived on Amazon S3; at Dropbox\'s scale, owning the storage layer promised large cost savings and full control over performance and hardware (context: the migration moved over 500 PB in-house around 2015-2016).\n\n' +
    'The workload is unusual:\n' +
    '- Data is **write-once**: blocks never change. File edits are recorded above MP by **FileJournal**, which just points to new blocks.\n' +
    '- Strong **temporal locality**: most reads happen within about an hour of upload, then a long tail of rare reads that must still be fast (not tape-like).\n' +
    '- **Durability matters more than anything**: losing a customer file is unacceptable.\n' +
    '- The team was **fewer than six engineers**, and the system had to scale from tens of petabytes to multiple exabytes in about six months.\n\n' +
    'So the challenge was not just storing bytes cheaply on spinning disks, but making the system simple enough to build quickly and verifiable enough to trust.',
  architecture: {
    intro:
      'One zone is drawn in detail (the cell in the middle-right); Zone 2 stands for the other regions (US West, Central, East) that hold an independent copy. Dropbox application tiers above MP (block servers, FileJournal) are simplified.',
    nodes: [
      { id: 'client', label: 'Dropbox Client', sub: 'desktop / mobile / web', type: 'client', col: 0, row: 1, desc: 'Splits files into blocks of up to 4 MB, hashes them, and uploads only blocks the server does not already have (dedup). Downloads fetch blocks by hash.' },
      { id: 'bs', label: 'Block Servers', sub: 'Dropbox app tier', type: 'gateway', col: 1, row: 1, multi: true, desc: 'Dropbox\'s API layer for file content. Authenticates the user, encrypts/compresses blocks, and calls MP with simple Put(hash, data) and Get(hash) operations.', tech: ['Go', 'Python'] },
      { id: 'fj', label: 'FileJournal', sub: 'file metadata', type: 'db', col: 1, row: 0, desc: 'Records every file version as a list of block hashes. This is where mutability lives; MP itself only sees immutable blocks.', tech: ['MySQL'] },
      { id: 'fe', label: 'MP Frontends', sub: 'zone gateway', type: 'gateway', col: 2, row: 1, multi: true, desc: 'Accept Put/Get. Periodically poll cells for free space and open volumes, choose where a new block goes (balancing cells, limiting cross-cluster traffic), write to every OSD of a volume, and on read find and fetch the block, reconstructing if needed.', tech: ['Go'] },
      { id: 'bi', label: 'Block Index', sub: 'sharded MySQL', type: 'db', col: 3, row: 0, desc: '`hash → (cell, bucket, checksum)`, plus delete and cross-zone bookkeeping. Deliberately a big sharded MySQL cluster with an RPC layer rather than a custom DHT: Dropbox already ran thousands of MySQL nodes and knew how to operate them.', tech: ['MySQL', 'RPC service'] },
      { id: 'rt', label: 'Replication Table', sub: 'bucket → volume → OSDs', type: 'db', col: 3, row: 2, desc: 'Small MySQL table per cell: bucket → volume; volume → OSDs, open/closed, type (replicated or erasure-coded) and generation number. Changes rarely and fits in memory, so it can serve very high read rates.', tech: ['MySQL'] },
      { id: 'osd', label: 'OSDs', sub: 'storage nodes, >1 PB', type: 'storage', col: 4, row: 1, multi: true, desc: 'Object Storage Devices: boxes packed with spinning disks (>1 PB per machine, >8 PB per rack). Deliberately dumb: they store and checksum blocks, schedule disk I/O and cache, but know nothing about cells or protocols. Each holds thousands of 1 GB extents.', tech: ['HDD (later SMR)', 'Rust'] },
      { id: 'master', label: 'Cell Master', sub: 'soft-state coordinator', type: 'scheduler', col: 4, row: 2, desc: 'One per cell (~50 PB; ~100 PB is the ceiling for one master). Detects failed OSDs, plans repairs, opens new buckets, triggers GC and bucket merges. Holds no authoritative state (it is all in the Replication Table) and is off the data path: reads work without it, writes until open buckets run out.' },
      { id: 'vm', label: 'Volume Managers', sub: 'move + erasure code', type: 'worker', col: 5, row: 1, multi: true, desc: 'Run on the OSD hardware itself and do the heavy lifting the Master asks for: copy volumes during repair and convert replicated volumes into erasure-coded ones. Co-locating them spreads network load over idle storage machines.' },
      { id: 'scrub', label: 'Disk Scrubber', sub: 'every disk, 1-2 weeks', type: 'monitor', col: 5, row: 0, desc: 'Reads every bit on every disk and checks checksums to catch bad sectors and silent bit-rot. Recently written regions are scanned more often. Bad data triggers re-replication, usually done within an hour.' },
      { id: 'scan', label: 'Metadata Scanner', sub: '~1M blocks/s', type: 'monitor', col: 4, row: 0, desc: 'Walks the Block Index, works out which OSDs should hold each block, and asks them (from in-memory metadata, no disk seek) whether they do. Covers hundreds of billions of blocks roughly weekly; its "missing" metric should be a flat zero.' },
      { id: 'xz', label: 'Cross-Zone Replicator', sub: 'async, <1 s', type: 'queue', col: 2, row: 3, desc: 'Daemon that copies every successful Put to the other zone, typically within a second. That lag is part of the durability model.' },
      { id: 'zone2', label: 'Zone 2', sub: 'independent full copy', type: 'storage', col: 4, row: 3, desc: 'Another region with its own Frontends, Block Index and cells. Zones are separate administrative domains, so a bad config push or congestion collapse in one cannot take out the other.' },
      { id: 'watch', label: 'Storage Watcher', sub: 'black-box sampler', type: 'monitor', col: 1, row: 3, desc: 'Independent end-to-end check written by someone outside the storage team. Samples 1% of writes (hashes via Kafka) and re-reads them after 1 minute, 1 hour, 1 day, 1 week and 1 month.', tech: ['Kafka'] },
    ],
    edges: [
      { from: 'client', to: 'bs', label: 'upload / download' },
      { from: 'bs', to: 'fj', label: 'file → hashes' },
      { from: 'bs', to: 'fe', label: 'Put / Get' },
      { from: 'fe', to: 'bi', label: 'hash → cell, bucket' },
      { from: 'fe', to: 'rt', label: 'bucket → OSDs' },
      { from: 'fe', to: 'osd', label: 'store / fetch' },
      { from: 'master', to: 'rt', label: 'commit layout' },
      { from: 'master', to: 'osd', label: 'health' },
      { from: 'master', to: 'vm', label: 'repair / encode' },
      { from: 'vm', to: 'osd', label: 'copy / EC', both: true },
      { from: 'scan', to: 'bi', label: 'iterate', async: true },
      { from: 'scan', to: 'osd', label: 'has block?', async: true },
      { from: 'scrub', to: 'osd', label: 'checksum', async: true },
      { from: 'fe', to: 'xz', label: 'replicate', async: true },
      { from: 'xz', to: 'zone2', async: true },
      { from: 'watch', to: 'fe', label: 'sample reads', async: true },
    ],
  },
  flows: [
    {
      id: 'put', name: 'Put a new block',
      steps: [
        { from: 'client', to: 'bs', text: 'Client uploads a 4 MB block with its SHA-256 hash.' },
        { from: 'bs', to: 'fe', text: 'Block server (after encryption/compression) issues `Put(hash, data)` to a zone Frontend.' },
        { from: 'fe', to: 'bi', text: 'Check the Block Index: if the hash already exists, the block is deduplicated and we are done.' },
        { at: 'fe', text: 'Pick an open volume in some cell, from its periodically polled list of free space and open volumes, balancing load and avoiding cross-cluster links.' },
        { from: 'fe', to: 'rt', text: 'Read which OSDs make up that volume (cached, rarely changes).' },
        { from: 'fe', to: 'osd', text: 'Send the block to **every** OSD of the (replicated) volume; each fsyncs to disk or SSD before acking. If any fails, retry on a different volume, possibly another cell.' },
        { from: 'fe', to: 'bi', text: 'Only after all acks: insert `hash → cell, bucket, checksum`. This is the commit point.' },
        { from: 'fe', to: 'bs', text: 'Return success; the block server records the hash in FileJournal.' },
        { from: 'fe', to: 'xz', text: 'Asynchronously, the cross-zone daemon copies the block to Zone 2, usually within a second.' },
      ],
    },
    {
      id: 'get', name: 'Get a block from an erasure-coded volume',
      steps: [
        { from: 'client', to: 'bs', text: 'A user opens a two-year-old photo; the client asks for its blocks by hash.' },
        { from: 'bs', to: 'fe', text: 'Block server calls `Get(hash)`.' },
        { from: 'fe', to: 'bi', text: 'Block Index returns cell and bucket.' },
        { from: 'fe', to: 'rt', text: 'Replication Table maps bucket → volume → OSDs, and says the volume is erasure-coded.' },
        { from: 'fe', to: 'osd', text: 'The layout keeps each block whole on one OSD, so a normal read is a single disk read.' },
        { at: 'osd', text: 'If that OSD is down, the Frontend instead reads a small subset of other OSDs in the volume (LRC-style local groups) and rebuilds the block, with help from a Volume Manager.' },
        { from: 'fe', to: 'bs', text: 'The block is returned; checksum verified against the index entry.' },
      ],
    },
    {
      id: 'repair', name: 'OSD failure and repair',
      steps: [
        { at: 'osd', text: 'A storage machine holding thousands of volumes goes offline.' },
        { from: 'master', to: 'osd', text: 'The Master notices via service discovery and waits **15 minutes** (long enough for a reboot, short enough to limit risk).' },
        { from: 'master', to: 'rt', text: 'Step 1: **close** every volume that had a replica on the dead OSD. Closed volumes take no writes, so moving them is safe.' },
        { at: 'master', text: 'Step 2: build a reconstruction plan that spreads sources and destinations across hundreds of OSDs to avoid hot spots.' },
        { from: 'master', to: 'vm', text: 'Step 3: Volume Managers copy or re-encode each volume onto new OSDs, in parallel across the cell.' },
        { from: 'vm', to: 'osd', text: 'Data lands on new OSDs tagged with an incremented **generation** number.' },
        { from: 'master', to: 'rt', text: 'Step 4: update volume → OSDs in the Replication Table: the commit point. If the Master dies before this, the old mapping stands and repair is simply redone. If the dead OSD returns, its stale generation is ignored.' },
      ],
    },
    {
      id: 'verify', name: 'Continuous verification',
      steps: [
        { from: 'scan', to: 'bi', text: 'Metadata Scanner iterates index entries at ~1M blocks per second.' },
        { from: 'scan', to: 'osd', text: 'For each block it asks the expected OSDs whether they hold it, answered from in-memory metadata.' },
        { from: 'scrub', to: 'osd', text: 'Disk Scrubber sequentially reads each disk and checks checksums; a bad extent triggers re-replication.' },
        { from: 'watch', to: 'fe', text: 'Storage Watcher re-reads a 1% sample of new blocks through the normal API at 1 min, 1 h, 1 day, 1 week, 1 month.' },
        { at: 'osd', text: 'Deleted extents first go to "trash"; the Trash Inspector confirms every block in them was moved or deleted on purpose, and the Extent Referee checks every unlink matches a Master instruction.' },
        { at: 'scan', text: 'Any non-zero "missing block" count pages an engineer. In normal operation the graph is a flat line.' },
      ],
    },
  ],
  evolution: [
    { stage: '🌱 Metadata in-house, content on S3', md: 'For its first years Dropbox ran its own metadata (MySQL) but stored file blocks on Amazon S3. Simple, elastic, and the right call while the company was small.' },
    { stage: '🌿 Build Magic Pocket', md: 'A team of under six engineers designed MP around immutable blocks, a sharded-MySQL index, dumb OSDs and centralised, soft-state coordination. Prototypes started at double-digit petabytes and the system reached multi-exabyte scale in about six months, hitting surprises like saturated inter-cluster routers that forced changes to placement and routing.' },
    { stage: '🌳 The migration and verification (2015-2016)', md: 'Context: Dropbox moved the vast majority of user data (over 500 PB) from S3 into MP, double-writing and verifying as it went. A verification stack was built alongside and now uses more than half of disk and DB capacity. New code must run against verifiers on a tens-of-petabytes Staging cluster for a week before production.' },
    { stage: '🌍 Denser and colder (later, context)', md: 'Later posts describe moving to **SMR** drives for higher density, and a cold-storage tier that splits blocks into fragments plus XOR parity across three regions so cold data costs well under 2 full cross-zone copies while still surviving loss of a region.' },
  ],
  deepDives: [
    {
      title: '🏗️ Build vs buy (stay on S3?)',
      options: [
        { name: 'Stay on Amazon S3', pros: ['Zero ops for storage', 'Elastic capacity, proven durability'], cons: ['At exabyte scale, the bill dominates infrastructure cost', 'No control over hardware, placement, or latency tuning', 'Dropbox\'s workload (immutable blocks, locality) is very specific'] },
        { name: 'Adopt an open-source store (Ceph/HDFS-like)', pros: ['Existing code'], cons: ['General-purpose designs (mutable objects, POSIX, consensus everywhere) carry complexity MP does not need', 'Still must operate it at exabyte scale'] },
        { name: 'Build a purpose-built block store', pros: ['Exploits immutability and locality for simpler protocols', 'Custom hardware (>1 PB per box) and full-stack tuning', 'Large long-term cost savings'], cons: ['Huge upfront risk: durability bugs are catastrophic', 'Needs a serious verification and ops investment'], chosen: true },
      ],
      verdict: 'Building only made sense because the problem was narrow (immutable, hash-addressed blocks) and the team invested as much in verification as in the storage path. Most companies should stay on S3.',
    },
    {
      title: '📇 How to index hundreds of billions of blocks',
      options: [
        { name: 'Custom DHT / consistent-hash placement', desc: 'Hash decides location; no index.', pros: ['No central index to scale', 'Elegant'], cons: ['Moving data means changing the hash function or ring', 'Harder to place data by recency, cell fullness, or network locality', 'New distributed protocols to get right'] },
        { name: 'Sharded MySQL Block Index + small Replication Table', desc: 'Two levels of indirection: hash → bucket, bucket → OSDs.', pros: ['Placement is a free choice at write time (balance cells, keep traffic local)', 'Moving a 1 GB volume touches one Replication Table row, not billions of index rows', 'Uses technology the company already operates at scale'], cons: ['Extra lookup on every Get (mitigated by caching the small table)', 'Index is a very large MySQL fleet'], chosen: true },
      ],
      verdict: 'The indirection is the key trick: the huge index points to **buckets**, which almost never change; only the tiny table that maps buckets to machines changes during repair. See [database sharding](#/concept/database-sharding).',
    },
    {
      title: '✍️ Write all replicas, or quorum?',
      options: [
        { name: 'Quorum writes (W of N)', pros: ['Lower tail latency: ignore the slowest replica', 'Fewer retries'], cons: ['Replicas diverge, so background anti-entropy and read repair are required', 'More complex consistency reasoning'] },
        { name: 'Write every OSD in the volume, retry elsewhere on failure', pros: ['A committed block is always fully replicated', 'Simple: if anything fails, pick another open volume', 'Master later cleans up partial writes'], cons: ['Slowest OSD sets latency (handled with careful timeouts)', 'More retries during failures'], chosen: true },
      ],
      verdict: 'Because blocks are immutable and placement is free, "just write somewhere else" is always possible, which removes the need for quorum machinery. Compare with [Dynamo-style quorums](#/paper/paper-dynamo).',
    },
    {
      title: '🧬 Replication first, erasure coding later',
      md: 'Fresh data is hot and is written to open **replicated** volumes: easy to write (no encoding on the hot path) and any replica can serve a read. Once buckets are closed and the data cools, Volume Managers aggregate buckets into **erasure-coded** volumes using a Reed-Solomon variant similar to Local Reconstruction Codes.\n\n- Replication: e.g. 3-4 full copies in a zone, simple, but ~3-4x raw overhead.\n- Erasure coding: e.g. k data + m parity fragments for ~1.3-1.5x overhead (exact parameters are not published).\n- LRC-style local groups let most single-disk failures be rebuilt from a *small subset* of disks, cutting repair traffic.\n- Layout keeps each block whole on one OSD, so a healthy EC read is still one disk seek.\n\nThis lifecycle matches the workload: most reads happen in the first hour, when data is still replicated and cached.',
    },
    {
      title: '🔍 Verification as a first-class system',
      md: 'The modelled durability is ~27 nines, but models do not include bugs, operator mistakes or bad config pushes. Dropbox built six independent verifiers:\n\n- **Disk Scrubber**: every bit, every 1-2 weeks.\n- **Metadata Scanner**: index vs OSDs, ~1M blocks/s, weekly full pass.\n- **Storage Watcher**: black-box 1% sample re-read over a month.\n- **Trash Inspector**: deletes are staged as trash and checked (and kept one extra day).\n- **Extent Referee**: every unlink must match an inspected, instructed removal.\n- **Cross-zone Verifier**: FileJournal vs each zone.\n\nThey run on Staging too, and drills deliberately corrupt data to prove the verifiers catch it. Verification is >50% of disk and DB load: that is the price of trusting your own storage.',
    },
  ],
  lessons: [
    'Immutability is a superpower: write-once blocks make placement, replication, repair and caching dramatically simpler.',
    'Add a level of indirection where things move: index to stable buckets, and keep the bucket→machine map small so repairs update one row.',
    'Keep storage nodes dumb and coordinators soft-state; put authoritative state in a boring, replicated database.',
    'Prefer simple protocols (write all, retry elsewhere) over clever ones (quorums) when the workload allows it.',
    'Match encoding to data temperature: replicate hot data, erasure-code cold data.',
    'Separate failure domains (zones, cells) so a mistake has a bounded blast radius.',
    'Durability you cannot verify is durability you do not have: budget heavily for independent verifiers and failure drills.',
  ],
  failures: [
    { node: 'osd', scenario: 'A storage machine (>1 PB) fails', impact: 'Thousands of volumes lose one replica or fragment; reads for its blocks must go elsewhere or reconstruct.', mitigation: 'After 15 min the Master closes affected volumes and rebuilds them from hundreds of OSDs in parallel; generation numbers fence the old node if it returns.' },
    { node: 'master', scenario: 'The cell Master crashes mid-repair', impact: 'Background repair, GC and new-bucket creation pause.', mitigation: 'Master is soft-state and off the data path: reads continue, writes continue until open buckets run out. Uncommitted repairs are redone; Reconcile rolls back half-finished ones.' },
    { node: 'bi', scenario: 'Block Index shard unavailable in a zone', impact: 'Puts and Gets for those hashes cannot be resolved locally.', mitigation: 'Frontends forward the request to the other zone, which has an independent index and copy.' },
    { node: 'zone2', scenario: 'An entire region is lost or misconfigured', impact: 'One of the two copies disappears.', mitigation: 'Every block lives independently in at least two zones; cross-zone lag is ~1 s and part of the durability model. Zones are separate admin domains.' },
    { node: 'scrub', scenario: 'Silent bit-rot on a disk', impact: 'A replica returns corrupted bytes that would otherwise be noticed only on a rare read.', mitigation: 'Scrubber checksums every bit every 1-2 weeks and triggers re-replication within about an hour.' },
    { node: 'vm', scenario: 'A software bug wrongly deletes extents', impact: 'Potential real data loss, which no durability model covers.', mitigation: 'Deletes are staged in trash, checked by the Trash Inspector and Extent Referee, and kept an extra day; code soaks on Staging under verifiers for a week.' },
  ],
  quiz: [
    { q: 'Why does Magic Pocket index blocks to buckets instead of directly to machines?', options: ['MySQL cannot store machine names', 'So moving or repairing a 1 GB volume updates one small mapping instead of millions of index rows', 'To save hash computation', 'Because buckets are encrypted'], answer: 1, explain: 'The huge Block Index points at stable buckets; only the small Replication Table changes when volumes move.' },
    { q: 'What makes "write to every OSD, retry elsewhere on failure" viable instead of quorum writes?', options: ['OSDs never fail', 'Blocks are immutable and can be placed in any open volume, so a failed write can simply go somewhere else', 'Quorums are illegal in MySQL', 'Clients write directly to disks'], answer: 1, explain: 'Free placement plus immutability means no replica divergence to reconcile; just pick another volume.' },
    { q: 'The cell Master is down. What still works?', options: ['Nothing', 'Reads, and writes until the cell runs out of open buckets', 'Only repairs', 'Only cross-zone replication'], answer: 1, explain: 'The Master is soft-state and not on the data path; the Replication Table holds authoritative state.' },
    { q: 'Why wait 15 minutes before repairing a failed OSD?', options: ['To save electricity', 'To avoid huge repair traffic for routine reboots, while keeping the vulnerable window short', 'Because MySQL replication takes 15 minutes', 'It is a legal requirement'], answer: 1, explain: 'Most outages are restarts. Repairing petabytes on every reboot would waste bandwidth; waiting too long risks a second failure.' },
    { q: 'Why does Dropbox spend over half its disk and DB load on verification?', options: ['To benchmark hardware', 'Because durability models ignore bugs and operator error; only independent checks prove data is really there', 'For billing', 'To warm caches'], answer: 1, explain: '27 nines on paper means nothing if a bug deletes data. Verifiers catch what models cannot.' },
  ],
  concepts: ['checksums', 'data-replication', 'database-sharding', 'fault-tolerance', 'disaster-recovery', 'reliability', 'heartbeats', 'service-discovery'],
  references: [
    { title: 'Dropbox Tech: Inside the Magic Pocket (2016)', url: 'https://dropbox.tech/infrastructure/inside-the-magic-pocket' },
    { title: 'Dropbox Tech: Pocket watch, verifying exabytes of data', url: 'https://dropbox.tech/infrastructure/pocket-watch' },
    { title: 'Dropbox Tech: Scaling to exabytes and beyond', url: 'https://dropbox.tech/infrastructure/magic-pocket-infrastructure' },
    { title: 'Microsoft Research: Erasure Coding in Windows Azure Storage (LRC)', url: 'https://www.usenix.org/conference/atc12/technical-sessions/presentation/huang' },
  ],
});
