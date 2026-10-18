SD.design({
  id: 'google-docs',
  title: 'Collaborative Editor (Google Docs)',
  company: 'Google Docs / Notion / Figma',
  difficulty: 'hard',
  order: 4,
  featured: true,
  icon: '📝',
  tagline: 'Let fifty people type into the same paragraph at once, offline or online, and make every screen end up with exactly the same text.',
  summary:
    "A collaborative editor lets many users edit one document simultaneously and see each other's changes and cursors within ~100 ms. Every keystroke is applied **locally first** (zero-latency typing), then sent to the server as an **operation**. " +
    "The central problem is **convergence**: two people editing the same spot at the same moment send operations based on the same old version; naively applying both in different orders produces different documents on different screens. " +
    "The two families of solutions are **Operational Transformation (OT)** — a central server orders operations and *transforms* concurrent ones against each other — and **CRDTs**, where the data structure itself guarantees that any order of application converges. " +
    "Around that core you need **document sessions** (one authority per document), an **operation log + snapshots** for durability and version history, **presence** (cursors, selections), and **offline** editing with reconciliation.",
  analogy:
    "Two people editing the same printed page with pencils, mailing their edits to an editor-in-chief. If Alice writes \"insert X at the start\" and Bob writes \"delete the 3rd letter\", the editor applies Alice's first — and then realises Bob's \"3rd letter\" is now the 4th, so they adjust Bob's instruction before applying it and tell everyone the adjusted version. That adjustment is operational transformation.",
  numbers: [
    { value: '<100 ms', label: 'remote edit visible' },
    { value: '0 ms', label: 'local keystroke latency' },
    { value: '1', label: 'authority per document' },
    { value: '~100', label: 'concurrent editors per doc (practical cap)' },
    { value: '∞', label: 'version history (op log + snapshots)' },
  ],
  requirements: {
    functional: [
      'Create, open and share documents with permissions (owner / editor / commenter / viewer).',
      '**Real-time co-editing**: multiple users edit concurrently; everyone converges to the same content.',
      'See collaborators **presence**: avatars, live cursors and selections.',
      '**Version history**: browse and restore earlier versions; named versions.',
      '**Offline editing**: keep editing without a connection and merge on reconnect.',
      'Comments and suggestions anchored to ranges of text that move as the text changes.',
    ],
    nonFunctional: [
      '**Local edits are instant**; remote edits appear within ~100–300 ms.',
      '**Convergence** is non-negotiable: all replicas must end in an identical state, preserving each user\'s intention as far as possible.',
      '**Durability**: an acknowledged edit is never lost, even if a server dies a millisecond later.',
      '**Availability**: a crashed server should cost at most a reconnect, not data.',
      'Scale to hundreds of millions of documents, most of them idle at any moment.',
    ],
    outOfScope: ['Spreadsheet formula engine', 'Full-text search internals', 'Rendering / pagination engine', 'Drive file storage and quota'],
  },
  estimation: {
    inputs: [
      { id: 'editors', label: 'Concurrent active editors', value: 2e6, min: 1e4, max: 2e7, step: 1e4 },
      { id: 'rate', label: 'Ops per editor per second (batched)', value: 1, min: 0.2, max: 10, step: 0.2 },
      { id: 'perDoc', label: 'Editors per active document', value: 1.5, min: 1, max: 20, step: 0.5 },
      { id: 'opBytes', label: 'Bytes per stored operation', value: 120, min: 40, max: 1000, step: 10, unit: 'B' },
      { id: 'docKB', label: 'In-memory size per open document', value: 60, min: 5, max: 2000, step: 5, unit: 'KB' },
      { id: 'snapEvery', label: 'Snapshot every N ops', value: 500, min: 50, max: 10000, step: 50 },
    ],
    outputs: [
      { label: 'Open documents (live sessions)', f: (v) => v.editors / v.perDoc },
      { label: 'Operations ingested / s', f: (v) => v.editors * v.rate },
      { label: 'Broadcast messages / s', f: (v) => v.editors * v.rate * (v.perDoc - 1), note: 'each op is sent to the other editors of the doc' },
      { label: 'Op-log growth per day', unit: 'bytes', f: (v) => v.editors * v.rate * 86400 * 0.35 * v.opBytes, note: 'assumes the daily average is ~35% of this concurrency' },
      { label: 'Session server memory (all open docs)', unit: 'bytes', f: (v) => (v.editors / v.perDoc) * v.docKB * 1024 },
      { label: 'Session servers (~20K docs each)', f: (v) => Math.ceil(v.editors / v.perDoc / 20000) },
      { label: 'Snapshots written / s', f: (v) => (v.editors * v.rate) / v.snapEvery },
    ],
    notes:
      "Most documents have **one** editor at a time, so the real collaboration fan-out is small; the system is dominated by *many independent small sessions*, which is why it shards so well by document id. " +
      "Clients batch keystrokes (e.g. every 100–200 ms) into one operation, which is why ops/s per editor is ~1, not ~5.",
  },
  api: [
    { method: 'GET', path: '/v1/docs/{id}', desc: 'Open a document', res: '{ "doc_id": "d_42", "title": "Q3 plan", "role": "editor",\n  "session_token": "eyJ…", "ws_url": "wss://collab.example/d_42" }',
      notes: 'ACL checked here; the short-lived signed session token encodes the role so the collaboration server can authorise without a DB call on every op.' },
    { method: 'WS', path: 'wss://collab.example/{docId}', desc: 'Collaboration channel',
      req: '→ { "type": "join", "token": "…", "known_rev": 0 }\n← { "type": "init", "rev": 1250, "snapshot": {...} }\n→ { "type": "op", "client_op_id": "a:77", "base_rev": 1250,\n     "op": [ {"retain": 5}, {"insert": "x"} ] }\n← { "type": "ack", "client_op_id": "a:77", "rev": 1251 }\n← { "type": "remote_op", "rev": 1252, "author": "bob", "op": [...] }\n→ { "type": "presence", "cursor": 17, "selection": [17, 24] }',
      notes: 'Each client has **at most one unacknowledged op in flight** (others are buffered and composed) — this keeps the OT state space simple. `client_op_id` makes resends idempotent.' },
    { method: 'GET', path: '/v1/docs/{id}/revisions?before=…', desc: 'Version history list', notes: 'Coalesced by author and time window ("Alice, 3:42 PM"); named versions are pinned.' },
    { method: 'POST', path: '/v1/docs/{id}/restore', desc: 'Restore an earlier revision', req: '{ "rev": 900 }', notes: 'Implemented as a **new** forward operation that turns the current content into rev 900 content — history is never rewritten.' },
    { method: 'POST', path: '/v1/docs/{id}/permissions', desc: 'Share', req: '{ "email": "bob@x.com", "role": "commenter" }', notes: 'Revocation is pushed to the live session, which closes or downgrades that connection.' },
  ],
  dataModel: [
    { name: 'documents', store: 'Spanner / sharded SQL', fields: [['doc_id', 'PK', ''], ['owner_id', 'bigint', ''], ['title', 'string', ''], ['latest_rev', 'bigint', ''], ['latest_snapshot_rev', 'bigint', ''], ['acl', 'repeated (principal, role)', 'or a separate ACL table']],
      why: 'Small, strongly consistent metadata; ACL changes must take effect quickly and reliably.' },
    { name: 'operations', store: 'Bigtable / Cassandra, key = (doc_id, rev)', fields: [['doc_id', 'partition', ''], ['rev', 'clustering, ascending', 'gap-free sequence per doc'], ['author_id', '', ''], ['client_op_id', 'string', 'dedupe resends'], ['op', 'bytes', 'retain/insert/delete + attributes'], ['ts', 'timestamp', '']],
      why: 'Append-only, ordered per document, range-scanned by rev. The op log **is** the document — snapshots are just a cache of replaying it.' },
    { name: 'snapshots', store: 'Object store / Bigtable', fields: [['doc_id', '', ''], ['rev', '', 'snapshot includes all ops ≤ rev'], ['content', 'blob', 'full document model, compressed'], ['named', 'string?', 'user-named versions']],
      why: 'Opening a doc = latest snapshot + replay of the ops after it, so load time stays bounded however long the history is.' },
    { name: 'session_registry', store: 'etcd / ZooKeeper / Chubby-style lock service', fields: [['doc_id', 'key', ''], ['owner', 'server id', ''], ['lease_epoch', 'int', 'fencing token'], ['expires_at', 'timestamp', '']],
      why: 'Guarantees a single authority per document; the epoch fences a zombie owner out of the op log.' },
    { name: 'presence', store: 'Redis / in memory (TTL)', fields: [['doc_id:user_id', 'key', ''], ['cursor, selection', 'ints', 'in document coordinates at a rev'], ['color, name', '', ''], ['ttl', '', '~30 s']],
      why: 'Ephemeral; losing it is invisible beyond a cursor blinking out for a second.' },
  ],
  architecture: {
    intro:
      "Each open document has exactly **one Collab Session server** acting as the authority that assigns revision numbers and transforms concurrent operations. Clients reach it through a router that looks the owner up in a registry. Durability comes from the **operation log**; snapshots make loading fast; presence is ephemeral.",
    nodes: [
      { id: 'alice', label: 'Editor (Alice)', sub: 'browser', type: 'client', col: 0, row: 1, desc: 'Holds a local copy of the document model and applies her own edits instantly. Keeps one op in flight plus a buffer of pending ops; persists unsent ops in IndexedDB for offline work.' },
      { id: 'bob', label: 'Editor (Bob)', sub: 'browser', type: 'client', col: 0, row: 3, desc: 'Another collaborator on the same document; identical client logic. Transforms incoming remote ops against his own pending ops before applying them.' },
      { id: 'api', label: 'Docs API', type: 'service', col: 2, row: 0, multi: true, desc: 'Stateless REST: open (ACL check + signed session token), list, share, version history and restore.', tech: ['gRPC / REST'] },
      { id: 'router', label: 'Collab Router', sub: 'WS edge', type: 'lb', col: 1, row: 2, multi: true, desc: 'Terminates WebSockets and forwards each document channel to the session server that currently owns that document (looked up in the registry, cached locally).', tech: ['Envoy', 'Custom WS proxy'] },
      { id: 'session', label: 'Collab Session', sub: 'one owner per doc', type: 'service', col: 2, row: 2, multi: true, desc: 'The authority for its documents: keeps the current text in memory, assigns gap-free revision numbers, transforms ops whose base revision is stale, persists them, then acks and broadcasts. ~20K active docs per server.' },
      { id: 'registry', label: 'Session Registry', sub: 'leases', type: 'scheduler', col: 2, row: 3, desc: 'Maps doc id → owning session server via leases with an epoch (fencing token). If a server dies, its leases expire and another server takes over.', tech: ['etcd', 'ZooKeeper', 'Chubby'] },
      { id: 'meta', label: 'Doc Metadata & ACL', type: 'db', col: 3, row: 0, desc: 'Titles, owners, permissions, latest revision pointers. Strongly consistent.', tech: ['Spanner', 'Postgres'] },
      { id: 'snap', label: 'Snapshot Store', type: 'storage', col: 3, row: 1, desc: 'Compressed full-document snapshots at periodic revisions, plus user-named versions.', tech: ['GCS / S3', 'Bigtable'] },
      { id: 'oplog', label: 'Operation Log', sub: '(doc_id, rev)', type: 'db', col: 3, row: 2, desc: 'Durable, append-only log of every accepted operation, ordered per document. An op is acknowledged only after it is written here (replicated).', tech: ['Bigtable', 'Cassandra', 'Spanner'] },
      { id: 'presence', label: 'Presence', sub: 'cursors, TTL', type: 'cache', col: 3, row: 3, desc: 'Who is in the doc, their colour, cursor and selection. Never persisted to the op log.', tech: ['Redis', 'in-memory'] },
      { id: 'compact', label: 'Snapshotter', type: 'worker', col: 4, row: 1, desc: 'Every N ops (or idle period) replays the log from the last snapshot and writes a new one; groups revisions into human-readable history entries.' },
      { id: 'feed', label: 'Change Feed', type: 'queue', col: 4, row: 2, desc: 'CDC stream of committed ops / doc changes for downstream consumers.', tech: ['Pub/Sub', 'Kafka'] },
      { id: 'down', label: 'Search & Notify', sub: 'downstream', type: 'worker', col: 5, row: 2, desc: 'Re-indexes documents for search (debounced), sends @mention and comment notifications, updates "last edited" in Drive.' },
    ],
    edges: [
      { from: 'alice', to: 'api', label: 'open / share' },
      { from: 'alice', to: 'router', label: 'WS ops', both: true },
      { from: 'bob', to: 'router', label: 'WS ops', both: true },
      { from: 'router', to: 'session', both: true },
      { from: 'router', to: 'registry', label: 'owner?' },
      { from: 'session', to: 'registry', label: 'lease' },
      { from: 'session', to: 'oplog', label: 'append rev' },
      { from: 'session', to: 'snap', label: 'load' },
      { from: 'session', to: 'presence', label: 'cursors' },
      { from: 'api', to: 'meta', label: 'ACL' },
      { from: 'api', to: 'snap', label: 'history' },
      { from: 'oplog', to: 'compact', async: true },
      { from: 'compact', to: 'snap', label: 'snapshot' },
      { from: 'oplog', to: 'feed', label: 'CDC', async: true },
      { from: 'feed', to: 'down', async: true },
    ],
  },
  flows: [
    {
      id: 'open', name: 'Open a document',
      steps: [
        { from: 'alice', to: 'api', text: 'Alice opens d_42; `GET /docs/d_42`.' },
        { from: 'api', to: 'meta', text: 'Check ACL: Alice is an editor. Return a signed session token (role = editor, 10-min expiry) and the WebSocket URL.' },
        { from: 'alice', to: 'router', text: 'Alice connects the WebSocket and sends `join` with the token.' },
        { from: 'router', to: 'registry', text: 'Who owns d_42? Nobody (the doc was idle) → pick a server by consistent hashing.' },
        { from: 'session', to: 'registry', text: 'Session server S7 acquires the lease for d_42 with epoch 19.' },
        { from: 'session', to: 'snap', text: 'Load the latest snapshot (rev 1200).' },
        { from: 'session', to: 'oplog', text: 'Replay ops 1201–1250 from the log → current text at rev 1250, held in memory.' },
        { from: 'session', to: 'router', text: 'Send `init {rev: 1250, snapshot}` back through the router.' },
        { from: 'router', to: 'alice', text: 'Alice\'s editor renders the document and starts sending ops based on rev 1250.' },
      ],
    },
    {
      id: 'edit', name: 'Type a character (happy path)',
      steps: [
        { at: 'alice', text: 'Alice types "x" at position 5. Applied to her screen **immediately**; op `[retain 5, insert "x"]` with base_rev 1250 becomes her in-flight op.' },
        { from: 'alice', to: 'router', text: 'Op sent over the WebSocket with `client_op_id a:77`.' },
        { from: 'router', to: 'session', text: 'Forwarded to S7, the owner of d_42.' },
        { at: 'session', text: 'base_rev 1250 == current rev 1250 → no transform needed. Assign rev 1251 and apply to the in-memory doc.' },
        { from: 'session', to: 'oplog', text: 'Append (d_42, 1251) with a conditional write (rev must not exist, epoch must be 19). Replicated before ack.' },
        { from: 'session', to: 'router', text: 'Ack to Alice and broadcast `remote_op rev 1251` to the other participants.' },
        { from: 'router', to: 'bob', text: 'Bob has no pending ops, so he applies it directly. "x" appears on his screen ~80 ms after Alice typed.' },
        { from: 'router', to: 'alice', text: 'Alice receives the ack; her next buffered op is sent with base_rev 1251.' },
      ],
    },
    {
      id: 'concurrent', name: 'Two concurrent edits (server transform)',
      steps: [
        { at: 'alice', text: 'Doc is "abc" at rev 7. Alice inserts "X" at 0 → locally "Xabc". Sends `ins(0,"X")` base 7.' },
        { at: 'bob', text: 'At the same time Bob deletes "c" at index 2 → locally "ab". Sends `del(2)` base 7.' },
        { from: 'alice', to: 'router', text: 'Alice\'s op arrives first.' },
        { from: 'router', to: 'session', text: 'Server: base 7 == rev 7 → accept as rev 8. Doc "Xabc".' },
        { from: 'bob', to: 'router', text: 'Bob\'s op arrives, still based on rev 7.' },
        { at: 'session', text: 'Transform `del(2)` against rev 8 `ins(0,"X")`: the insert was before index 2, so it shifts → `del(3)`. Accept as rev 9 → "Xab".' },
        { from: 'session', to: 'oplog', text: 'Persist rev 8 and rev 9.' },
        { from: 'router', to: 'alice', text: 'Alice receives rev 9 `del(3)` → "Xab".' },
        { from: 'router', to: 'bob', text: 'Bob receives rev 8 `ins(0,"X")`, transforms it against his own in-flight `del(2)` (unaffected) → "Xab", then gets his ack for rev 9. **Both converge to "Xab".**' },
      ],
    },
    {
      id: 'presence', name: 'Cursor and presence updates',
      steps: [
        { at: 'bob', text: 'Bob selects a sentence. Client throttles presence updates to ~10/s.' },
        { from: 'bob', to: 'router', text: 'Send `presence {cursor: 17, selection: [17, 24], rev: 1251}`.' },
        { from: 'router', to: 'session', text: 'Forwarded to the doc owner.' },
        { from: 'session', to: 'presence', text: 'Store in the ephemeral presence map with a 30 s TTL (no op log, no durability).' },
        { from: 'session', to: 'router', text: 'Broadcast to others; cursors are **transformed** by subsequent ops so Bob\'s highlight moves when Alice inserts text before it.' },
        { from: 'router', to: 'alice', text: 'Alice sees Bob\'s coloured selection. If Bob\'s tab closes, the TTL removes his avatar.' },
      ],
    },
    {
      id: 'offline', name: 'Offline editing and reconnect',
      steps: [
        { at: 'alice', text: 'Alice\'s laptop goes offline at rev 1251. She keeps typing; 40 ops accumulate in IndexedDB (composed into a few larger ops).' },
        { from: 'alice', to: 'router', text: 'Wi-Fi returns. Reconnect with `join {known_rev: 1251}` and resend pending ops with their original client_op_ids.' },
        { from: 'router', to: 'session', text: 'Routed to the current owner of d_42.' },
        { from: 'session', to: 'oplog', text: 'Fetch ops 1252–1330 that others made meanwhile.' },
        { at: 'session', text: 'Transform Alice\'s composed op against the 79 concurrent ops; accept as rev 1331. Any op whose client_op_id was already committed is skipped (idempotent resend).' },
        { from: 'session', to: 'router', text: 'Send Alice the 79 missed ops (she transforms them against her own pending op) and the ack.' },
        { from: 'router', to: 'alice', text: 'Alice converges with everyone else. Large semantic conflicts (both rewrote the same paragraph) are merged character-wise; the UI can highlight heavily edited regions.' },
      ],
    },
    {
      id: 'failover', name: 'Session server crash',
      steps: [
        { at: 'session', text: 'S7 crashes. Clients see the WebSocket close; their unacked ops stay in their local buffers.' },
        { at: 'registry', text: 'S7\'s lease on d_42 expires after ~10 s (or is revoked by the health checker).' },
        { from: 'router', to: 'registry', text: 'Clients reconnect; router finds no owner and assigns S12.' },
        { from: 'session', to: 'registry', text: 'S12 acquires the lease with **epoch 20**. If S7 was only partitioned (a zombie), its appends with epoch 19 are rejected by the op log.' },
        { from: 'session', to: 'snap', text: 'S12 loads the latest snapshot.' },
        { from: 'session', to: 'oplog', text: 'Replays the tail of the log — every **acked** op is there, because acks happen only after the durable append.' },
        { from: 'session', to: 'router', text: 'Clients rejoin with known_rev and resend unacked ops; duplicates are detected by client_op_id. No acknowledged edit was lost.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '⚔️ OT vs CRDT: how do concurrent edits converge?',
      md:
        "Start from \"abc\". Alice inserts X at index 0 (her copy: \"Xabc\"); Bob concurrently deletes index 2 (his copy: \"ab\"). If each simply applies the other's op **as is**, Alice runs del(2) on \"Xabc\" and gets \"Xac\" (wrong letter removed), while Bob gets \"Xab\". The replicas have **diverged**. Two families of fixes:",
      options: [
        { name: 'Operational Transformation (OT)', desc: 'Ops are index-based. A central server totally orders them and transforms each incoming op against ops it has not seen (Jupiter / Google Wave lineage).', pros: ['Compact ops and document representation', 'Mature for rich text (Google Docs, Office Online)', 'Server order gives a simple, linear revision history'], cons: ['Transform functions are notoriously hard to get right for every op pair (especially rich text and tree structures)', 'Needs a central authority per document', 'Long offline divergence → O(n·m) transforms on reconnect'], chosen: true },
        { name: 'CRDT (sequence CRDTs: RGA, YATA/Yjs, Automerge)', desc: 'Every character gets a unique id (site, counter); inserts reference neighbouring ids, deletes leave tombstones. Merge is commutative, so any order converges.', pros: ['No central server needed: peer-to-peer and local-first friendly', 'Offline merges are natural', 'Mathematically guaranteed convergence'], cons: ['Per-character metadata and tombstones grow memory (mitigated by run-length encoding in Yjs/Automerge)', 'Interleaving anomalies on concurrent inserts at the same spot', 'Permissions, validation and undo semantics still want a server'] },
        { name: 'Locking / last-writer-wins', desc: 'Lock paragraphs or overwrite whole blocks.', pros: ['Trivial to build'], cons: ['Not real-time collaboration; lost edits or blocked users'] },
      ],
      verdict:
        "With a server in the loop anyway (auth, persistence, history), **server-ordered OT** is a proven, compact choice — it is what Google Docs uses. Choose a **CRDT** (e.g. Yjs) when offline-first or peer-to-peer is a core requirement, or for structured documents where transform functions get unwieldy. Figma uses a server-authoritative approach inspired by CRDTs for its object tree. Both need the same surrounding system: sessions, logs, snapshots, presence.",
      diagram: {
        nodes: [
          { id: 'a0', label: 'Alice: "abc"', sub: 'rev 7', type: 'client', col: 0, row: 0, desc: 'Alice and Bob both start from rev 7 = "abc".' },
          { id: 'b0', label: 'Bob: "abc"', sub: 'rev 7', type: 'client', col: 0, row: 2, desc: 'Same starting state.' },
          { id: 'a1', label: 'ins(0, "X")', sub: 'local: "Xabc"', type: 'service', col: 1, row: 0, desc: 'Alice inserts X at index 0 and sees it instantly.' },
          { id: 'b1', label: 'del(2)', sub: 'local: "ab"', type: 'service', col: 1, row: 2, desc: 'Bob deletes "c" (index 2) and sees it instantly.' },
          { id: 'srv', label: 'Server rev 8', sub: 'ins(0,"X") → "Xabc"', type: 'db', col: 2, row: 1, desc: 'Alice\'s op arrived first; it is accepted unchanged as rev 8.' },
          { id: 'tf', label: 'Transform', sub: 'del(2) ⟶ del(3)', type: 'worker', col: 3, row: 1, desc: 'Bob\'s op was based on rev 7. An insert before index 2 shifts later positions by one, so del(2) becomes del(3). Accepted as rev 9.' },
          { id: 'a2', label: 'Alice: "Xab"', sub: 'applies rev 9 del(3)', type: 'client', col: 4, row: 0, desc: 'Alice receives the transformed delete and removes the right character.' },
          { id: 'b2', label: 'Bob: "Xab"', sub: 'applies rev 8 ins(0)', type: 'client', col: 4, row: 2, desc: 'Bob receives Alice\'s insert, transforms it against his pending delete (no change needed) and applies it.' },
        ],
        edges: [
          { from: 'a0', to: 'a1' }, { from: 'b0', to: 'b1' }, { from: 'a1', to: 'srv', label: 'base 7' }, { from: 'b1', to: 'srv', label: 'base 7' },
          { from: 'srv', to: 'tf' }, { from: 'tf', to: 'a2', label: 'rev 9' }, { from: 'tf', to: 'b2', label: 'rev 8 + ack 9' },
        ],
        flows: [
          { id: 'ot', name: 'OT: concurrent insert + delete', steps: [
            { from: 'a0', to: 'a1', text: 'Alice types X at the start. Her screen: "Xabc".' },
            { from: 'b0', to: 'b1', text: 'Simultaneously Bob deletes "c". His screen: "ab".' },
            { from: 'a1', to: 'srv', text: 'Alice\'s op reaches the server first → rev 8, doc "Xabc".' },
            { from: 'b1', to: 'srv', text: 'Bob\'s del(2) arrives, but it was based on rev 7.' },
            { from: 'srv', to: 'tf', text: 'Transform against rev 8: insert at 0 < 2, so shift → del(3). Rev 9: "Xab".' },
            { from: 'tf', to: 'a2', text: 'Alice applies del(3): "Xabc" → "Xab". (Applying the raw del(2) would have deleted "b"!)' },
            { from: 'tf', to: 'b2', text: 'Bob applies ins(0,"X"): "ab" → "Xab". Converged.' },
          ] },
        ],
      },
    },
    {
      title: '🧭 One authority per document: sessions, routing and fencing',
      md:
        "OT needs a single place that decides the order of operations for a document. Options:",
      options: [
        { name: 'Any server, order via DB transactions', pros: ['Stateless servers'], cons: ['Every op becomes a read-transform-write transaction on the DB with contention on the hot document', 'Broadcast needs a separate pub/sub layer'] },
        { name: 'Sticky owner per document (lease-based)', desc: 'A registry maps doc → server; the owner keeps the doc in memory and is the only writer to its op log.', pros: ['Transforms happen in memory in microseconds', 'Natural place for broadcast and presence', 'Shards perfectly by doc id; idle docs cost nothing'], cons: ['Failover requires lease expiry + reload (a few seconds of reconnect)', 'A zombie owner must be fenced'], chosen: true },
        { name: 'Peer-to-peer (CRDT over WebRTC)', pros: ['No server for live sync'], cons: ['Still need a server for durability, access control and history', 'NAT traversal and many-peer meshes are hard'] },
      ],
      verdict:
        "Use **leases with an epoch number** (a fencing token). The op log accepts an append only if `epoch ≥ last seen epoch` for that doc and the rev slot is empty, so a paused-then-resumed old owner cannot corrupt history. Route with consistent hashing as a hint and the registry as the truth. Cap editors per document (~100) and serve large view-only audiences from a read fan-out tier rather than the owner.",
    },
    {
      title: '🗃️ Op log + snapshots: storage, loading and version history',
      md:
        "The **op log is the source of truth**; the in-memory document and snapshots are derived caches.\n\n" +
        "- **Append path**: an op is acked only after it is durably appended at `(doc_id, rev)` with a conditional write. Gap-free revs make it trivial for a client to say \"send me everything after 1251\".\n" +
        "- **Snapshots**: every ~500 ops (or after a burst of activity ends) a background worker replays from the previous snapshot and stores a new one. Loading any doc is then *one snapshot read + ≤500 op replays*.\n" +
        "- **Version history**: the UI groups ops by author and time window into entries like \"Alice, 3:42 PM\". Viewing a version = nearest snapshot before it + replay. Restore = a **new forward op** (history is append-only, so restores are themselves undoable).\n" +
        "- **Retention**: very old fine-grained ops can be compacted into coarser snapshots to cap storage, keeping named versions forever.\n" +
        "- **Size**: a heavily edited doc can accumulate millions of ops — fine for a wide-column store partitioned by doc id, painful for a single relational table.",
    },
    {
      title: '👀 Presence, cursors and comments that move with text',
      md:
        "Positions are indexes into a document that is constantly changing, so anything that points *into* the text must be transformed like an op.\n\n" +
        "- **Cursors/selections** are sent with the rev they refer to and transformed by later ops on every client, so Bob\'s highlight slides right when Alice types before it.\n" +
        "- They are **ephemeral**: throttled (~10 updates/s), not written to the op log, expired by TTL. Losing them on failover is acceptable.\n" +
        "- **Comments and suggestions** are durable anchors (`start`, `end` positions at a rev, or anchors attached to character ids in a CRDT). The server transforms them with each op; if the anchored text is deleted, the comment becomes \"orphaned\" but kept.\n" +
        "- **Rich text** is modelled as text + attribute runs (`retain 5 {bold: true}`), so formatting is just another op type that composes and transforms (the model popularised by Quill Deltas).",
    },
    {
      title: '✈️ Offline editing and long divergence',
      md:
        "The client protocol already handles short disconnections: unacked ops are buffered and resent. Long offline periods stress it:\n\n" +
        "1. **Persist locally**: pending ops (and the base rev) go to IndexedDB so closing the laptop does not lose work.\n" +
        "2. **Compose** many small offline ops into a few large ones before sending — transforming 3 composed ops against 500 server ops is far cheaper than 2,000 × 500.\n" +
        "3. **Transform on reconnect** (server side) and catch the client up with the missed ops.\n" +
        "4. **Intention vs convergence**: OT/CRDT guarantees identical results, not *meaningful* results. If two people rewrote the same paragraph offline, the merge is character-interleaved but consistent; good UIs flag such regions.\n" +
        "5. **Permission changes while offline**: if the user lost edit access, the server rejects the ops and the client keeps them as a local copy / suggestion.\n\n" +
        "This is where CRDTs shine; products that are *offline-first* (e.g. note apps built on Automerge/Yjs) often pick CRDTs for exactly this reason.",
    },
  ],
  scaling: [
    { stage: '🌱 Prototype', md: 'One Node.js server holds all open docs in memory and implements OT; ops appended to Postgres; snapshots in the same DB. A single process means a single authority for free.' },
    { stage: '🌿 Thousands of concurrent docs', md: 'Multiple session servers with **sticky routing** by doc id (consistent hashing). Move the op log to a wide-column store. Add a snapshot worker and Redis for presence.' },
    { stage: '🌳 Millions of concurrent docs', md: 'Lease-based ownership in a registry with fencing epochs, a WS edge tier separate from session servers, change feed for search/notifications, per-doc editor caps and a read-only fan-out tier for huge audiences.' },
    { stage: '🌍 Global', md: 'Place each document\'s session in the region nearest most of its editors (and migrate the lease when that changes); replicate the op log across regions for durability. Remote collaborators pay one cross-region RTT, but their local typing stays instant.' },
  ],
  tradeoffs: [
    { decision: 'Concurrency control', chosen: 'Server-ordered OT', alternative: 'CRDT', why: 'A server is needed anyway for auth, durability and history; OT keeps documents compact and history linear. CRDT is better for offline-first / P2P.' },
    { decision: 'Authority', chosen: 'One session owner per doc with leases', alternative: 'Stateless servers + DB transactions per op', why: 'In-memory transforms in microseconds and natural broadcast; failover costs only a reconnect.' },
    { decision: 'Ack timing', chosen: 'After durable op-log append', alternative: 'Ack after in-memory apply', why: 'Guarantees an acknowledged edit survives a server crash.' },
    { decision: 'Source of truth', chosen: 'Append-only op log + periodic snapshots', alternative: 'Overwrite the full document on each save', why: 'Gives version history, incremental catch-up and cheap writes; snapshots bound load time.' },
    { decision: 'Client in-flight ops', chosen: 'One unacked op at a time, rest buffered and composed', alternative: 'Stream every op without waiting', why: 'Keeps the client/server transform state to a simple two-branch problem.' },
    { decision: 'Presence', chosen: 'Ephemeral, throttled, TTL', alternative: 'Persist cursor state', why: 'Cursor data is high-frequency and worthless after seconds; persisting it would multiply write volume.' },
  ],
  failures: [
    { node: 'session', scenario: 'Session server crashes with 20K open docs', impact: 'Those docs pause for a few seconds; users see "reconnecting".', mitigation: 'Leases expire and docs are re-homed; new owner loads snapshot + log tail; clients resend unacked ops with client_op_id dedupe. Acked edits are never lost.' },
    { node: 'registry', scenario: 'Network partition: old owner still alive but cut off', impact: 'Two servers believe they own the doc → split-brain history.', mitigation: 'Fencing epoch on every op-log append; the stale owner\'s writes fail, so it stops and disconnects its clients.' },
    { node: 'oplog', scenario: 'Op log write latency spikes', impact: 'Acks slow down; remote edits appear late (local typing still instant).', mitigation: 'Batch appends per doc (group commit), monitor p99, shed presence traffic first, and backpressure clients by delaying acks rather than dropping ops.' },
    { node: 'snap', scenario: 'Snapshotter falls behind for days', impact: 'Docs take longer to open (thousands of ops to replay).', mitigation: 'Session servers write an opportunistic snapshot when they close an idle doc; alert on ops-since-snapshot.' },
    { node: 'router', scenario: 'WS edge node dies', impact: 'Connections drop for its clients.', mitigation: 'Clients reconnect with jitter to another edge; state lives in the session server, so nothing is lost.' },
    { node: 'presence', scenario: 'Presence store lost', impact: 'Cursors and avatars disappear briefly.', mitigation: 'Clients re-announce presence every few seconds; no impact on document content by design.' },
  ],
  interviewTips: [
    'Start with *why* naive broadcasting fails: show two concurrent index-based ops diverging. Then introduce OT or CRDT.',
    'Be explicit that local edits apply immediately and the server is the ordering authority — that is how you get both zero latency and convergence.',
    'Ack only after a durable append, and use client op ids for idempotent resends — interviewers probe crash scenarios.',
    'Mention fencing tokens for the single-owner lease; it shows you understand split brain.',
    'Know the CRDT trade-off well enough to say when you would switch (offline-first, P2P).',
  ],
  concepts: ['websockets', 'consistent-hashing', 'distributed-locking', 'consensus-algorithms', 'cqrs-event-sourcing', 'strong-vs-eventual-consistency', 'idempotency', 'change-data-capture', 'stateful-vs-stateless'],
  realWorld: [
    'Google Docs uses **operational transformation** descending from the Jupiter system and Google Wave; changes are applied locally and reconciled by the server.',
    '**Figma** built a server-authoritative multiplayer system inspired by CRDTs, with per-document processes — see [Figma multiplayer](#/company/figma-multiplayer).',
    'Open-source **Yjs** and **Automerge** CRDTs power many local-first editors; ShareDB and Etherpad implement OT.',
    'Notion and Linear sync via operation logs with server ordering for most data.',
  ],
  quiz: [
    { q: 'Doc is "abc". Alice inserts "X" at 0; Bob concurrently deletes index 2 ("c"). The server applied Alice\'s op first. What must Bob\'s op become?', options: ['del(2)', 'del(3)', 'del(1)', 'It must be rejected'], answer: 1, explain: 'An insert before position 2 shifts every later index by one, so the delete of "c" is now at index 3.' },
    { q: 'Why does a collaborative editor apply the user\'s keystroke locally before the server confirms it?', options: ['To save bandwidth', 'So typing feels instant; the algorithm (OT/CRDT) later reconciles concurrent edits', 'Because the server is optional', 'To avoid storing history'], answer: 1, explain: 'Optimistic local application gives zero-latency typing; transforms or CRDT merges guarantee convergence afterwards.' },
    { q: 'When should the server acknowledge an op to the author?', options: ['As soon as it is received', 'After applying it in memory', 'After it is durably appended to the op log', 'After all collaborators confirm'], answer: 2, explain: 'Acking after the durable append means a crash can never lose an acknowledged edit; collaborators do not need to confirm.' },
    { q: 'A session server was partitioned, a new owner took over, and then the old one reconnects and tries to append rev 1300. What prevents corruption?', options: ['Clients detect it', 'A fencing epoch: the log rejects appends from the old lease epoch', 'The old server always crashes', 'Timestamps'], answer: 1, explain: 'The lease epoch is a fencing token; storage rejects writes carrying an older epoch.' },
    { q: 'Which requirement most strongly favours a CRDT over OT?', options: ['Compact storage', 'Linear version history', 'Offline-first or peer-to-peer editing without a central server', 'Rich-text formatting'], answer: 2, explain: 'CRDT merges are commutative and need no central ordering, which is ideal for long offline sessions and P2P sync.' },
    { q: 'Why are cursor positions not stored in the op log?', options: ['They are secret', 'They are high-frequency, ephemeral and worthless seconds later; persisting them would multiply writes for no benefit', 'The log cannot store integers', 'OT forbids it'], answer: 1, explain: 'Presence is soft state with a TTL; only document content and durable anchors (comments) need persistence.' },
  ],
  references: [
    { title: 'Google Drive blog: What\'s different about the new Google Docs (OT)', url: 'https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs.html' },
    { title: 'Figma: How multiplayer technology works', url: 'https://www.figma.com/blog/how-figmas-multiplayer-technology-works/' },
    { title: 'Design Google Docs (video)', url: 'https://www.youtube.com/results?search_query=design+google+docs+system+design' },
  ],
});
