SD.design({
  id: 's3-object-storage',
  title: 'Distributed Object Storage',
  company: 'Amazon S3 / Google Cloud Storage / Azure Blob',
  difficulty: 'hard',
  order: 11,
  featured: true,
  icon: '🪣',
  tagline: 'Store trillions of objects, never lose one, and make every write instantly visible.',
  summary:
    "An object store keeps arbitrary blobs (bytes to terabytes) under a `bucket/key` name with a simple PUT / GET / DELETE / LIST API. It is the storage layer underneath most of the internet: backups, data lakes, images, logs, ML datasets. " +
    "The design splits into a **data plane** (huge fleets of disks holding erasure-coded fragments) and a **metadata plane** (a sharded, strongly consistent index from key to fragment locations). " +
    "The hard parts are **durability** at “11 nines” despite millions of disks failing continuously, the economics of **erasure coding vs replication**, **placement** across failure domains, **strong read-after-write consistency** on a cached, distributed index, **multipart uploads** of 5 TB objects, and **garbage collection** that never deletes live data.",
  analogy:
    "A gigantic coat-check with a card catalogue. Your coat (the object) is cut into 14 labelled pieces in a clever way so that *any* 10 of them can rebuild it, and the pieces are hung in three different buildings. " +
    "The catalogue card says where each piece is. When a building floods, staff quietly sew replacement pieces from the surviving ones. You only ever deal with the card; you never know your coat was in pieces.",
  numbers: [
    { value: '400T+', label: 'objects stored (S3, 2025)' },
    { value: '11 nines', label: 'designed durability' },
    { value: '1.4×', label: 'raw overhead with RS(10,4)' },
    { value: '5 TB', label: 'max object (multipart)' },
  ],
  requirements: {
    functional: [
      "Create buckets; `PUT`, `GET` (with byte ranges), `HEAD`, `DELETE` objects up to 5 TB.",
      "`LIST` keys by prefix with delimiter (simulating folders) and pagination.",
      "**Multipart upload** for large objects: upload parts in parallel, then complete atomically.",
      "Optional **versioning**, lifecycle rules (expire, transition to cold tiers), and event notifications.",
      "Access control: IAM policies, bucket policies, signed URLs.",
    ],
    nonFunctional: [
      "**Durability**: 99.999999999% (11 nines) per object per year — lose ~1 in 100 billion objects a year at most.",
      "**Availability**: 99.99% for standard storage; reads and writes continue through the loss of an entire AZ.",
      "**Strong read-after-write consistency** for PUTs, overwrites, deletes and LIST (S3 has offered this since Dec 2020).",
      "Effectively unlimited scale: trillions of objects, exabytes, millions of requests per second; per-prefix throughput scales automatically.",
      "Low cost per GB — storage efficiency matters more than latency (first byte in tens of ms is fine).",
    ],
    outOfScope: ["File-system semantics (rename, append, locks)", "Compute on data (S3 Select / Object Lambda)", "Billing pipeline"],
  },
  estimation: {
    inputs: [
      { id: 'objects', label: 'Objects stored', value: 1e12, min: 1e9, max: 5e14, step: 1e9 },
      { id: 'kb', label: 'Average object size', value: 500, min: 1, max: 100000, step: 1, unit: 'KB' },
      { id: 'k', label: 'Erasure coding data fragments (k)', value: 10, min: 1, max: 20, step: 1 },
      { id: 'm', label: 'Parity fragments (m)', value: 4, min: 1, max: 8, step: 1 },
      { id: 'afr', label: 'Annual disk failure rate', value: 2, min: 0.1, max: 10, step: 0.1, unit: '%' },
      { id: 'repair', label: 'Time to repair a lost fragment', value: 6, min: 1, max: 168, step: 1, unit: 'hours' },
    ],
    outputs: [
      { label: 'Logical data', unit: 'bytes', f: (v) => v.objects * v.kb * 1000 },
      { label: 'Raw capacity with EC (k+m)/k', unit: 'bytes', f: (v) => v.objects * v.kb * 1000 * ((v.k + v.m) / v.k) },
      { label: 'Raw capacity with 3× replication', unit: 'bytes', f: (v) => v.objects * v.kb * 1000 * 3, note: 'for comparison' },
      { label: 'Disks needed (20 TB each, EC)', f: (v) => Math.ceil((v.objects * v.kb * 1000 * ((v.k + v.m) / v.k)) / 20e12) },
      { label: 'Disk failures per day', f: (v) => ((Math.ceil((v.objects * v.kb * 1000 * ((v.k + v.m) / v.k)) / 20e12) * v.afr) / 100 / 365).toFixed(1) },
      { label: 'Metadata index (~1 KB / object)', unit: 'bytes', f: (v) => v.objects * 1000 },
      {
        label: 'Durability (independent failures)', note: 'P(more than m of k+m fragments lost within one repair window), per year',
        f: (v) => {
          const n = v.k + v.m, r = v.m + 1;
          let logC = 0;
          for (let i = 0; i < r; i++) logC += Math.log10(n - i) - Math.log10(i + 1);
          const p = (v.afr / 100) * (v.repair / 8760);
          const logLoss = logC + r * Math.log10(p) + Math.log10(8760 / v.repair);
          return Math.max(0, -logLoss).toFixed(1) + ' nines';
        },
      },
    ],
    notes:
      "Try k=1, m=2 (that is 3× replication): with 2% AFR and 6 h repair you get roughly **11 nines** — the classic number. RS(10,4) gives far more nines on paper at less than half the raw cost. " +
      "Real-world durability is dominated by **correlated** failures (a bad disk batch, a power event, a software bug, an operator mistake), which is why designers target 11 nines rather than trusting the 20+ the independent-failure maths suggests. Repair speed is the lever you control: halving repair time multiplies durability by roughly 2^(m+1).",
  },
  api: [
    { method: 'PUT', path: '/{bucket}/{key}', desc: 'Upload an object (≤ 5 GB in one request)',
      req: 'Content-MD5: Q2hlY2sgSW50ZWdyaXR5IQ==\nx-amz-checksum-crc32c: …\n<bytes>',
      res: '200 OK\nETag: "9b2cf535f27731c974343645a3985328"\nx-amz-version-id: 3sL4kqtJlcpXroDTDmJ',
      notes: "Success means the data is durably stored across ≥ 3 AZs **and** visible to every subsequent GET/LIST. Client-supplied checksums are verified end-to-end." },
    { method: 'GET', path: '/{bucket}/{key}', desc: 'Download (optionally a byte range)', req: 'Range: bytes=0-1048575', res: '206 Partial Content\n<bytes>', notes: "Range reads let clients parallelise large downloads and seek within files (Parquet, video)." },
    { method: 'GET', path: '/{bucket}?list-type=2&prefix=logs/2026/10/&delimiter=/', desc: 'List keys', res: '{ "Contents": [...], "CommonPrefixes": ["logs/2026/10/17/"], "NextContinuationToken": "…" }', notes: "Keys are stored sorted, so prefix listing is a range scan on the index. There are no real directories." },
    { method: 'DELETE', path: '/{bucket}/{key}', desc: 'Delete (or add a delete marker if versioned)', notes: "Bytes are reclaimed later by garbage collection." },
    { method: 'POST', path: '/{bucket}/{key}?uploads', desc: 'Multipart: initiate → returns UploadId', res: '{ "UploadId": "VXBsb2FkIElE" }', notes: "Then `PUT ?partNumber=N&uploadId=…` for 1–10,000 parts of 5 MB–5 GB each, in parallel and retryable." },
    { method: 'POST', path: '/{bucket}/{key}?uploadId=…', desc: 'Multipart: complete', req: '<CompleteMultipartUpload>\n  <Part><PartNumber>1</PartNumber><ETag>"a54…"</ETag></Part> …\n</CompleteMultipartUpload>', notes: "Atomic: the object appears all at once, assembled from the listed parts. Unlisted parts are garbage-collected." },
  ],
  dataModel: [
    { name: 'object_index', store: 'Sharded, replicated KV (range-partitioned by bucket+key)', fields: [['bucket_id + key', 'bytes PK', 'sorted → prefix LIST is a range scan'], ['version_id', 'string', 'newest first'], ['size / etag / checksum', '', ''], ['storage_class', 'enum', 'STANDARD | IA | GLACIER'], ['chunk_map', 'list', '[{stripe_id, offset, length}]'], ['is_delete_marker', 'bool', ''], ['metadata', 'map', 'user headers, ACL ref']],
      why: "The truth of “what exists”. Range partitioning keeps keys sorted for LIST; partitions split automatically when a prefix gets hot or large." },
    { name: 'stripes', store: 'Placement / chunk map service', fields: [['stripe_id', 'uuid PK', ''], ['scheme', 'string', 'e.g. RS(10,4)'], ['fragments', 'list', '[{node, disk, extent, offset, crc}] × 14'], ['state', 'enum', 'HEALTHY | DEGRADED | REPAIRING']],
      why: "Maps a logical stripe to its physical fragments. Repair and GC operate at this level without touching object metadata." },
    { name: 'multipart_uploads', store: 'Same index (separate namespace)', fields: [['upload_id', 'string PK', ''], ['bucket + key', '', ''], ['parts', 'map', 'partNumber → {etag, size, chunk_map}'], ['initiated_at', 'timestamp', 'lifecycle aborts stale uploads']],
      why: "Parts are stored like small objects; completion just writes one object_index entry that stitches their chunk maps together." },
    { name: 'disk extents (on storage node)', store: 'Local append-only log-structured store', fields: [['extent_id', 'int', '~1 GB append-only file'], ['records', 'bytes', 'fragment + header + CRC'], ['live_bytes', 'int', 'for compaction']],
      why: "Small fragments are packed into large extents so disks see sequential writes; deletes are reclaimed by compacting extents (S3 uses ShardStore, an LSM-like engine in Rust)." },
  ],
  architecture: {
    intro: "Front-ends are stateless. They ask the **metadata plane** where things are (or should go) and stream bytes directly to/from the **data plane**. Background workers repair, garbage-collect and tier data continuously.",
    nodes: [
      { id: 'client', label: 'SDK / Client', type: 'client', col: 0, row: 1, desc: "AWS SDK, CLI, browsers via presigned URLs. SDKs handle retries, multipart uploads and parallel ranged GETs." },
      { id: 'lb', label: 'Load Balancer', sub: 'DNS + L4', type: 'lb', col: 1, row: 1, desc: "DNS spreads clients across many front-end IPs; L4 load balancers fan out to the front-end fleet in each AZ.", tech: ['DNS round-robin', 'L4 LB'] },
      { id: 'iam', label: 'Auth / IAM', sub: 'SigV4, policies', type: 'auth', col: 2, row: 0, desc: "Validates request signatures and evaluates IAM, bucket and ACL policies. Results are cached aggressively because every request needs them." },
      { id: 'fe', label: 'Front-end Fleet', sub: 'stateless API', type: 'service', col: 2, row: 1, multi: true, desc: "Parses the REST API, authenticates, computes checksums, erasure-codes on PUT and decodes on GET, streams bytes to/from storage nodes. Holds no durable state." },
      { id: 'placement', label: 'Placement Service', sub: 'where do fragments go', type: 'scheduler', col: 3, row: 0, desc: "Chooses k+m storage nodes for each new stripe: spread across AZs, racks and power domains, balanced by free space and load, avoiding nodes being drained.", tech: ['custom'] },
      { id: 'storage', label: 'Storage Nodes', sub: 'millions of disks', type: 'storage', col: 4, row: 1, multi: true, desc: "Dense servers (dozens of HDDs each) storing fragments in append-only extents with per-record CRCs. Dumb by design: store, read, verify, report.", tech: ['ShardStore', 'HDD / SMR'] },
      { id: 'repair', label: 'Repair & Scrubber', sub: 'heal + verify', type: 'worker', col: 5, row: 1, desc: "Continuously re-reads data to verify checksums (scrubbing) and rebuilds lost or corrupt fragments from surviving ones onto new disks. The single most important durability component.", tech: ['background fleet'] },
      { id: 'meta', label: 'Metadata Service', sub: 'index front + cache', type: 'service', col: 3, row: 2, multi: true, desc: "Reads and writes the object index. Caches hot entries; consults the witness to know whether a cached entry may be stale. Commits a PUT by atomically writing the new version." },
      { id: 'index', label: 'Object Index', sub: 'range-partitioned', type: 'db', col: 4, row: 2, desc: "Sorted, replicated, strongly consistent KV of `bucket/key → version → chunk map`. Each partition is a small replicated state machine (Paxos/chain replication). Partitions split by size and request rate.", tech: ['DynamoDB-like', 'Paxos groups'] },
      { id: 'witness', label: 'Witness', sub: 'latest-version tracker', type: 'cache', col: 4, row: 3, desc: "A small, fast, strongly consistent service that records which index write is newest per key range. Lets caches serve reads safely: a cache entry older than the witness says is refreshed first." },
      { id: 'gc', label: 'Garbage Collector', type: 'worker', col: 5, row: 2, desc: "Finds stripes no longer referenced by any object version (overwrites, deletes, aborted multipart parts) and deletes their fragments after a safety delay; then storage nodes compact extents." },
      { id: 'q', label: 'Event Stream', sub: 'notifications', type: 'queue', col: 2, row: 3, desc: "ObjectCreated / ObjectRemoved events to SQS, SNS, Lambda, EventBridge — published after commit, at-least-once.", tech: ['internal log', 'SQS/SNS'] },
      { id: 'lifecycle', label: 'Lifecycle & Tiering', type: 'scheduler', col: 5, row: 3, desc: "Applies lifecycle rules: expire old versions, abort stale multipart uploads, move cold objects to cheaper storage classes (fewer, denser, slower drives or tape)." },
    ],
    edges: [
      { from: 'client', to: 'lb', label: 'HTTPS' },
      { from: 'lb', to: 'fe' },
      { from: 'fe', to: 'iam', label: 'authorize' },
      { from: 'fe', to: 'placement', label: 'pick nodes' },
      { from: 'fe', to: 'storage', label: 'fragments', both: true },
      { from: 'fe', to: 'meta', label: 'commit / lookup' },
      { from: 'storage', to: 'placement', label: 'capacity + health', async: true },
      { from: 'meta', to: 'index', label: 'read / CAS' },
      { from: 'meta', to: 'witness', label: 'fresh?' },
      { from: 'meta', to: 'q', label: 'events', async: true },
      { from: 'repair', to: 'storage', label: 'scrub / rebuild' },
      { from: 'gc', to: 'index', label: 'live refs' },
      { from: 'gc', to: 'storage', label: 'delete', async: true },
      { from: 'lifecycle', to: 'index', label: 'expire / tier' },
    ],
  },
  flows: [
    {
      id: 'put', name: 'PUT an object (durable, then visible)',
      steps: [
        { from: 'client', to: 'lb', text: "`PUT /photos/2026/cat.jpg` (3 MB) with a CRC32C checksum header." },
        { from: 'lb', to: 'fe', text: "Routed to a front-end in the client's AZ." },
        { from: 'fe', to: 'iam', text: "Verify the SigV4 signature and that the caller may `s3:PutObject` on this bucket (cached policy decision)." },
        { from: 'fe', to: 'placement', text: "Ask for 14 storage nodes for a new RS(10,4) stripe: ≥ 4 per AZ across 3 AZs, different racks." },
        { at: 'fe', text: "Stream the body, verify the checksum, split into 10 data fragments and compute 4 parity fragments." },
        { from: 'fe', to: 'storage', text: "Write all 14 fragments in parallel; each node appends to an extent, fsyncs, and acks with a CRC." },
        { from: 'fe', to: 'meta', text: "Only after enough fragments are durable (all 14, or a quorum with repair scheduled) commit the metadata." },
        { from: 'meta', to: 'index', text: "Atomically write version `v7` of `photos/2026/cat.jpg` → stripe id. This is the **linearization point**: the object now exists." },
        { from: 'meta', to: 'witness', text: "Advance the witness for this key range so any cache holding `v6` knows it is stale." },
        { from: 'meta', to: 'q', text: "Publish `ObjectCreated` asynchronously; return `200 OK` with ETag and version id." },
      ],
    },
    {
      id: 'get', name: 'GET an object (read path)',
      steps: [
        { from: 'client', to: 'lb', text: "`GET /photos/2026/cat.jpg`." },
        { from: 'lb', to: 'fe', text: "Any front-end can serve it." },
        { from: 'fe', to: 'meta', text: "Look up the latest version of the key." },
        { from: 'meta', to: 'witness', text: "Metadata cache has an entry; the witness confirms nothing newer was written → serve from cache. (If stale, read from the index.)" },
        { from: 'fe', to: 'storage', text: "Request the 10 data fragments, plus 1–2 extra in parallel to hedge against slow disks — use the first 10 to arrive." },
        { at: 'fe', text: "If all data fragments came back, just concatenate. If one disk was slow or dead, decode from any 10 of 14. Verify CRCs." },
        { from: 'fe', to: 'client', text: "Stream the bytes; first byte typically in tens of ms." },
      ],
    },
    {
      id: 'multipart', name: 'Multipart upload of a 50 GB file',
      steps: [
        { from: 'client', to: 'fe', text: "`POST ?uploads` → the front-end records a new upload and returns `UploadId`." },
        { from: 'fe', to: 'meta', text: "Store the upload record (bucket, key, initiated_at) — the object does not exist yet." },
        { at: 'client', text: "SDK splits the file into 500 × 100 MB parts and uploads 16 in parallel; failed parts are retried individually." },
        { from: 'fe', to: 'storage', text: "Each part is erasure-coded and stored like a small object; its ETag and chunk map are added to the upload record." },
        { from: 'client', to: 'fe', text: "`POST ?uploadId=…` with the ordered list of part numbers + ETags." },
        { from: 'meta', to: 'index', text: "One atomic index write creates the object whose chunk map is the concatenation of the parts' maps. No bytes are copied." },
        { at: 'meta', text: "Parts not listed in the completion, and uploads never completed, are reclaimed later by lifecycle rules + GC." },
      ],
    },
    {
      id: 'repair', name: 'A disk dies → automatic repair',
      steps: [
        { at: 'storage', text: "A 20 TB drive fails. It held ~1M fragments from ~1M different stripes." },
        { from: 'storage', to: 'placement', text: "Node heartbeat reports the disk dead; affected stripes are marked DEGRADED (13 of 14 fragments)." },
        { at: 'repair', text: "Repair work is prioritised by risk: stripes missing 2+ fragments first. Every stripe is still readable." },
        { from: 'repair', to: 'storage', text: "For each stripe, read 10 surviving fragments from many different disks, recompute the lost fragment." },
        { from: 'repair', to: 'storage', text: "Write the new fragment to a node chosen by placement (same AZ spread rules). Because the work is spread over thousands of disks, the whole drive is rebuilt in hours, not days." },
        { at: 'repair', text: "Stripe returns to HEALTHY. Faster repair = shorter window for a second and third failure = higher durability." },
      ],
    },
    {
      id: 'gc', name: 'Delete and garbage collection',
      steps: [
        { from: 'client', to: 'fe', text: "`DELETE /photos/2026/cat.jpg` on an unversioned bucket." },
        { from: 'meta', to: 'index', text: "Remove the key (or write a tombstone). The object is gone for every reader immediately; bytes still exist." },
        { from: 'gc', to: 'index', text: "Periodically compute which stripes are still referenced by any version, upload or in-flight write." },
        { at: 'gc', text: "Unreferenced stripes older than a safety delay (e.g. 24 h, longer than any in-flight PUT) become candidates." },
        { from: 'gc', to: 'storage', text: "Mark fragments deleted; storage nodes later **compact** extents, copying live records forward and freeing space." },
      ],
    },
  ],
  deepDives: [
    {
      title: '🧱 Separate the metadata plane from the data plane',
      md:
        "Objects range from 1 byte to 5 TB, but every request needs a metadata lookup. Mixing the two (e.g. storing metadata next to data on storage nodes) makes LIST impossible and ties metadata scaling to disk count. So:\n\n" +
        "- **Metadata plane**: a sorted, range-partitioned, replicated KV index. Small records (~1 KB), very high request rates, strong consistency. Each partition is a replicated state machine; partitions **split automatically** when they get hot (S3 documents ~3,500 PUT and ~5,500 GET per second per prefix partition, then scales by splitting).\n" +
        "- **Data plane**: storage nodes that only know about extents and fragments. No idea what a bucket is. Scales with capacity.\n" +
        "- **Front-ends** glue them together and do the CPU work (checksums, erasure coding).\n\n" +
        "**Hot prefixes**: keys like `2026-10-17-...` concentrate today's writes in one partition. The system splits partitions by load; clients can help by adding entropy early in keys for extreme rates.",
      options: [
        { name: 'Hash-partitioned index', pros: ['Perfectly even load'], cons: ['LIST by prefix must scatter-gather across every partition'] },
        { name: 'Range-partitioned index with auto-split', pros: ['Prefix LIST is a single range scan', 'Splits follow real load'], cons: ['Sequential key patterns create temporary hot spots until split'], chosen: true },
        { name: 'Directory tree (file-system style)', pros: ['Real directories, cheap rename'], cons: ['Deep paths add lookups; directory locks become hot spots; not needed for a flat namespace'] },
      ],
      verdict: "Range-partitioned, strongly consistent metadata index with automatic splitting; dumb, capacity-oriented storage nodes; stateless front-ends doing the coding work.",
    },
    {
      title: '🧮 Erasure coding vs replication',
      md:
        "**Replication** stores 3 full copies: simple, fast reads, fast repair (copy one replica), but 3× raw storage. **Reed–Solomon RS(k, m)** splits data into k fragments and computes m parity fragments; *any* k of the k+m reconstruct the data. RS(10,4) tolerates 4 lost fragments at 1.4× overhead — more durable *and* less than half the cost of 3×.\n\n" +
        "Costs of EC: CPU to encode/decode; reads of small objects touch many disks; and **repair is expensive** — rebuilding one lost fragment reads k fragments (10× the data). Locally Repairable Codes (LRC, used by Azure) add local parity groups so most single-fragment repairs read only a few fragments.\n\n" +
        "Common hybrid: write new or small objects replicated (fast, low-latency), then **asynchronously re-encode** into EC stripes once they cool down; pack many small objects into one stripe so EC stays efficient.",
      options: [
        { name: '3× replication', pros: ['Simple, fast reads and repairs', 'Good for small/hot data'], cons: ['200% overhead — at exabyte scale that is billions of dollars of disks'] },
        { name: 'Reed–Solomon (e.g. 10+4)', pros: ['40% overhead, tolerates 4 failures', 'Spread across 3 AZs, survives losing a whole AZ'], cons: ['Repair reads k fragments', 'Small-object reads fan out'], chosen: true },
        { name: 'LRC (e.g. Azure 12+2+2)', pros: ['Cheap single-fragment repair via local parity'], cons: ['More complex codec; slightly higher overhead than plain RS for the same failure tolerance'] },
      ],
      verdict: "Replicate briefly for fresh/small data, then erasure-code into wide stripes spread across ≥ 3 AZs. Pick (k, m) so that losing an entire AZ still leaves ≥ k fragments.",
      diagram: {
        intro: 'RS(6,3) stripe spread over 3 AZs: any 6 of 9 fragments rebuild the object. Lose a whole AZ (3 fragments) and the data is still readable.',
        nodes: [
          { id: 'obj', label: 'Object', sub: '6 MB', type: 'client', col: 0, row: 1, desc: 'The bytes to store.' },
          { id: 'enc', label: 'RS Encoder', sub: 'k=6, m=3', type: 'service', col: 1, row: 1, desc: 'Splits into 6 × 1 MB data fragments and computes 3 parity fragments with Reed–Solomon arithmetic over GF(2^8).' },
          { id: 'az1', label: 'AZ-a', sub: 'd1 d2 p1', type: 'storage', col: 2, row: 0, desc: 'Three fragments on three different racks.' },
          { id: 'az2', label: 'AZ-b', sub: 'd3 d4 p2', type: 'storage', col: 2, row: 1, desc: 'Three fragments on three different racks.' },
          { id: 'az3', label: 'AZ-c', sub: 'd5 d6 p3', type: 'storage', col: 2, row: 2, desc: 'Three fragments on three different racks.' },
          { id: 'dec', label: 'RS Decoder', sub: 'any 6 of 9', type: 'service', col: 3, row: 1, desc: 'Solves for missing data fragments from any 6 survivors.' },
          { id: 'out', label: 'Reader', type: 'client', col: 4, row: 1, desc: 'Gets the original bytes.' },
        ],
        edges: [
          { from: 'obj', to: 'enc' },
          { from: 'enc', to: 'az1' }, { from: 'enc', to: 'az2' }, { from: 'enc', to: 'az3' },
          { from: 'az1', to: 'dec' }, { from: 'az2', to: 'dec' }, { from: 'az3', to: 'dec' },
          { from: 'dec', to: 'out' },
        ],
        flows: [
          { id: 'azloss', name: 'Read while an entire AZ is down', steps: [
            { from: 'obj', to: 'enc', text: 'At write time the object was split into d1..d6 and parity p1..p3 was computed.' },
            { from: 'enc', to: 'az1', text: 'd1, d2, p1 stored in AZ-a.' },
            { from: 'enc', to: 'az2', text: 'd3, d4, p2 stored in AZ-b.' },
            { from: 'enc', to: 'az3', text: 'd5, d6, p3 stored in AZ-c.' },
            { at: 'az2', text: 'AZ-b loses power: d3, d4, p2 are unreachable.' },
            { from: 'az1', to: 'dec', text: 'Read d1, d2, p1 from AZ-a.' },
            { from: 'az3', to: 'dec', text: 'Read d5, d6, p3 from AZ-c. That is 6 fragments — enough.' },
            { from: 'dec', to: 'out', text: 'Solve for d3 and d4, return the full object. Overhead was 1.5× instead of 3×.' },
          ] },
        ],
      },
    },
    {
      title: '🔢 Where do “11 nines” come from?',
      md:
        "Durability is a race between **failures** and **repair**. For a stripe to be lost, more than m of its k+m fragments must fail *before* repair finishes. With per-disk annual failure rate AFR and repair time T:\n\n" +
        "```\np      = AFR × T / 8760            # chance a given fragment's disk dies during one repair window\nP_loss ≈ C(k+m, m+1) × p^(m+1)     # per window\nP_year ≈ P_loss × 8760 / T\n```\n\n" +
        "With 3× replication (k=1, m=2), AFR 2%, T = 6 h: p ≈ 1.4×10⁻⁵, P_year ≈ 4×10⁻¹² → about **11 nines**. Try it in the calculator above.\n\n" +
        "What actually threatens durability:\n\n" +
        "- **Correlated failures**: a bad firmware batch, a rack power event, an AZ flood. Defence: spread fragments across AZs, racks, power, hardware batches.\n" +
        "- **Silent corruption** (bit rot, misdirected writes): defence: CRCs on every record, end-to-end checksums from client to disk, continuous **scrubbing**.\n" +
        "- **Software bugs and operator error** — the biggest real risk. Defence: deletion delays, staged deployments, formal methods (AWS used TLA+ and lightweight formal verification for ShardStore), and never trusting a single code path to delete data.\n" +
        "- **Slow repair**: repair throughput must scale with fleet size; spreading a dead disk's fragments over thousands of peers makes rebuild parallel.",
      verdict: "Durability is engineered by wide spreading across failure domains, fast parallel repair, end-to-end checksums with scrubbing, and extreme caution around deletes. The math gives the floor; culture and process protect it.",
    },
    {
      title: '✅ Strong read-after-write consistency on a cached index',
      md:
        "Until December 2020, S3 offered only eventual consistency for overwrites and LIST: after a PUT you might read the old version for a while. Data lakes (Spark, Hadoop) needed workarounds like S3Guard. Now every GET and LIST reflects all completed writes. The challenge: the metadata layer is heavily **cached** for performance, and caches are where staleness comes from.",
      options: [
        { name: 'Eventual consistency', pros: ['Simple caching, maximum availability'], cons: ['Users see stale or missing objects; analytics jobs read incomplete data'] },
        { name: 'No caching — read the replicated index every time', pros: ['Strongly consistent by construction'], cons: ['Far more load and latency on the index for hot keys'] },
        { name: 'Caches + a consistency witness', desc: 'A small, strongly consistent service tracks the latest write sequence per key range; a cache entry is served only if it is at least that new.', pros: ['Keeps cache hit rates', 'Strong consistency with tiny extra cost per read', 'No availability or price trade-off for users'], cons: ['Witness must be extremely available and fast; more protocol complexity'], chosen: true },
      ],
      verdict: "Commit each write as a single atomic index update (the linearization point), and make every cached read check freshness against a witness. A good interview line: consistency is decided in the metadata layer; the data plane is immutable, so it never needs invalidation.",
    },
    {
      title: '🧩 Multipart upload',
      md:
        "Uploading 5 TB in one HTTP request would be fragile: one network blip restarts the whole thing. Multipart upload makes large uploads **parallel, resumable and atomic**:\n\n" +
        "1. `Initiate` → `UploadId` (metadata only).\n" +
        "2. Upload parts (5 MB–5 GB, up to 10,000) independently, in parallel, in any order; retry any failed part.\n" +
        "3. `Complete` with the part list → one atomic metadata write stitches the parts' chunk maps together. No data is copied, so completing a 5 TB upload is instant.\n" +
        "4. `Abort`, or a lifecycle rule, cleans up abandoned uploads — otherwise orphaned parts silently cost money.\n\n" +
        "The object's ETag becomes `md5(concat(part md5s))-N`, which is why multipart ETags are not plain MD5s of the content. Clients also use parts for throughput: 16 parallel streams saturate a link far better than one.",
      verdict: "Model parts as independently stored mini-objects and make completion a pure metadata operation. Atomic visibility comes for free from the single index write.",
    },
    {
      title: '🗑️ Garbage collection without deleting live data',
      md:
        "Overwrites, deletes, expired versions and abandoned multipart parts all leave unreferenced stripes. GC must reclaim them — and a GC bug is the fastest way to destroy durability. Patterns:\n\n" +
        "- **Mark-and-sweep with a delay**, not reference counting on the hot path: refcounts on every write add contention and are easy to get wrong under retries.\n" +
        "- A stripe is deletable only if no index entry, multipart upload or in-flight write references it **and** it is older than the longest possible in-flight operation (writes reserve stripes *before* committing metadata).\n" +
        "- Delete in two steps: mark fragments deleted (recoverable), then physically reclaim during **extent compaction** days later.\n" +
        "- Rate-limit deletions and alert on anomalies (a GC run proposing 10× the usual deletions should halt itself).",
      options: [
        { name: 'Synchronous delete on DELETE', pros: ['Space freed immediately'], cons: ['Races with in-flight reads and retried writes', 'Slows the request path'] },
        { name: 'Reference counting', pros: ['Precise, incremental'], cons: ['Counter updates on every write; leaks or premature deletes on bugs'] },
        { name: 'Periodic mark & sweep + grace period', pros: ['Off the hot path; self-correcting; easy to add safety checks'], cons: ['Space reclaimed hours/days later'], chosen: true },
      ],
      verdict: "Asynchronous mark-and-sweep with generous grace periods, soft-delete first, compaction later, and anomaly brakes. Reclaiming space a day late costs pennies; deleting live data costs trust.",
    },
  ],
  scaling: [
    { stage: '🌱 Single box', md: "Files on a local disk named by key hash, SQLite for metadata. Back up nightly. Durability = one disk's durability." },
    { stage: '🌿 A cluster', md: "Stateless API servers, 3× replication across nodes, a replicated metadata DB (e.g. Postgres/etcd), background re-replication when a node dies. Similar to MinIO/Ceph RGW in small deployments." },
    { stage: '🌳 Multi-AZ region', md: "Range-partitioned metadata with auto-split; placement across AZs; erasure coding for cold data; scrubbing and parallel repair; multipart uploads; lifecycle tiers." },
    { stage: '🌍 Hyperscale', md: "Millions of drives per region, hundreds of trillions of objects. Strong consistency via witness-checked caches; formal verification of storage engines; storage classes from SSD-backed to tape; cross-region replication as an opt-in feature on top." },
  ],
  tradeoffs: [
    { decision: 'Redundancy', chosen: 'Erasure coding (≈1.4×) for most data', alternative: '3× replication', why: "Higher durability at less than half the raw cost; replication kept for small/hot data." },
    { decision: 'Metadata partitioning', chosen: 'Range-partitioned, auto-split', alternative: 'Hash-partitioned', why: "Prefix LIST becomes a range scan; splits follow real load." },
    { decision: 'Consistency', chosen: 'Strong read-after-write', alternative: 'Eventual', why: "Removes a whole class of client bugs; achieved without giving up caching by using a witness." },
    { decision: 'Commit order', chosen: 'Data durable first, metadata commit last', alternative: 'Metadata first', why: "Readers can never see an object whose bytes are not yet durable; failed writes just leave garbage for GC." },
    { decision: 'Deletes', chosen: 'Async mark-and-sweep with delay', alternative: 'Synchronous delete / refcounts', why: "Safety over space efficiency." },
    { decision: 'Namespace', chosen: 'Flat keys (folders are prefixes)', alternative: 'Real directory tree', why: "No directory hot spots or rename semantics to maintain; scales horizontally." },
  ],
  failures: [
    { node: 'storage', scenario: 'Disks, servers or a whole AZ fail', impact: "Some fragments of many stripes are unreachable.", mitigation: "Reads decode from any k of k+m; stripes span 3 AZs so an AZ loss leaves enough fragments; repair rebuilds missing fragments in parallel." },
    { node: 'repair', scenario: 'Repair falls behind (e.g. after a correlated failure)', impact: "More stripes stay degraded longer — durability erodes silently.", mitigation: "Prioritise stripes with the fewest remaining fragments; scale repair bandwidth with the fleet; alert on degraded-stripe backlog, not just on disk failures." },
    { node: 'index', scenario: 'A metadata partition loses its leader or becomes hot', impact: "Requests to keys in that range slow down or fail briefly.", mitigation: "Replicated partitions elect a new leader in seconds; automatic split of hot ranges; front-ends retry with backoff (SDKs do this by default)." },
    { node: 'witness', scenario: 'Witness unavailable', impact: "Caches cannot prove freshness.", mitigation: "Fail safe: bypass the cache and read the index (slower but correct). The witness is itself replicated and kept tiny to stay highly available." },
    { node: 'gc', scenario: 'GC bug proposes deleting referenced stripes', impact: "Permanent data loss across many customers — the worst possible failure.", mitigation: "Grace periods, two-phase soft delete, independent re-verification of references, rate limits and anomaly brakes, staged rollout of GC code." },
    { node: 'fe', scenario: 'Front-end crashes mid-PUT', impact: "Client sees an error; some fragments were written.", mitigation: "Metadata was never committed, so the object does not exist (no partial visibility). Client retries; orphaned fragments are collected by GC." },
    { node: 'placement', scenario: 'Placement service down', impact: "New stripes cannot be allocated → PUTs fail.", mitigation: "Front-ends cache pre-allocated placement groups for minutes; placement is replicated per AZ; GETs are unaffected." },
    { node: 'iam', scenario: 'Auth policy service slow', impact: "Every request stalls.", mitigation: "Aggressive caching of policy decisions with short TTL; regional, replicated policy stores." },
  ],
  interviewTips: [
    "Draw the metadata/data split first and explain why each side scales differently.",
    "Do the durability math out loud for 3× replication — getting ~11 nines from AFR and repair time impresses interviewers.",
    "Compare replication and erasure coding with concrete overheads (3× vs 1.4×) and the repair-cost downside of EC.",
    "State the commit order: data durable first, metadata last — it gives atomic visibility and makes crashes harmless.",
    "Mention strong consistency (S3 since 2020) and how caching makes it hard.",
    "Don't forget GC and multipart cleanup; they are where real systems lose data or money.",
  ],
  realWorld: [
    "S3 launched in 2006 and reportedly stores over 400 trillion objects; it moved to strong read-after-write consistency for all requests in December 2020 at no extra cost.",
    "AWS's ShardStore (storage node engine, in Rust) was validated with lightweight formal methods, described in an SOSP 2021 paper.",
    "Azure Storage popularised Locally Repairable Codes to cut repair traffic; Facebook's f4 warm-blob store used RS(10,4) plus XOR across datacenters.",
    "Open-source equivalents: Ceph (RADOS + RGW), MinIO, SeaweedFS.",
  ],
  concepts: ['data-replication', 'checksums', 'strong-vs-eventual-consistency', 'consistent-hashing', 'database-sharding', 'consensus-algorithms', 'storage-engines', 'fault-tolerance', 'disaster-recovery'],
  quiz: [
    { q: "Why commit the metadata entry only AFTER the data fragments are durable?", options: ['Metadata writes are slower', 'So a reader can never find an object whose bytes are missing; a crash mid-write just leaves garbage for GC', 'To save space', 'Because S3 is eventually consistent'], answer: 1, explain: "The index write is the linearization point. Before it, nothing references the fragments; after it, they are already durable." },
    { q: "RS(10,4) vs 3× replication: which statement is true?", options: ['RS uses more raw storage', 'RS tolerates more simultaneous fragment losses at 1.4× instead of 3× overhead, but repairing one fragment reads 10 others', 'Replication tolerates 4 losses', 'RS needs no CPU'], answer: 1, explain: "EC buys durability and cost efficiency at the price of encode/decode CPU and expensive repair reads." },
    { q: "In the durability formula, what is the most effective lever an operator controls?", options: ['Object size', 'Repair time — faster repair shrinks the window in which additional failures can stack up', 'Number of buckets', 'Request rate'], answer: 1, explain: "P_loss scales with p^(m+1) where p ∝ repair time, so halving repair time improves durability by about 2^(m+1)." },
    { q: "Why is the object index range-partitioned rather than hash-partitioned?", options: ['Hashing is slow', 'So LIST by prefix is a contiguous range scan; hot ranges are split automatically', 'Range partitioning has no hot spots', 'To support rename'], answer: 1, explain: "Hashing would scatter a prefix across all partitions. The cost is sequential-key hot spots, handled by auto-splitting." },
    { q: "A metadata cache holds version v6 of a key; a PUT just committed v7. How does the witness design keep reads strongly consistent?", options: ['Caches have a 1 s TTL', 'The reader checks the witness, sees a newer write for that key range, and refreshes from the index before answering', 'Writes invalidate every cache synchronously', 'Clients add ?nocache'], answer: 1, explain: "The witness tracks the newest write sequence cheaply; caches serve only entries at least that new." },
    { q: "Why does GC wait a grace period before deleting unreferenced stripes?", options: ['To batch disk I/O', 'An in-flight PUT may have written fragments but not yet committed metadata; deleting them would break that write', 'For billing', 'Disks need to cool down'], answer: 1, explain: "Fragments exist before their reference does. A grace period longer than any in-flight operation prevents GC from racing writes." },
  ],
  references: [
    { title: 'Werner Vogels — Diving deep on S3 consistency', url: 'https://www.allthingsdistributed.com/2021/04/s3-strong-consistency.html' },
    { title: 'Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3 (SOSP 2021)', url: 'https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3' },
    { title: 'Erasure Coding in Windows Azure Storage (USENIX ATC 2012)', url: 'https://www.usenix.org/conference/atc12/technical-sessions/presentation/huang' },
  ],
});
