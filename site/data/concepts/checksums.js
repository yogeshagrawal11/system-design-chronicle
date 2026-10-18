SD.concept({
  id: 'checksums',
  category: 'networking',
  order: 8,
  icon: '✅',
  title: 'Checksums, Hashes & Merkle Trees',
  tagline: 'Small fingerprints that catch silent corruption, identify content, and let replicas find differences cheaply.',
  summary:
    "Data gets corrupted silently: a bit flips in RAM, a NIC or router mangles a packet, a disk returns the wrong sector, firmware writes to the wrong place. Nothing throws an error; you just read back different bytes. A **checksum** is a small fixed-size value computed from the data. Store or send it alongside the data, recompute later, and if they differ you *know* something changed.\n\n" +
    "Different jobs need different functions: **parity and the Internet checksum** (cheap, weak), **CRC-32/CRC-32C** (fast, excellent at accidental burst errors), **xxHash** (fast non-cryptographic hashing), **SHA-256** (cryptographic: infeasible to forge, used as a content ID), and **HMAC / signatures** (prove *who* produced the data). **Merkle trees** hash data hierarchically so two replicas can find exactly which part differs by exchanging a handful of hashes. A checksum only *detects*; recovery comes from retries, replicas or backups.",
  analogy:
    "Shipping a box of 1,000 parts with a packing slip that says '1,000 parts, total weight 12.4 kg'. The receiver weighs the box: if it is 12.1 kg, something is missing or wrong, even if they cannot yet say what. A Merkle tree is putting a slip on every crate, every pallet and the whole truck: compare truck slips first, and only open the pallets whose slips disagree.",
  sections: [
    {
      h: 'From simple sums to CRC',
      md: "- **Parity bit**: 1 bit saying whether the count of 1s is even. Catches any single-bit flip, misses any two.\n- **Additive checksum / Internet checksum** (16-bit ones' complement sum, used in IPv4 headers, TCP and UDP): cheap to compute and update, but misses reordered 16-bit words and many multi-bit errors. With billions of packets a day, some corrupted packets *will* pass TCP's checksum. IPv6 dropped the header checksum entirely, relying on link and transport layers.\n- **CRC (cyclic redundancy check)**: treats data as a polynomial and divides by a fixed generator; the remainder is the checksum. Position-sensitive and guaranteed to catch all burst errors shorter than its width (32 bits for CRC-32). Hardware-accelerated (`crc32` instruction on x86, ARM): many GB/s per core. **CRC-32C** (Castagnoli) is used by iSCSI, ext4 metadata, Btrfs, Kafka record batches, RocksDB, gRPC/S3 integrity, and Google Cloud Storage.\n\nCRCs are **not** security tools: an attacker can easily craft different data with the same CRC.",
    },
    {
      h: 'Cryptographic hashes, HMACs and signatures',
      md: "A cryptographic hash (SHA-256, SHA-3, BLAKE3) makes it computationally infeasible to find two inputs with the same output (collision resistance) or an input matching a given output. That makes the hash a safe **content identifier**: Git commits, Docker image layers, IPFS, content-addressed storage and deduplication all name data by its SHA-256 (or SHA-1 for older Git).\n\n- **MD5 and SHA-1 are broken** for adversarial use (practical collisions: MD5 since 2004, SHA-1 'SHAttered' in 2017). They are still fine as fast checksums against *accidental* corruption, but never for security.\n- A hash alone proves *integrity*, not *origin*: an attacker who can change the file can change the published hash too. Use an **HMAC** (hash with a shared secret key, e.g. webhook signatures, AWS SigV4) or a **digital signature** (private key signs, anyone verifies with the public key, e.g. code signing, TLS certificates).",
      table: {
        headers: ['Function', 'Output', 'Speed', 'Detects accidental errors', 'Resists attackers', 'Typical use'],
        rows: [
          ['Parity', '1 bit', 'Trivial', 'Single-bit only', 'No', 'RAM (ECC is the stronger version), serial links'],
          ['Internet checksum', '16 bits', 'Very fast', 'Weak', 'No', 'IPv4 header, TCP, UDP'],
          ['CRC-32 / CRC-32C', '32 bits', '~10-20 GB/s with HW', 'Excellent for bursts', 'No', 'Ethernet, ZIP/PNG, Kafka, ext4, S3'],
          ['xxHash / CityHash', '64-128 bits', '~10-30 GB/s', 'Very good', 'No', 'Hash tables, dedup hints, RocksDB/LZ4 frames'],
          ['MD5 / SHA-1', '128 / 160 bits', '~0.5-1 GB/s', 'Yes', '**Broken**', 'Legacy ETags, old Git, non-security checks'],
          ['SHA-256 / BLAKE3', '256 bits', '~0.5-2 GB/s (BLAKE3 faster)', 'Yes', 'Yes', 'Content IDs, Git (new), Docker, blockchains'],
          ['HMAC-SHA256', '256 bits', 'Like SHA-256', 'Yes', 'Yes + proves key holder', 'Webhook signatures, API request signing, JWT HS256'],
        ],
      },
    },
    {
      h: 'Merkle trees: finding the difference cheaply',
      md: "Split data into blocks, hash each block (leaves), then hash pairs of hashes up to a single **root hash**. Two parties with the same root hash have identical data. If roots differ, compare the two children; descend only into the subtree that differs. Finding one bad block among *n* takes about `log2(n)` hash comparisons instead of transferring everything.\n\nUsed by Cassandra and DynamoDB-style stores for **anti-entropy repair** between replicas, by Git (trees of blobs), by ZFS and Btrfs (each block pointer stores the child's checksum, so corruption anywhere is detected on read), by BitTorrent and IPFS (verify each piece from untrusted peers), by certificate transparency logs, and by blockchains (prove a transaction is in a block with a short proof).",
      diagram: {
        nodes: [
          { id: 'root', label: 'Root hash', sub: 'H(H12 + H34)', type: 'storage', col: 2.5, row: 0, desc: 'One 32-byte value summarizing the entire dataset. Replicas compare this first.' },
          { id: 'h12', label: 'H12', sub: 'H(H1 + H2)', type: 'storage', col: 1.5, row: 1, desc: 'Summarizes blocks 1 and 2.' },
          { id: 'h34', label: 'H34', sub: 'H(H3 + H4)', type: 'storage', col: 3.5, row: 1, desc: 'Summarizes blocks 3 and 4. On replica B this differs, because block 3 differs.' },
          { id: 'b1', label: 'Block 1', sub: 'H1', type: 'db', col: 1, row: 2, desc: 'Leaf: hash of key range 1.' },
          { id: 'b2', label: 'Block 2', sub: 'H2', type: 'db', col: 2, row: 2, desc: 'Leaf: hash of key range 2.' },
          { id: 'b3', label: 'Block 3', sub: 'H3 (differs!)', type: 'db', col: 3, row: 2, desc: 'Leaf: the only key range that is out of sync between replicas.' },
          { id: 'b4', label: 'Block 4', sub: 'H4', type: 'db', col: 4, row: 2, desc: 'Leaf: hash of key range 4.' },
        ],
        edges: [
          { from: 'b1', to: 'h12' }, { from: 'b2', to: 'h12' }, { from: 'b3', to: 'h34' }, { from: 'b4', to: 'h34' },
          { from: 'h12', to: 'root' }, { from: 'h34', to: 'root' },
        ],
        flows: [
          {
            id: 'repair', name: 'Two replicas find the mismatch',
            steps: [
              { at: 'root', text: 'Replica A and B exchange root hashes: they differ, so some data differs.' },
              { from: 'root', to: 'h12', text: 'Compare left child H12: equal. Blocks 1-2 are in sync; skip them entirely.' },
              { from: 'root', to: 'h34', text: 'Compare right child H34: different. Descend.' },
              { from: 'h34', to: 'b3', text: 'H3 differs: block 3 is the culprit.' },
              { from: 'h34', to: 'b4', text: 'H4 equal: block 4 is fine.' },
              { at: 'b3', text: 'Stream only block 3\'s keys between replicas. 5 hash comparisons instead of shipping all 4 blocks; with a million blocks it is ~20 levels.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Checksums in system design',
      md: "- **Verify end to end.** TCP and Ethernet checks cover each hop, but bugs in proxies, memory, or storage controllers corrupt data *between* checks (the end-to-end argument). Compute a checksum where data is created and verify where it is consumed.\n- **Upload integrity**: send `Content-MD5` or `x-amz-checksum-crc32c`/`sha256` with S3 uploads; the server rejects mismatches. Multipart uploads checksum each part.\n- **Storage engines** checksum every page or block (PostgreSQL `data_checksums`, InnoDB page checksums, RocksDB block CRCs, HDFS per 512-byte chunk) and verify on read. **Scrubbing** reads cold data periodically to catch bit rot before the last good replica also fails.\n- **Choose chunk size**: one checksum per 1 GB file tells you *that* it is corrupt; per 4 KB block tells you *where*, so you can repair just that block from a replica.\n- **Decide what happens on mismatch**: retry the read, fetch from another replica, mark the replica bad, alert. A checksum that is computed but never acted on is wasted CPU.\n- **Change detection**: HTTP ETags, rsync's rolling checksum, dedup systems and cache keys all use hashes to avoid re-sending unchanged data.",
    },
  ],
  diagram: {
    intro: "End-to-end integrity for a file upload to object storage, with background scrubbing. Play the flows to see where corruption is caught.",
    nodes: [
      { id: 'client', label: 'Client SDK', type: 'client', col: 0, row: 1, desc: 'Computes CRC-32C (and/or SHA-256) of each part *before* sending, while the bytes are known good.' },
      { id: 'lb', label: 'Load Balancer', type: 'lb', col: 1, row: 1, desc: 'Terminates TLS. TLS records carry their own authentication tags, but the LB process itself could still corrupt data in memory.' },
      { id: 'api', label: 'Upload Service', type: 'service', col: 2, row: 1, multi: true, desc: 'Recomputes the checksum over the received bytes and rejects the request with 400 on mismatch.' },
      { id: 'store', label: 'Storage Nodes', sub: 'block CRC per 4 KB', type: 'storage', col: 4, row: 1, multi: true, desc: 'Write the data plus per-block checksums to 3 replicas or erasure-coded fragments; verify on every read.', tech: ['S3', 'HDFS', 'Ceph'] },
      { id: 'meta', label: 'Metadata DB', sub: 'object → SHA-256', type: 'db', col: 4, row: 0, desc: 'Stores the object\'s full checksum and ETag so later downloads can be verified by clients.' },
      { id: 'scrub', label: 'Scrubber', type: 'worker', col: 4, row: 2.5, desc: 'Continuously re-reads stored blocks, verifies checksums, and repairs bad ones from healthy replicas (bit rot detection).' },
    ],
    edges: [
      { from: 'client', to: 'lb', label: 'PUT + crc32c header' },
      { from: 'lb', to: 'api' },
      { from: 'api', to: 'store', label: 'write blocks' },
      { from: 'api', to: 'meta', label: 'save checksum' },
      { from: 'scrub', to: 'store', label: 'verify + repair', async: true },
    ],
    flows: [
      {
        id: 'upload', name: 'Upload with end-to-end verification',
        steps: [
          { at: 'client', text: 'SDK computes `crc32c = 0x9A3F21C4` over the part as it reads it from disk.' },
          { from: 'client', to: 'lb', text: '`PUT /bucket/video.mp4?partNumber=3` with header `x-amz-checksum-crc32c`.' },
          { from: 'lb', to: 'api', text: 'LB forwards the bytes.' },
          { at: 'api', text: 'Service recomputes CRC-32C over what actually arrived. Match → continue; mismatch → 400 BadDigest and the SDK retries.' },
          { from: 'api', to: 'store', text: 'Store blocks with per-block checksums on 3 storage nodes.' },
          { from: 'api', to: 'meta', text: 'Record the object\'s full checksum for future verification.' },
          { from: 'api', to: 'client', text: 'Return 200 with the checksum echoed back; the SDK compares it once more.' },
        ],
      },
      {
        id: 'bitrot', name: 'Bit rot caught by scrubbing',
        steps: [
          { at: 'store', text: 'Months later, a cosmic ray or failing sector flips one bit in a block on node 2. No error is raised.' },
          { from: 'scrub', to: 'store', text: 'Scrubber re-reads the block and recomputes its CRC: mismatch.' },
          { at: 'scrub', text: 'Mark node 2\'s copy bad; fetch the block from node 1, verify its CRC is correct.' },
          { from: 'scrub', to: 'store', text: 'Rewrite a healthy copy so the replication factor is back to 3, before a second fault could lose the data.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Checksums detect changes; they do not fix them. Plan the recovery path.',
    'CRC-32C: fast, hardware-accelerated, great for accidental corruption; not secure.',
    'SHA-256: collision-resistant content IDs; MD5/SHA-1 are broken for security.',
    'HMAC or signatures are needed to prove who produced the data.',
    'Merkle trees find differences in O(log n) comparisons: anti-entropy, Git, ZFS, BitTorrent.',
    'Verify end to end and scrub stored data regularly.',
  ],
  pitfalls: [
    'Trusting TCP\'s 16-bit checksum to catch all corruption at scale.',
    'Using MD5 or CRC to verify downloads from untrusted sources.',
    'Publishing a SHA-256 next to a file on the same compromised server and calling it secure.',
    'Computing checksums after the data has already passed through the buggy component.',
    'Checksums that are stored but never verified on read or scrubbed.',
  ],
  realWorld: [
    '**Amazon S3** added CRC-32, CRC-32C, SHA-1 and SHA-256 additional checksums and now computes integrity checks by default on uploads.',
    "**Amazon S3's 2008 outage** was triggered by a single corrupted bit in gossip messages that lacked a checksum; it took hours to recover.",
    '**Cassandra** builds Merkle trees per token range during `nodetool repair` to stream only out-of-sync data.',
    '**ZFS** stores each block\'s checksum in its parent pointer, making the whole pool a Merkle tree that self-heals from mirrors.',
    '**Git** names every object by its hash and is migrating from SHA-1 to SHA-256 after the SHAttered collision.',
  ],
  related: ['tcp-vs-udp', 'data-replication', 'reliability', 'gossip-protocol', 'storage-engines', 'bloom-filters'],
  quiz: [
    { q: 'Which is the best choice to detect accidental corruption in a high-throughput storage engine?', options: ['SHA-256', 'CRC-32C', 'MD5', 'A parity bit'], answer: 1, explain: 'CRC-32C is hardware-accelerated, catches burst errors reliably, and is cheap enough to compute on every block. Security is not the goal here.' },
    { q: 'Why is a plain SHA-256 hash not enough to prove a webhook really came from Stripe?', options: ['SHA-256 is too slow', 'Anyone can compute SHA-256 of a forged payload; you need an HMAC with a shared secret or a signature', 'SHA-256 has collisions', 'Webhooks are already encrypted'], answer: 1, explain: 'A hash proves integrity relative to a known value, not origin. HMAC binds the hash to a secret only the sender and receiver know.' },
    { q: 'Two replicas each hold 1 million blocks under a Merkle tree, and one block differs. About how many levels must be compared to find it?', options: ['1', '~20', '~1,000', '1,000,000'], answer: 1, explain: 'A binary Merkle tree over 2^20 leaves has ~20 levels; you follow one differing branch from the root.' },
    { q: 'Your service runs over TCP and TLS. Why might you still add an application-level checksum?', options: ['TCP has no checksum', 'Corruption can happen in memory, proxies or storage outside what TCP/TLS protect, so verify end to end', 'TLS disables integrity checks', 'Checksums speed up TCP'], answer: 1, explain: 'Transport checks only cover data on the wire between two endpoints. Bugs and hardware faults elsewhere need an end-to-end check.' },
  ],
  references: [
    { title: 'AlgoMaster: Checksums', url: 'https://algomaster.io/learn/system-design/checksums' },
    { title: 'Saltzer, Reed, Clark: End-to-End Arguments in System Design', url: 'https://web.mit.edu/Saltzer/www/publications/endtoend/endtoend.pdf' },
    { title: 'AWS: Checking object integrity in Amazon S3', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html' },
    { title: 'SHAttered: first SHA-1 collision', url: 'https://shattered.io/' },
  ],
});
