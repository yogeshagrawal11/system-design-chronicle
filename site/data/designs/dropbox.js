SD.design({
  id: 'dropbox',
  title: 'File Sync & Storage',
  company: 'Dropbox / Google Drive / OneDrive',
  difficulty: 'hard',
  order: 7,
  featured: true,
  icon: '📦',
  tagline: 'Keep a folder identical on every device: chunk, dedup, upload only what changed, and tell other devices instantly.',
  summary:
    "A file-sync service makes one logical folder appear on every laptop, phone and the web, and keeps it identical as people edit, rename and delete files — often while offline. " +
    "The core insight is to **split files into content-addressed blocks** (named by their SHA-256 hash) and to keep a **separate metadata journal** that says which blocks make up which file at which revision. " +
    "That split gives you dedup (never store or upload the same block twice), delta sync (edit one page of a 2 GB video project → upload one 4 MB block), resumable transfers, and a cheap way to tell other devices *exactly* what changed. " +
    "The hard parts are the sync protocol (cursors over a per-namespace journal plus long-poll notifications), handling concurrent offline edits without losing data, and running exabytes of block storage durably and cheaply.",
  analogy:
    "Think of a library that stores books as loose numbered pages in a giant warehouse, plus a catalogue card for each book listing its page numbers in order. " +
    "If two books share a page (same content), the warehouse keeps one copy. When you revise chapter 3, you send only the new pages and a new catalogue card. " +
    "Other branches subscribe to a bulletin board that says “card #4512 changed” — they fetch the card, see which pages they are missing, and fetch only those.",
  numbers: [
    { value: '700M+', label: 'registered users' },
    { value: '4 MB', label: 'block size (Dropbox)' },
    { value: 'EB-scale', label: 'block storage' },
    { value: '~1 s', label: 'change → other device notified' },
  ],
  requirements: {
    functional: [
      "Upload, download, rename, move and delete files and folders from desktop, mobile and web clients.",
      "**Automatic sync**: a change on one device appears on the user's other devices within seconds.",
      "**Offline edits** are queued locally and reconciled when the device reconnects.",
      "**Shared folders** — multiple users see and edit the same tree.",
      "**Version history** and restore of deleted files (e.g. 30–180 days).",
      "Resumable uploads/downloads of very large files (tens of GB).",
    ],
    nonFunctional: [
      "**Durability above all**: a committed file must never be lost or silently corrupted (target 11+ nines for blocks).",
      "**Bandwidth efficiency**: upload only changed bytes; never re-upload content the server already has.",
      "**Correctness of sync**: devices converge to the same state; concurrent edits never silently overwrite each other.",
      "Low notification latency (p50 ~1 s) while supporting **hundreds of millions of idle connected devices**.",
      "Strong consistency for metadata within a namespace (a folder listing must reflect every committed change in order).",
    ],
    outOfScope: ["Real-time collaborative editing inside a document (see #/design/google-docs)", "Full-text search internals", "Billing & quota enforcement details"],
  },
  estimation: {
    inputs: [
      { id: 'users', label: 'Registered users', value: 500e6, min: 1e6, max: 1e9, step: 1e6 },
      { id: 'gb', label: 'Avg data per user', value: 10, min: 1, max: 200, step: 1, unit: 'GB' },
      { id: 'dau', label: 'Daily active users', value: 20, min: 1, max: 80, step: 1, unit: '%' },
      { id: 'edits', label: 'File changes / active user / day', value: 10, min: 1, max: 200, step: 1 },
      { id: 'mb', label: 'Avg changed bytes uploaded / change', value: 2, min: 0.1, max: 50, step: 0.1, unit: 'MB' },
      { id: 'dedup', label: 'Dedup savings', value: 25, min: 0, max: 80, step: 1, unit: '%' },
    ],
    outputs: [
      { label: 'Logical data stored', unit: 'bytes', f: (v) => v.users * v.gb * 1e9 },
      { label: 'Physical bytes (after dedup, ×1.4 erasure coding)', unit: 'bytes', f: (v) => v.users * v.gb * 1e9 * (1 - v.dedup / 100) * 1.4, note: '3× replication would be ×3 instead of ×1.4' },
      { label: 'Unique 4 MB blocks to index', f: (v) => (v.users * v.gb * 1e9 * (1 - v.dedup / 100)) / 4e6, note: 'each is one row in the block index' },
      { label: 'Metadata commits / sec (avg)', f: (v) => (v.users * (v.dau / 100) * v.edits) / 86400 },
      { label: 'Metadata commits / sec (peak ×3)', f: (v) => ((v.users * (v.dau / 100) * v.edits) / 86400) * 3 },
      { label: 'Upload bandwidth (avg, after dedup)', unit: 'B/s', f: (v) => ((v.users * (v.dau / 100) * v.edits) / 86400) * v.mb * 1e6 * (1 - v.dedup / 100) },
      { label: 'Download bandwidth (avg, ~2 other devices)', unit: 'B/s', f: (v) => ((v.users * (v.dau / 100) * v.edits) / 86400) * v.mb * 1e6 * 2 },
      { label: 'Concurrent long-poll connections', f: (v) => v.users * (v.dau / 100) * 1.5, note: '~1.5 online devices per active user' },
    ],
    notes:
      "The headline numbers are **storage** (exabytes) and **idle connections** (hundreds of millions) — not QPS. Metadata commits are modest (tens of thousands per second) but every one must be strongly consistent. " +
      "Download bandwidth exceeds upload because each change fans out to the user's other devices and to collaborators in shared folders.",
  },
  api: [
    { method: 'POST', path: '/v1/commit', desc: 'Propose a new revision of a file as an ordered list of block hashes',
      req: '{\n  "namespaceId": 8812,\n  "path": "/Thesis/chapter3.docx",\n  "parentRev": 41,                 // revision this edit was based on\n  "blocks": ["9f2c..", "a71e..", "03bd.."],\n  "size": 10485760,\n  "clientMtime": "2026-10-17T09:12:00Z"\n}',
      res: '200 { "status": "need_blocks", "missing": ["a71e.."] }\n200 { "status": "ok", "rev": 42, "journalId": 991204 }\n409 { "status": "conflict", "latestRev": 42 }',
      notes: "Two-phase by design: the first call tells the client which blocks the server lacks. After uploading them the client repeats the same commit, which is **idempotent** (same parentRev + same hash list → same result)." },
    { method: 'PUT', path: '/v1/blocks/{sha256}', desc: 'Upload one block (≤ 4 MB, compressed + encrypted in transit)',
      req: '<raw block bytes>', res: '201 Created',
      notes: "Server recomputes the hash and rejects the block if it does not match the URL — a block's name *is* its checksum, so corruption in transit is detected for free. Re-uploading an existing block is a no-op." },
    { method: 'GET', path: '/v1/blocks/{sha256}', desc: 'Download one block', res: '200 <bytes>', notes: "Immutable content → aggressively cacheable at the edge with no invalidation ever." },
    { method: 'GET', path: '/v1/list?namespaceId=8812&cursor=991100', desc: 'Get every journal entry after a cursor',
      res: '{\n  "entries": [{ "path": "/Thesis/chapter3.docx", "rev": 42, "blocks": [..] }, { "path": "/old.txt", "deleted": true }],\n  "cursor": 991204,\n  "hasMore": false\n}',
      notes: "The cursor is the last journal id the device has applied. Paginate for devices that were offline for weeks." },
    { method: 'GET', path: '/v1/longpoll?cursors=8812:991204,9050:120', desc: 'Hold the connection open until any listed namespace changes (or ~60 s timeout)',
      res: '{ "changes": true, "namespaces": [8812] }   // or { "changes": false, "backoff": 5 }',
      notes: "Returns only a *signal*, not data. The client then calls `/list`. Keeping the notification tiny lets one server hold ~1M connections." },
  ],
  dataModel: [
    { name: 'file_journal', store: 'Sharded MySQL (by namespace_id)', fields: [['namespace_id', 'bigint', 'shard key'], ['journal_id', 'bigint', 'monotonic per namespace — the sync cursor'], ['path', 'varchar', 'normalized, case-folded'], ['rev', 'int', 'per-file revision'], ['blocklist', 'blob', 'ordered list of block hashes'], ['size / mtime', 'bigint / ts', ''], ['is_deleted', 'bool', 'tombstone for history & sync']],
      why: "Append-only log of every change in a namespace. Listing a folder = latest row per path; syncing a device = all rows after its cursor. Keeping a namespace on one shard gives ordered, transactional commits." },
    { name: 'namespaces', store: 'Sharded MySQL', fields: [['namespace_id', 'bigint PK', ''], ['owner_id', 'bigint', ''], ['type', 'enum', 'root | shared folder'], ['mounts', 'list', 'which users mount it, at which path']],
      why: "A shared folder is its own namespace mounted into several users' trees, so a change is written once and every member syncs it via the same journal." },
    { name: 'block_index', store: 'Sharded KV (by hash)', fields: [['sha256', 'bytes(32) PK', 'content address'], ['location', 'string', 'cell / volume / offset in block store'], ['size', 'int', ''], ['created_at', 'ts', 'for GC grace period']],
      why: "Answers “do we already have this block?” for dedup and “where is it?” for downloads. Pure point lookups on a random key → hash-partitioned KV is ideal." },
    { name: 'device_state', store: 'Client-side SQLite', fields: [['namespace_id', 'bigint', ''], ['cursor', 'bigint', 'last applied journal id'], ['local_path', 'text', ''], ['synced_blocklist', 'blob', 'what the server last agreed'], ['local_blocklist', 'blob', 'what is on disk now']],
      why: "The client keeps three trees — local disk, last-synced, and remote — and diffs them. This is how it knows whether a change is local, remote, or a conflict." },
  ],
  architecture: {
    intro: "Two planes: a **block plane** (dumb, huge, immutable content-addressed bytes) and a **metadata plane** (small, strongly consistent journal that says which blocks form which file). Notifications ride on the metadata change stream.",
    nodes: [
      { id: 'client', label: 'Desktop Client', sub: 'watcher + chunker', type: 'client', col: 0, row: 1, desc: "Watches the sync folder (FSEvents / inotify / ReadDirectoryChangesW), splits changed files into blocks, hashes them, and keeps a local SQLite index of what is synced. Does most of the clever work so the servers can stay simple.", tech: ['Rust sync engine', 'SQLite'] },
      { id: 'client2', label: 'Other Device', sub: 'laptop / phone', type: 'client', col: 0, row: 3, desc: "Another device of the same user (or a collaborator on a shared folder). It holds a long-poll open and pulls changes when signalled." },
      { id: 'gw', label: 'API Gateway', sub: 'auth + routing', type: 'gateway', col: 1, row: 2, desc: "Terminates TLS, authenticates the device token, rate-limits, and routes: block traffic to the Block Service, metadata calls to the Metadata Service, long-polls to the Notification Service.", tech: ['Envoy', 'NGINX'] },
      { id: 'block', label: 'Block Service', sub: 'upload / download', type: 'service', col: 2, row: 0, multi: true, desc: "Stateless. Receives blocks, verifies `sha256(bytes) == name`, writes them to the block store, records them in the block index. Serves downloads. Never knows anything about files or folders.", tech: ['Go', 'gRPC'] },
      { id: 'blockidx', label: 'Block Index', sub: 'hash → location', type: 'db', col: 3, row: 1, desc: "Maps each block hash to where its bytes live. Used for dedup checks at commit time and for locating blocks on download. Billions of rows, hash-partitioned.", tech: ['Sharded MySQL', 'DynamoDB', 'Cassandra'] },
      { id: 'blob', label: 'Block Store', sub: 'erasure-coded', type: 'storage', col: 4, row: 0, desc: "Exabyte-scale immutable object storage for 4 MB blocks, spread across zones with erasure coding. Dropbox moved this from S3 to its own system, Magic Pocket, in 2016.", tech: ['Magic Pocket', 'S3'] },
      { id: 'meta', label: 'Metadata Service', sub: 'commit / list', type: 'service', col: 3, row: 2, multi: true, desc: "Validates commits (all blocks present? parent revision still current? permissions?), appends to the namespace journal in one transaction, and emits a change event. Also serves `/list` from a cursor.", tech: ['Python/Go', 'gRPC'] },
      { id: 'cache', label: 'Metadata Cache', sub: 'hot listings', type: 'cache', col: 4, row: 1, desc: "Caches recent journal tails and folder listings so the thundering herd of devices fetching the same change (big shared folder) does not all hit MySQL.", tech: ['Memcached', 'Redis'] },
      { id: 'metadb', label: 'Metadata DB', sub: 'sharded by namespace', type: 'db', col: 5, row: 2, desc: "The source of truth: file journal, namespaces, mounts, sharing ACLs. Sharded by `namespace_id` so a namespace's journal is ordered and transactional on one shard. Replicated across zones.", tech: ['MySQL (Edgestore)', 'Vitess'] },
      { id: 'gc', label: 'Block GC', sub: 'mark & sweep', type: 'worker', col: 5, row: 1, desc: "Finds blocks no longer referenced by any live revision (after history retention expires) and deletes them after a safety grace period.", tech: ['Spark', 'batch jobs'] },
      { id: 'q', label: 'Change Stream', sub: 'namespace events', type: 'queue', col: 4, row: 3, desc: "Every committed journal entry publishes `{namespace_id, journal_id}`. Consumers: notification fan-out, search indexing, previews, audit logs.", tech: ['Kafka'] },
      { id: 'notify', label: 'Notification Svc', sub: 'long-poll fleet', type: 'service', col: 2, row: 4, multi: true, desc: "Holds hundreds of millions of idle long-poll connections, indexed by namespace. On a change event it completes the waiting requests for subscribers of that namespace with a tiny “something changed” signal.", tech: ['Go / epoll', 'Envoy'] },
      { id: 'workers', label: 'Index & Previews', sub: 'async consumers', type: 'worker', col: 5, row: 3, desc: "Generates thumbnails/PDF previews, extracts text for search, scans for malware — all off the commit path.", tech: ['Kafka consumers', 'Elasticsearch'] },
    ],
    edges: [
      { from: 'client', to: 'gw', label: 'commit / blocks' },
      { from: 'client2', to: 'gw', label: 'long-poll / list' },
      { from: 'gw', to: 'block', label: 'PUT/GET block' },
      { from: 'gw', to: 'meta', label: 'commit / list' },
      { from: 'gw', to: 'notify', label: 'long-poll' },
      { from: 'block', to: 'blob', label: 'write bytes' },
      { from: 'block', to: 'blockidx', label: 'record hash' },
      { from: 'meta', to: 'blockidx', label: 'have blocks?' },
      { from: 'meta', to: 'cache', label: 'listings' },
      { from: 'meta', to: 'metadb', label: 'append journal' },
      { from: 'meta', to: 'q', label: 'change event', async: true },
      { from: 'q', to: 'notify', label: 'ns changed', async: true },
      { from: 'q', to: 'workers', async: true },
      { from: 'gc', to: 'metadb', label: 'live refs' },
      { from: 'gc', to: 'blob', label: 'delete', async: true },
    ],
  },
  flows: [
    {
      id: 'upload', name: 'Edit & upload a file (write path)',
      steps: [
        { at: 'client', text: "File watcher sees `chapter3.docx` change. The client splits it into blocks and hashes each with SHA-256 → `[9f2c, a71e, 03bd]`. Only `a71e` differs from the synced version." },
        { from: 'client', to: 'gw', text: "Client sends `commit(path, parentRev=41, blocks=[9f2c,a71e,03bd])` **before** uploading anything." },
        { from: 'gw', to: 'meta', text: "Gateway authenticates the device and routes to a Metadata Service instance." },
        { from: 'meta', to: 'blockidx', text: "Which of these hashes do we already have? → `9f2c` and `03bd` exist; `a71e` is missing." },
        { from: 'meta', to: 'client', text: "Reply `need_blocks: [a71e]`. Nothing is committed yet." },
        { from: 'client', to: 'gw', text: "Client uploads just the 4 MB block `PUT /blocks/a71e` (compressed)." },
        { from: 'gw', to: 'block', text: "Block Service recomputes the hash to verify integrity, then stores the bytes." },
        { from: 'block', to: 'blob', text: "Block is written durably (erasure-coded across zones) and the hash → location row is added to the block index." },
        { from: 'meta', to: 'metadb', text: "Client retries the same commit. Now every block exists and rev 41 is still current, so one transaction appends journal row `991204` (rev 42)." },
        { from: 'meta', to: 'q', text: "Publish `{ns: 8812, journal_id: 991204}` asynchronously. The client gets `ok, rev 42`." },
      ],
    },
    {
      id: 'sync', name: 'Another device picks up the change (read path)',
      steps: [
        { from: 'client2', to: 'gw', text: "The laptop has been holding `GET /longpoll?cursors=8812:991100` open for 40 s." },
        { from: 'gw', to: 'notify', text: "That request is parked on a Notification Service node, registered under namespace 8812." },
        { from: 'q', to: 'notify', text: "The change event for namespace 8812 arrives from the stream." },
        { from: 'notify', to: 'client2', text: "The parked request completes with `{changes: true}` — a few bytes, no file data." },
        { from: 'client2', to: 'gw', text: "Laptop calls `GET /list?ns=8812&cursor=991100`." },
        { from: 'meta', to: 'cache', text: "Metadata Service serves the journal tail (cache, falling back to the DB): `chapter3.docx rev 42 = [9f2c,a71e,03bd]`." },
        { at: 'client2', text: "Diff against local blocks: it already has `9f2c` and `03bd` on disk, so it needs only `a71e`." },
        { from: 'client2', to: 'gw', text: "`GET /blocks/a71e` via the Block Service (edge-cacheable because blocks are immutable)." },
        { at: 'client2', text: "Reassemble the file in a temp location, verify hashes, atomically rename into place, advance cursor to 991204, re-open the long-poll." },
      ],
    },
    {
      id: 'dedup', name: 'Upload a file the server already has',
      steps: [
        { at: 'client', text: "User drops a 1.2 GB installer into the folder. Client chunks and hashes it: 300 blocks." },
        { from: 'client', to: 'gw', text: "Commit the 300-hash blocklist." },
        { from: 'gw', to: 'meta', text: "Routed to the Metadata Service." },
        { from: 'meta', to: 'blockidx', text: "All 300 hashes already exist (someone else stored this file, or this user had it in another folder)." },
        { at: 'meta', text: "Dedup scope check: blocks are only reusable if they are in a scope this user may claim (see deep dive), otherwise ask for upload anyway." },
        { from: 'meta', to: 'metadb', text: "Append the journal row — the commit succeeds with **zero bytes uploaded**. The user sees an instant 1.2 GB upload." },
        { from: 'meta', to: 'q', text: "Change event published; the user's other devices sync it the usual way." },
      ],
    },
    {
      id: 'conflict', name: 'Concurrent offline edits (conflict path)',
      steps: [
        { at: 'client', text: "Desktop edited `budget.xlsx` offline, based on rev 7. Meanwhile the laptop already committed rev 8." },
        { from: 'client', to: 'gw', text: "Desktop reconnects and sends `commit(parentRev=7, blocks=[...])`." },
        { from: 'gw', to: 'meta', text: "Routed to the Metadata Service." },
        { from: 'meta', to: 'metadb', text: "Compare-and-set inside the transaction: latest rev for this path is 8, not 7 → **reject**." },
        { from: 'meta', to: 'client', text: "Return `409 conflict, latestRev 8`." },
        { at: 'client', text: "Client never overwrites either version. It downloads rev 8 into place and renames its own copy to `budget (Desktop's conflicted copy 2026-10-17).xlsx`." },
        { from: 'client', to: 'gw', text: "Commits the conflicted copy as a brand-new file (parentRev = none). Both edits are now preserved and synced everywhere." },
      ],
    },
    {
      id: 'gc', name: 'Background block garbage collection',
      steps: [
        { at: 'gc', text: "Nightly: history retention for some revisions has expired, so their blocks may be orphaned." },
        { from: 'gc', to: 'metadb', text: "Mark phase: scan live revisions (latest + those within retention) and build the set of referenced hashes." },
        { at: 'gc', text: "Candidates = all hashes in the index minus referenced ones, **minus blocks created in the last N days** (an upload may be between block PUT and commit)." },
        { at: 'gc', text: "Candidates are tombstoned first, then re-checked after a grace period in case a new commit referenced them." },
        { from: 'gc', to: 'blob', text: "Sweep: delete bytes and the index row. Deletion is the riskiest operation in the whole system, so it is slow and double-checked by design." },
      ],
    },
  ],
  deepDives: [
    {
      title: '✂️ Chunking: fixed-size blocks vs content-defined chunking',
      md:
        "Splitting files into blocks is what makes dedup, delta sync and resumable uploads possible. The question is *where to cut*.\n\n" +
        "With **fixed-size** blocks (every 4 MB), inserting one byte at the start of a file shifts every boundary, so every block hash changes and the whole file is re-uploaded. " +
        "**Content-defined chunking (CDC)** slides a rolling hash (Rabin fingerprint, Gear/FastCDC) over the bytes and cuts wherever `hash(last 48 bytes) mod 2^22 == 0`. Boundaries depend on *content*, so after an insert they re-synchronise within one chunk and every later chunk keeps its hash.\n\n" +
        "Inside a changed block you can go further with **rsync-style delta encoding** (librsync): send only the byte ranges that differ against the old block the server already has.",
      options: [
        { name: 'Whole-file upload', desc: 'Re-send the file on every change.', pros: ['Trivial', 'No per-block metadata'], cons: ['Editing 1 KB of a 4 GB file uploads 4 GB', 'No resume, poor dedup'] },
        { name: 'Fixed 4 MB blocks', desc: 'What Dropbox actually uses, plus rsync deltas inside blocks.', pros: ['Simple, predictable block count and index size', 'In-place edits (databases, VM images, Office files) only touch the affected blocks', 'Parallel upload of blocks'], cons: ['An insert near the start shifts all boundaries → poor dedup for prepended/inserted content'] },
        { name: 'Content-defined chunking', desc: 'Rolling hash picks boundaries; min/avg/max ≈ 1/4/16 MB.', pros: ['Inserts and deletes affect only nearby chunks', 'Better cross-file dedup (backup tools like restic and Borg rely on it)'], cons: ['CPU cost on the client (FastCDC is ~1 GB/s per core, so acceptable)', 'Variable chunk sizes complicate storage packing'], chosen: true },
      ],
      verdict: "Use content-defined chunking with ~4 MB average chunks (min/max bounds) and an rsync-style delta for small edits inside a chunk. If you mention Dropbox specifically, note they ship fixed 4 MB blocks + delta sync and get most of the benefit because typical edits are in-place.",
      diagram: {
        nodes: [
          { id: 'fs', label: 'File Watcher', sub: 'inotify / FSEvents', type: 'client', col: 0, row: 1, desc: 'Detects changed paths. Debounces bursts (editors write temp files, then rename).' },
          { id: 'roll', label: 'Rolling Hash', sub: 'find cut points', type: 'worker', col: 1, row: 1, desc: 'Slides a 48-byte window over the file; a boundary is declared where the hash matches a bit pattern. Enforces min/max chunk sizes.' },
          { id: 'sha', label: 'SHA-256 per chunk', sub: 'content address', type: 'worker', col: 2, row: 1, desc: 'Each chunk is named by its hash. Same bytes anywhere → same name.' },
          { id: 'local', label: 'Local Index', sub: 'SQLite', type: 'db', col: 3, row: 0, desc: 'Previous blocklist for this file. Diffing old vs new hash list gives the changed chunks.' },
          { id: 'delta', label: 'Delta Encoder', sub: 'rsync-style', type: 'worker', col: 3, row: 2, desc: 'For a changed chunk, optionally compute a binary diff against the old chunk to send even fewer bytes.' },
          { id: 'up', label: 'Uploader', sub: 'parallel, resumable', type: 'service', col: 4, row: 1, desc: 'Uploads only missing chunks (after the server says which), compressed, several in parallel.' },
        ],
        edges: [
          { from: 'fs', to: 'roll', label: 'changed file' },
          { from: 'roll', to: 'sha', label: 'chunks' },
          { from: 'sha', to: 'local', label: 'compare' },
          { from: 'sha', to: 'delta', label: 'changed chunk' },
          { from: 'local', to: 'up', label: 'new hashes' },
          { from: 'delta', to: 'up', label: 'diff bytes' },
        ],
        flows: [
          { id: 'cdc', name: 'Insert 10 bytes at the start of a file', steps: [
            { at: 'fs', text: 'User inserts a line at the top of a 40 MB log file.' },
            { from: 'fs', to: 'roll', text: 'The rolling hash re-scans the file.' },
            { at: 'roll', text: 'The first boundary moves by 10 bytes; from the second boundary on, the cut points are identical to before because they depend only on local content.' },
            { from: 'roll', to: 'sha', text: 'Ten chunks are hashed: only chunk #1 has a new hash.' },
            { from: 'sha', to: 'local', text: 'Diff against the stored blocklist → 1 changed chunk, 9 unchanged.' },
            { from: 'local', to: 'up', text: 'Upload ~4 MB instead of 40 MB. With fixed blocks, all 10 would have changed.' },
          ] },
        ],
      },
    },
    {
      title: '🧬 Dedup scope & the block store',
      md:
        "Content addressing makes dedup almost free: if the hash exists, skip the upload. But **global** dedup has a security hole: if a client can claim “I have block `a71e`” just by knowing its hash, anyone with a hash list can obtain files they never had (the 2011 *Dropship* hack did exactly this), and an attacker can probe whether *anyone* stores a specific file by watching upload timing.\n\n" +
        "The block store itself is append-mostly, immutable and enormous. Dropbox's Magic Pocket packs blocks into ~1 GB extents, erasure-codes them across zones, and keeps a hot replica of fresh data before it is encoded. See #/company/dropbox-magic-pocket.",
      options: [
        { name: 'Global dedup, trust the hash', pros: ['Maximum storage savings', 'Instant uploads for popular files'], cons: ['Hash-as-capability leak (Dropship)', 'Side channel: reveals that someone stores a file'] },
        { name: 'Per-user / per-namespace dedup', pros: ['No cross-user leakage', 'Still catches the common case (same file in two folders, re-uploads, version history)'], cons: ['Loses cross-user savings for popular content'] },
        { name: 'Global storage dedup, per-user upload proof', desc: 'Server stores one copy, but a client must upload (or prove possession of) bytes the first time it references a block outside its scope.', pros: ['Storage savings of global dedup', 'No hash-as-capability leak'], cons: ['No bandwidth savings for cross-user duplicates', 'More bookkeeping'], chosen: true },
      ],
      verdict: "Dedup storage globally, but dedup *bandwidth* only within blocks the user's namespaces already reference. Never let knowledge of a hash grant access to its bytes. For end-to-end-encrypted tiers, cross-user dedup is impossible by design — accept the storage cost.",
    },
    {
      title: '📒 Metadata: a per-namespace journal with cursors',
      md:
        "Sync needs two things from metadata: **listing** (what is in this folder now?) and **change feed** (what changed since I last looked?). A single append-only journal per namespace gives both.\n\n" +
        "- Every commit appends a row with a monotonically increasing `journal_id` *within the namespace*.\n" +
        "- A device's sync state is just one number per namespace: its cursor. Catching up = `SELECT ... WHERE ns=? AND journal_id > cursor ORDER BY journal_id`.\n" +
        "- Commits for one namespace run on one shard in one transaction, so ordering is total and compare-and-set on `parentRev` is easy.\n\n" +
        "**Shared folders** are separate namespaces mounted into members' trees. One edit is written once; 500 members read the same journal tail (hence the cache). Moving a folder *across* namespaces is the hard case — it becomes a multi-shard operation that Dropbox handles with a carefully ordered two-phase protocol.",
      options: [
        { name: 'Shard by user_id', pros: ['Simple for personal files'], cons: ['Shared folders live in one user\'s shard but are written by many → hot spots and cross-shard reads', 'Leaving a team means moving data'] },
        { name: 'Shard by file_id / path hash', pros: ['Even spread'], cons: ['A folder listing or change feed scatters across all shards', 'No cheap total order for a cursor'] },
        { name: 'Shard by namespace_id', pros: ['Journal order and transactions are local to one shard', 'Shared folders are first-class', 'Cursor = single integer'], cons: ['Very large team namespaces can become hot → split or isolate on dedicated shards', 'Cross-namespace moves need a distributed protocol'], chosen: true },
      ],
      verdict: "Shard metadata by namespace and model everything as a journal with cursors. It turns sync into “replay the log after N”, which is simple to reason about and to recover from (a device that loses its state just re-lists from cursor 0).",
    },
    {
      title: '🔔 Telling devices something changed: polling vs long-poll vs WebSockets',
      md: "Hundreds of millions of devices are online but idle almost all the time. The notification channel must be cheap per idle connection and robust behind corporate proxies.",
      options: [
        { name: 'Short polling every 30 s', pros: ['Stateless, trivial'], cons: ['100M devices / 30 s = 3.3M req/s of mostly empty answers', 'Up to 30 s latency'] },
        { name: 'Long-poll (hold up to ~60 s)', pros: ['Plain HTTP — works through every proxy and firewall', 'Server just completes a parked request; one epoll-based box holds ~1M', 'Response is a tiny signal; data comes over the normal `/list` API, so there is one code path for correctness'], cons: ['Reconnect churn every timeout', 'One-way only'], chosen: true },
        { name: 'WebSockets / HTTP/2 push', pros: ['True push, lower overhead per message', 'Bidirectional'], cons: ['Stateful connections complicate load-balancer draining and deploys', 'Some networks still break them'] },
      ],
      verdict: "Long-poll carrying only a “namespace X changed” signal (this is what Dropbox's public API exposes). Notifications are a *hint*: if one is lost, nothing is corrupted — the device just syncs on the next timeout. Correctness lives entirely in the cursor-based `/list`.",
    },
    {
      title: '⚔️ Conflicts: what happens when two devices edit the same file?',
      md:
        "Files are opaque bytes, so the server cannot merge a `.psd` or `.xlsx`. The rule is: **never silently lose a user's work**.\n\n" +
        "The client tracks three trees per file: *local* (what is on disk), *synced* (last version both agreed on) and *remote* (latest from server). If local ≠ synced and remote ≠ synced, both sides changed → conflict. The server enforces it with compare-and-set on `parentRev` at commit.\n\n" +
        "Edge cases worth naming: delete vs edit (resurrect the edited file), rename vs edit (apply both), case-only renames on case-insensitive filesystems, and clock skew (never decide by mtime).",
      options: [
        { name: 'Last writer wins', pros: ['Simple, no user-visible artefacts'], cons: ['Silently destroys one person\'s edits — unacceptable for a storage product', 'Usually decided by client clocks, which lie'] },
        { name: 'Conflicted copy', desc: 'Keep server version in place; save the losing edit as a sibling file.', pros: ['Zero data loss', 'Works for any file type', 'Easy for users to understand'], cons: ['Users must merge manually', 'Clutter in busy shared folders'], chosen: true },
        { name: 'Automatic merge (OT/CRDT)', pros: ['Seamless for structured docs'], cons: ['Only possible for formats the server understands — belongs in a collaborative editor, not a file sync engine'] },
      ],
      verdict: "Optimistic concurrency (parentRev CAS) + conflicted copies. Version history is the second safety net: even a wrong resolution can be undone.",
    },
  ],
  scaling: [
    { stage: '🌱 Prototype', md: "One server, files stored whole on S3, metadata in one Postgres table, clients poll every 30 s. Works for thousands of users." },
    { stage: '🌿 Millions of users', md: "Split files into 4 MB blocks with hash names (dedup + resume). Separate Block Service from Metadata Service. Move to long-poll notifications. Add a cache in front of metadata." },
    { stage: '🌳 Hundreds of millions', md: "Shard metadata by namespace (thousands of MySQL shards behind a routing layer). Dedicated notification fleet holding ~1M connections per box. Kafka change stream feeding previews, search and audit. Client-side three-tree sync engine for correctness (Dropbox rewrote theirs in Rust as *Nucleus*)." },
    { stage: '🌍 Exabytes', md: "Storage cost dominates the business: move blocks from S3 to an in-house erasure-coded store (Magic Pocket), SMR drives, cold tiers for old versions. Multi-region metadata with namespaces pinned to a home region; edge caches for popular immutable blocks." },
  ],
  tradeoffs: [
    { decision: 'File representation', chosen: 'Ordered list of content-addressed blocks', alternative: 'Whole files', why: "Enables dedup, delta sync, parallel and resumable transfer, and free integrity checking (name = checksum)." },
    { decision: 'Chunk boundaries', chosen: 'Content-defined (~4 MB avg)', alternative: 'Fixed 4 MB', why: "Inserts only change nearby chunks. Fixed blocks are simpler and fine for in-place edits — a reasonable alternative." },
    { decision: 'Metadata store', chosen: 'Sharded SQL journal by namespace', alternative: 'Eventually consistent NoSQL', why: "Sync correctness needs a total order and compare-and-set per namespace; the write rate is modest enough for SQL." },
    { decision: 'Notification channel', chosen: 'Long-poll signal + pull via cursor', alternative: 'WebSocket push of full changes', why: "Works everywhere, cheap per idle connection, and lost notifications cannot cause incorrect state." },
    { decision: 'Conflict resolution', chosen: 'Conflicted copy', alternative: 'Last writer wins', why: "A storage product must never silently discard bytes a user saved." },
    { decision: 'Upload protocol', chosen: 'Commit first, then upload only missing blocks', alternative: 'Upload all blocks then commit', why: "Asks the server what it lacks before sending anything — saves bandwidth for dedup hits and resumed uploads." },
  ],
  failures: [
    { node: 'notify', scenario: 'A notification node crashes, dropping ~1M parked long-polls', impact: "Those devices miss change signals until they reconnect — sync is delayed, not wrong.", mitigation: "Clients reconnect with jittered backoff to another node; on reconnect they compare cursors so missed changes are picked up immediately. Spread reconnects to avoid a thundering herd on the remaining nodes." },
    { node: 'metadb', scenario: 'A metadata shard primary fails', impact: "Commits for the namespaces on that shard fail; their listings may be served stale from cache.", mitigation: "Semi-synchronous replication to a replica in another zone, automated promotion in seconds. Clients queue commits locally and retry — offline-first clients make brief metadata outages invisible." },
    { node: 'blob', scenario: 'Disk / server / whole zone in the block store lost', impact: "Blocks on those disks are temporarily unreadable.", mitigation: "Erasure coding across zones reconstructs data from surviving fragments; continuous background verification (scrubbing) detects silent corruption before a second failure." },
    { node: 'gc', scenario: 'GC bug marks live blocks as garbage', impact: "Catastrophic, irreversible data loss across many users.", mitigation: "Grace periods, tombstone-then-delete, independent verification of the reference set, rate-limited deletes, and an undelete window in the storage layer. Treat delete as the most dangerous code in the system." },
    { node: 'client', scenario: 'Client bug or interrupted sync leaves a half-written file', impact: "Corrupted local file could be uploaded as a new revision and propagate everywhere.", mitigation: "Write downloads to a temp file and atomically rename; verify block hashes; version history lets users roll back; staged client rollouts with corruption telemetry." },
    { node: 'q', scenario: 'Change stream lag spikes', impact: "Notifications and previews are delayed; commits themselves still succeed.", mitigation: "Commits do not wait on the stream; devices fall back to periodic long-poll timeouts and cursor diffs. Alert on consumer lag." },
    { node: 'cache', scenario: 'Huge shared folder change → 50k devices fetch the same journal tail', impact: "Hot shard overload.", mitigation: "Cache journal tails with request coalescing; stagger notifications for very large namespaces." },
  ],
  interviewTips: [
    "Open with the two-plane split: immutable content-addressed blocks vs a small strongly consistent metadata journal. Everything else follows from it.",
    "Explain why the client asks “which blocks do you need?” before uploading — it shows you understand dedup and resumability.",
    "Treat notifications as hints and the cursor as truth. Interviewers like hearing that a lost notification cannot corrupt state.",
    "Have a crisp answer for conflicts (CAS on parent revision + conflicted copy) and mention clock skew as the reason not to use mtimes.",
    "Bring up the dedup security issue (hash-as-capability) — it is a strong senior-level signal.",
  ],
  realWorld: [
    "Dropbox moved ~500 PB off S3 into Magic Pocket around 2016, citing cost and control — storage was the dominant line item.",
    "Dropbox rewrote its desktop sync engine (Nucleus, in Rust) around the three-tree model to make sync behaviour testable and deterministic.",
    "Google Drive and OneDrive use similar ideas; OneDrive added differential sync for Office files to avoid whole-file uploads.",
  ],
  concepts: ['checksums', 'long-polling-vs-websockets', 'database-sharding', 'idempotency', 'strong-vs-eventual-consistency', 'pub-sub', 'message-queues', 'cdn', 'data-replication'],
  quiz: [
    { q: "A user prepends a header line to a 100 MB text file. With fixed 4 MB blocks, roughly how much is re-uploaded, and why does CDC do better?", options: ['4 MB for both', '~100 MB with fixed blocks because every boundary shifts; CDC re-synchronises after one chunk', '0 bytes for both thanks to dedup', 'CDC uploads more because chunks are variable'], answer: 1, explain: "Fixed boundaries are positions, so a shift changes every block's bytes and hash. CDC boundaries depend on local content, so only the chunk containing the insert changes." },
    { q: "Why does the client send the commit (hash list) BEFORE uploading any blocks?", options: ['To reserve storage quota', 'So the server can reply with only the blocks it lacks — enabling dedup and resume', 'Because HTTP requires it', 'To acquire a lock on the file'], answer: 1, explain: "The server checks the block index and asks only for missing hashes. Already-stored blocks (dedup) or blocks uploaded before an interruption (resume) are skipped." },
    { q: "A notification server crashes and 1M devices miss a change signal. What is the consequence?", options: ['Those devices permanently diverge', 'Data loss for files changed during the outage', 'Sync is delayed; on reconnect, the cursor-based list returns everything they missed', 'Users must re-install the client'], answer: 2, explain: "Notifications are only hints. State is reconciled by replaying the journal after the device's cursor, so missing a hint only costs latency." },
    { q: "Why is metadata sharded by namespace_id rather than by user_id?", options: ['Namespaces are smaller integers', 'Shared folders are written by many users; keeping each namespace on one shard gives one ordered, transactional journal everyone syncs from', 'User ids are not unique', 'It makes block dedup possible'], answer: 1, explain: "Sharding by user would scatter a shared folder's writes or make it a cross-shard hotspot. Namespace sharding keeps ordering and CAS local." },
    { q: "Two devices edited the same spreadsheet offline. Which resolution best fits a file sync product?", options: ['Keep the version with the later mtime', 'Merge cells automatically', 'Keep the first committed version and save the other as a “conflicted copy”', 'Reject both edits'], answer: 2, explain: "The server cannot merge opaque formats, and mtimes come from unreliable clocks. Preserving both versions guarantees no data loss." },
    { q: "What is the risk of letting any client reference any existing block hash without uploading it?", options: ['Hash collisions corrupt files', 'Knowing a hash becomes a way to obtain someone else\'s file, and reveals whether a file exists in the system', 'It wastes bandwidth', 'Garbage collection stops working'], answer: 1, explain: "This is the hash-as-capability problem exploited by Dropship. Scope bandwidth dedup to blocks the user already references, or require proof of possession." },
  ],
  references: [
    { title: 'Dropbox Tech Blog — Rewriting the heart of our sync engine', url: 'https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine' },
    { title: 'Dropbox Tech Blog — Inside the Magic Pocket', url: 'https://dropbox.tech/infrastructure/inside-the-magic-pocket' },
    { title: 'FastCDC paper (USENIX ATC 2016)', url: 'https://www.usenix.org/conference/atc16/technical-sessions/presentation/xia' },
  ],
});
