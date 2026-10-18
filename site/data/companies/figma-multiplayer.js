SD.company({
  id: 'figma-multiplayer',
  title: 'Figma: Multiplayer Editing Without OT',
  company: 'Figma',
  icon: '🎨',
  tagline: 'One authoritative process per document, last-writer-wins per property, and CRDT ideas without CRDT overhead.',
  summary:
    'Figma lets many people edit the same design file at once in the browser. Instead of the operational transformation (OT) used by Google Docs, Figma built something much simpler: ' +
    'a document is a **tree of objects, each a map of properties**, and a **central server process per document** decides the order of changes. ' +
    'Conflicts only exist when two people set the *same property on the same object*, and then the **last value the server received wins**. ' +
    'Ideas are borrowed from CRDTs (LWW registers, LWW sets, fractional indexing) but, because the server is the authority, none of the decentralised CRDT overhead is needed. ' +
    'Later posts describe how that per-document process moved to **Rust** and how a **DynamoDB journal** cut the data-loss window from ~60 s to under 1 s.',
  analogy:
    'A shared whiteboard with a single referee. Everyone may draw at once on their own copy, and each sticky note has labelled fields (color, x, y, text). People shout changes to the referee, who simply records whatever arrives last for each field and repeats it to the room. ' +
    'Arguments are only possible if two people change the very same field of the very same note, and then the referee\'s order settles it.',
  numbers: [
    { value: '1', label: 'server process per open document' },
    { value: '33 ms', label: 'client update interval (~30 fps)' },
    { value: '2.2B+', label: 'changes received per day (2022)' },
    { value: '60 s → <1 s', label: 'worst-case data loss after journal' },
    { value: '10x', label: 'faster serialization after Rust' },
  ],
  problem:
    'Figma\'s bet was that a web design tool should be collaborative by default: share a link and copywriters, developers and other designers can watch or edit live, with no exporting or emailing files around.\n\n' +
    'That needs a sync system that is:\n' +
    '- **Instant locally**: a drag must move on your screen at 60 fps, without waiting for the network.\n' +
    '- **Convergent**: every participant must end up with the same document.\n' +
    '- **Robust to offline edits** and flaky connections.\n' +
    '- **Simple enough for a startup** to build, debug and keep extending as new features add new properties.\n\n' +
    'The standard answer at the time, OT, is built around text offsets and is notoriously hard to get right: the number of interleavings of concurrent operations explodes, and correctness proofs are subtle. Figma is not primarily a text editor, so it asked: what is the *simplest* model that works for a tree of design objects?',
  architecture: {
    intro:
      'Browsers keep a WebSocket to the multiplayer service. Each open file is owned by exactly one process, which holds the document in memory, orders all changes, and persists via periodic checkpoints (S3) plus a write-ahead journal (DynamoDB). Non-document data (comments, teams, users) lives in Postgres behind the regular web API. Routing from a file to its process is not detailed in the posts and is shown as context.',
    nodes: [
      { id: 'clientA', label: 'Designer A', sub: 'browser, full doc copy', type: 'client', col: 0, row: 1, desc: 'Downloads a full copy of the document on open, applies its own edits immediately, sends them over the WebSocket, and tracks which of its property changes are still unacknowledged.', tech: ['TypeScript', 'C++ to WebAssembly'] },
      { id: 'clientB', label: 'Designer B', sub: 'browser, full doc copy', type: 'client', col: 0, row: 3, desc: 'A second collaborator on the same file. Receives A\'s changes as a stream of (object, property, value) updates from the server.' },
      { id: 'webapp', label: 'Web API', sub: 'files, comments, teams', type: 'service', col: 1, row: 0, multi: true, desc: 'Regular HTTP backend for everything that is *not* the live document: comments, users, teams, projects, permissions. Has different trade-offs (security, offline) so it uses a separate sync system.', tech: ['Ruby', 'Postgres'] },
      { id: 'pg', label: 'Postgres', sub: 'metadata', type: 'db', col: 2, row: 0, desc: 'Relational store for users, teams, projects, comments and file metadata. Not used for the live document tree.', tech: ['PostgreSQL'] },
      { id: 'router', label: 'Edge / Router', sub: 'file key → host', type: 'lb', col: 1, row: 2, desc: 'Terminates TLS and sends every WebSocket for a given file to the one host that owns it, so all editors of a file meet in the same process. (Context: the posts do not describe the routing mechanism.)', tech: ['NGINX / Envoy'] },
      { id: 'mp', label: 'Multiplayer Server', sub: 'Node.js networking', type: 'gateway', col: 2, row: 2, multi: true, desc: 'Node.js front of the multiplayer service. Handles WebSockets and HTTP, authenticates the user for the file, and relays every message to the right per-document process over stdin/stdout.', tech: ['Node.js', 'TypeScript', 'WebSocket'] },
      { id: 'doc', label: 'Document Process', sub: 'one per file (Rust)', type: 'service', col: 3, row: 2, multi: true, desc: 'The authority for one file. Holds the object tree in memory, applies incoming property changes in arrival order (that order *is* the truth), rejects invalid ones such as parent cycles, acks the sender and rebroadcasts to everyone else. Rust\'s small footprint made one process per document affordable.', tech: ['Rust'] },
      { id: 's3', label: 'Checkpoints', sub: 'S3, every 30-60 s', type: 'storage', col: 4, row: 1, desc: 'Every 30-60 seconds the whole file is binary-encoded, compressed and uploaded. A checkpoint records the sequence number it reflects. Also the source for loading a file and for rendering APIs.', tech: ['Amazon S3'] },
      { id: 'lock', label: 'Ownership Lock', sub: 'DynamoDB table', type: 'db', col: 4, row: 2, desc: 'A (file key, lock UUID) row says which multiplayer process owns a file. Journal writes are conditional on holding the lock, so two processes can never both write one file\'s history.', tech: ['DynamoDB'] },
      { id: 'journal', label: 'Journal (WAL)', sub: 'DynamoDB, ~0.5 s', type: 'db', col: 4, row: 3, desc: 'Write-ahead log of incremental changes, each batch tagged with start/end sequence numbers and flushed about every 0.5 s. Checkpoint + later journal entries = latest state. Chosen over Postgres because the write rate needed horizontal scale.', tech: ['DynamoDB'] },
      { id: 'ckjob', label: 'Checkpoint Job', sub: 'delayed, jittered', type: 'worker', col: 5, row: 2, desc: 'If a file closes with changes only in the journal, a delayed and jittered job folds them into a fresh checkpoint within ~30 minutes. Jitter avoids the thundering herd of checkpoints that redeploys used to cause.', tech: ['Job queue'] },
      { id: 's3x', label: 'Replica Region', sub: 'S3 cross-region copy', type: 'storage', col: 5, row: 0, desc: 'Checkpoints are replicated cross-region. The journal is not (DynamoDB global tables were ~6x too expensive), so the 30-minute checkpoint guarantee bounds cross-region recovery point.', tech: ['S3 replication'] },
    ],
    edges: [
      { from: 'clientA', to: 'webapp', label: 'HTTPS' },
      { from: 'webapp', to: 'pg' },
      { from: 'clientA', to: 'router', label: 'WebSocket', both: true },
      { from: 'clientB', to: 'router', label: 'WebSocket', both: true },
      { from: 'router', to: 'mp', both: true },
      { from: 'mp', to: 'doc', label: 'stdin/stdout', both: true },
      { from: 'mp', to: 'webapp', label: 'auth check', curve: 0.2 },
      { from: 'doc', to: 's3', label: 'checkpoint' },
      { from: 'doc', to: 'lock', label: 'own file' },
      { from: 'doc', to: 'journal', label: 'append', async: true },
      { from: 'ckjob', to: 'journal', label: 'read tail', async: true },
      { from: 'ckjob', to: 's3', label: 'write ckpt', async: true },
      { from: 's3', to: 's3x', label: 'replicate', async: true },
    ],
  },
  flows: [
    {
      id: 'open', name: 'Open a file',
      steps: [
        { from: 'clientA', to: 'router', text: 'Designer A opens a file; the browser opens a WebSocket that is routed by file key.' },
        { from: 'router', to: 'mp', text: 'The connection lands on the multiplayer host that owns (or will own) this file.' },
        { from: 'mp', to: 'webapp', text: 'Multiplayer checks that A may view/edit this file.' },
        { from: 'mp', to: 'doc', text: 'If no process exists for the file yet, Node spawns a Rust document process and relays the join.' },
        { from: 'doc', to: 'lock', text: 'The process takes the ownership lock for the file key in DynamoDB.' },
        { from: 'doc', to: 's3', text: 'It loads the latest checkpoint (which records its sequence number)...' },
        { from: 'doc', to: 'journal', text: '...then reads journal entries after that sequence number with a strongly consistent read and applies them.' },
        { from: 'doc', to: 'clientA', text: 'The full, current document is sent to the client; from now on only incremental changes flow both ways.' },
      ],
    },
    {
      id: 'edit', name: 'Edit and broadcast (with flicker avoidance)',
      desc: 'A and B both change the fill of the same rectangle.',
      steps: [
        { at: 'clientA', text: 'A sets `rect42.fill = red`. It renders instantly and is marked *unacknowledged*.' },
        { from: 'clientA', to: 'mp', text: 'The change `(rect42, fill, red)` is sent over the WebSocket, batched at ~33 ms.' },
        { from: 'mp', to: 'doc', text: 'Relayed to the document process.' },
        { at: 'doc', text: 'Meanwhile B\'s `fill = blue` arrived first. Server order is the truth: blue applied, then red. Red is now the stored value (last writer wins; no timestamps needed).' },
        { from: 'doc', to: 'clientA', text: 'The server forwards blue to A, then acks A\'s red. A ignores the incoming blue because it conflicts with its own unacked fill; showing blue would flicker red→blue→red.' },
        { from: 'doc', to: 'clientB', text: 'B receives red and applies it. Both clients converge on red.' },
        { from: 'doc', to: 'journal', text: 'Within ~0.5 s the batch is appended to the journal with its sequence range, conditional on the ownership lock.' },
      ],
    },
    {
      id: 'offline', name: 'Reconnect after being offline',
      steps: [
        { at: 'clientB', text: 'B\'s laptop goes offline on a train. B keeps editing; changes queue locally. New objects get ids containing B\'s unique client id, so no server is needed to mint them.' },
        { from: 'clientB', to: 'router', text: 'When back online, B does not try to merge a long history. It opens a fresh connection.' },
        { from: 'router', to: 'mp', text: 'Routed to the file owner.' },
        { from: 'mp', to: 'doc', text: 'The document process sends B a fresh full copy.' },
        { at: 'clientB', text: 'B re-applies its offline edits on top of the fresh copy, as new property changes.' },
        { from: 'clientB', to: 'mp', text: 'Those edits go to the server like any others and get ordered by arrival. Connection logic stays trivial.' },
      ],
    },
    {
      id: 'crash', name: 'Document process crashes',
      steps: [
        { at: 'doc', text: 'The host running the file\'s process dies. Before 2022, up to ~60 s of edits since the last checkpoint could be lost.' },
        { from: 'clientA', to: 'router', text: 'Clients reconnect; the file is assigned to a new process.' },
        { from: 'doc', to: 'lock', text: 'The new process writes a new lock UUID; any zombie writer\'s conditional journal writes now fail.' },
        { from: 'doc', to: 's3', text: 'Load the latest checkpoint and its sequence number.' },
        { from: 'doc', to: 'journal', text: 'Replay every journal batch with a higher sequence number. LWW makes re-applying a batch that straddles the checkpoint harmless.' },
        { from: 'doc', to: 'clientA', text: 'State is back to within ~1 s of the crash; clients re-send anything still unacknowledged.' },
      ],
    },
  ],
  evolution: [
    { stage: '🌱 Prototype first', md: 'Before writing production code, the team built a page simulating three clients and a server, with visualised state, offline toggles and bandwidth limits. Testing ideas there showed that a server-ordered, per-property LWW model was enough.' },
    { stage: '🌿 Node.js workers (launch)', md: 'The first multiplayer server was **TypeScript on Node.js**. Each single-threaded worker held many documents. One slow operation, typically serialising a huge file, froze every document on that worker. A per-document Node process was too memory-hungry, so heavy files were manually moved to a separate "heavy" pool.' },
    { stage: '🌳 Rust child process per document (2018)', md: 'Rather than a full rewrite, Figma moved the hot document logic into a **Rust process per document**, spawned by Node and spoken to over stdin/stdout. Node kept networking. Serialization became **10x+ faster**, documents became fully parallel, and one bad file no longer stalls its neighbours.' },
    { stage: '🌍 Journal for durability (2022)', md: 'Checkpoints every 30-60 s meant a crash could lose a minute, and redeploys caused checkpoint storms. Figma added a **DynamoDB write-ahead journal** with per-file sequence numbers and an ownership lock, flushing ~every 0.5 s. 95% of edits are now durable within ~600 ms. It was validated by rebuilding checkpoints from journals and comparing byte-for-byte (~400K consecutive matches) before rollout.' },
  ],
  deepDives: [
    {
      title: '🔀 OT vs CRDT vs server-ordered LWW',
      options: [
        { name: 'Operational Transformation', desc: 'Transform concurrent operations against each other (Google Docs).', pros: ['Excellent for character-level text merging', 'Proven in production'], cons: ['Built around text offsets; awkward for a tree of objects', 'Combinatorial explosion of cases; hard to prove correct', 'Slow to extend for every new feature'] },
        { name: 'Pure CRDTs', desc: 'Replicas converge with no central coordinator.', pros: ['Works peer-to-peer and offline', 'Mathematically guaranteed convergence'], cons: ['Metadata overhead (tombstones, vector clocks) Figma would not need', 'Designed for decentralised systems, but Figma has a server anyway'] },
        { name: 'Server-ordered, LWW per property', desc: 'Doc = Map<ObjectID, Map<Property, Value>>; server arrival order decides.', pros: ['Conflicts only on same object + same property', 'No timestamps or clocks: the server defines order', 'New features = new properties, no new merge logic'], cons: ['Text is atomic per property: concurrent edits give "AB" or "BC", never "ABC"', 'Needs a live central authority per document'], chosen: true },
      ],
      verdict: 'Because a server already exists, Figma could take CRDT ideas (LWW register, LWW set for object existence) and drop the parts that exist only to avoid a coordinator. Simplicity was the main requirement for a small team. See [strong vs eventual consistency](#/concept/strong-vs-eventual-consistency).',
    },
    {
      title: '🌲 Syncing a tree: reparenting and ordering',
      md: '**Reparenting** (dragging a layer into another frame) is the trickiest case. Deleting and recreating the object would drop concurrent edits to it, and two concurrent moves must not duplicate it. Figma stores the **parent link as a property of the child**, so a move is just another LWW property write and identity is preserved.\n\n**Cycles**: A into B and B into A at the same time. The server rejects the update that would create a cycle, but a client may not know yet. Until the server answers, the client temporarily removes the cyclic objects from the tree (they briefly disappear), which is accepted because it is rare and short-lived.\n\n**Child order** uses **fractional indexing**: each child has a position in (0,1); inserting between 0.4 and 0.5 gives 0.45. Moving one object never renumbers siblings. Parent and position are stored together in one property so a move updates both atomically.',
    },
    {
      title: '⚙️ Process model for document servers',
      options: [
        { name: 'Many docs per single-threaded Node worker', pros: ['Low memory per document', 'Simple deployment'], cons: ['One slow serialization blocks every doc on the worker', 'Manual "heavy worker" pool as a stopgap'] },
        { name: 'Node process per document', pros: ['Isolation'], cons: ['JS VM overhead per process made it too memory-hungry'] },
        { name: 'Node for networking + Rust child per document', pros: ['Full parallelism and isolation per file', 'Rust memory use small enough per process', 'Incremental migration instead of a risky rewrite'], cons: ['Two languages and an IPC boundary (stdin/stdout)', 'Async Rust was immature at the time, so the network layer stayed in Node'], chosen: true },
      ],
      verdict: 'Per-document isolation turns a noisy-neighbour problem into a per-file problem. The hybrid let Figma move only the hot path to Rust.',
    },
    {
      title: '💾 Durability: checkpoints vs journal',
      options: [
        { name: 'Checkpoints only (S3, 30-60 s)', pros: ['Simple; one blob per file', 'Cheap storage'], cons: ['Up to ~60 s of edits lost on crash', 'Cost grows with file size, not change size', 'Redeploys force every open file to checkpoint at once'] },
        { name: 'Journal in Postgres', pros: ['Familiar, transactional'], cons: ['Billions of changes/day needed a horizontally scalable store'] },
        { name: 'Checkpoints + DynamoDB journal', desc: 'Append small batches every ~0.5 s with sequence numbers; replay after the checkpoint.', pros: ['<1 s loss window; 95% saved within ~600 ms', 'Deploys just drain pending writes (<1 s p99)', 'Journal can later feed webhooks/activity'], cons: ['Ownership lock needed to stop split-brain writers', 'Journal not cross-region; rely on checkpoints within 30 min'], chosen: true },
      ],
      verdict: 'A classic [write-ahead log + snapshot](#/concept/cqrs-event-sourcing) pattern: snapshots bound replay time, the log bounds data loss. The conditional write against a lock row is a fencing token in disguise (see [distributed locking](#/concept/distributed-locking)).',
    },
  ],
  lessons: [
    'Choose the simplest consistency model your product needs. A design tool does not need character-level merging, so per-property last-writer-wins was enough.',
    'A central authority removes most of the hard parts of CRDTs: no clocks, no tombstones, ordering is just "arrival at the server".',
    'Client-side prediction needs a rule for stale server echoes: drop incoming values that conflict with your own unacknowledged changes to avoid flicker.',
    'Make reconnection boring: fetch a fresh copy and replay local edits rather than reconciling long divergent histories.',
    'Isolate per tenant/document when one heavy item can starve neighbours; Rust made a process per document cheap enough.',
    'Prototype distributed algorithms in a simulator with visualised state before building production code.',
    'Pair snapshots with a write-ahead log, and dark-launch the log by rebuilding snapshots and comparing byte-for-byte before trusting it.',
  ],
  failures: [
    { node: 'doc', scenario: 'Document process or host crashes', impact: 'Everyone editing that file disconnects; before the journal, up to ~60 s of edits could be lost.', mitigation: 'Reload checkpoint + replay journal; clients re-send unacknowledged changes. Loss window < 1 s.' },
    { node: 'lock', scenario: 'Two processes believe they own the same file (split brain after a network partition)', impact: 'Interleaved or conflicting histories in the journal would corrupt the file.', mitigation: 'Journal writes are conditional on the current lock UUID; the stale owner\'s writes are rejected.' },
    { node: 'mp', scenario: 'A huge file\'s serialization blocks a shared worker', impact: 'Every other file on that worker stops syncing (the original Node.js problem).', mitigation: 'One Rust process per document; heavy work in one file no longer affects others.' },
    { node: 's3', scenario: 'Redeploy forces all open files to checkpoint at once', impact: 'Spiky S3 writes and slow shutdowns; worst 5% of files take ~4 s+ to checkpoint.', mitigation: 'Deploys now only wait for the journal to flush; delayed, jittered checkpoint jobs fold journals into checkpoints later.' },
    { node: 'clientB', scenario: 'Client is offline for a long time', impact: 'Its edits diverge from the shared document.', mitigation: 'On reconnect, fetch a fresh copy and replay local edits as new changes; client-unique ids prevent object id collisions.' },
  ],
  quiz: [
    { q: 'In Figma\'s model, when do two concurrent edits actually conflict?', options: ['Whenever they touch the same page', 'Only when they set the same property on the same object', 'Whenever they happen within 33 ms', 'Whenever they come from different browsers'], answer: 1, explain: 'The document is a map of objects to property maps; different properties or different objects merge trivially.' },
    { q: 'Why does Figma not need timestamps for last-writer-wins?', options: ['Browsers have synchronized clocks', 'The server\'s arrival order defines the sequence of events', 'It uses vector clocks', 'Edits never overlap'], answer: 1, explain: 'With one authoritative process per document, "last" simply means last received by that process.' },
    { q: 'A client receives a server update for a property it has changed locally but not yet had acknowledged. What does it do?', options: ['Apply it, then re-apply its own value', 'Discard the incoming value', 'Show a merge dialog', 'Disconnect'], answer: 1, explain: 'Its own pending value will be ordered after the incoming one, so applying the incoming value would just cause flicker.' },
    { q: 'Why is the parent link stored as a property on the child?', options: ['To save memory', 'So moving an object is a single LWW write that keeps its identity and concurrent edits', 'Because Postgres requires it', 'To speed up rendering'], answer: 1, explain: 'Delete-and-recreate would lose concurrent changes and risk duplicates; a property write cannot duplicate an object.' },
    { q: 'What does the DynamoDB ownership lock protect against?', options: ['Slow reads', 'Two processes writing the same file\'s journal after a split brain', 'Clients editing offline', 'S3 replication lag'], answer: 1, explain: 'Journal writes are conditional on the lock UUID, so only the current owner can extend the history.' },
  ],
  concepts: ['websockets', 'strong-vs-eventual-consistency', 'cqrs-event-sourcing', 'distributed-locking', 'unique-id-generation', 'stateful-vs-stateless', 'fault-tolerance'],
  references: [
    { title: 'Figma Blog: How Figma\'s multiplayer technology works (Evan Wallace, 2019)', url: 'https://www.figma.com/blog/how-figmas-multiplayer-technology-works/' },
    { title: 'Figma Blog: Rust in production at Figma (2018)', url: 'https://www.figma.com/blog/rust-in-production-at-figma/' },
    { title: 'Figma Blog: Making multiplayer more reliable (2022)', url: 'https://www.figma.com/blog/making-multiplayer-more-reliable/' },
    { title: 'Figma Blog: Realtime editing of ordered sequences (fractional indexing)', url: 'https://www.figma.com/blog/realtime-editing-of-ordered-sequences/' },
  ],
});
