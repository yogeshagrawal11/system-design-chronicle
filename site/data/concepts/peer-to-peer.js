SD.concept({
  id: 'peer-to-peer',
  category: 'patterns',
  order: 5,
  icon: '🕸️',
  title: 'Peer-to-Peer (P2P)',
  tagline: 'Every node is both client and server, so capacity grows with the number of users instead of the size of your data center.',
  summary:
    'In a **peer-to-peer** network there is no central server holding the data. Each participant (**peer**) both *consumes* and *serves*: while you download a file you upload the pieces you already have to others. Total upload capacity grows with every peer that joins, which is why a popular Linux ISO downloads **faster** as more people want it, the opposite of a central server.\n\n' +
    'The hard problems move elsewhere: **finding** who has what without a central index (trackers and **DHTs** like Kademlia), **trusting** data from strangers (content hashes), **incentivizing** peers to upload (tit-for-tat), coping with constant **churn**, and connecting machines that sit behind home routers (**NAT traversal**).',
  analogy:
    'A neighbourhood book swap instead of a library. Nobody owns all the books; each house has a few. A notice board (tracker) or word of mouth (DHT) tells you which houses have the chapters you need. You photocopy chapter 3 from one neighbour and chapter 7 from another, check each against the publisher\'s fingerprint, and then lend your copies to whoever asks next.',
  sections: [
    {
      h: 'Flavours of P2P',
      md: 'Real systems sit on a spectrum between "central index" and "fully decentralized":',
      table: {
        headers: ['Type', 'How peers find content', 'Example', 'Weakness'],
        rows: [
          ['Centralized index', 'A central server lists who has which file; transfer is P2P', 'Napster (1999)', 'Index is a single point of failure (and of legal shutdown)'],
          ['Unstructured', 'Flood queries to neighbours with a TTL', 'Gnutella', 'Floods do not scale; rare files are hard to find'],
          ['Structured (DHT)', 'Keys map to nodes by a deterministic rule; lookup in O(log N) hops', 'Kademlia: BitTorrent Mainline DHT, IPFS, Ethereum discovery', 'More complex; vulnerable to Sybil attacks'],
          ['Hybrid / super-peers', 'Some well-connected peers act as mini-servers', 'Early Skype, Kazaa', 'Super-peers carry extra load'],
        ],
      },
    },
    {
      h: 'How BitTorrent downloads a file',
      md:
        'A file is cut into **pieces** (typically 256 KB to 4 MB). The `.torrent` file or **magnet link** contains the **info-hash** (identity of the content) and, for each piece, a cryptographic hash, so any piece from any stranger can be verified and bad data thrown away.\n\n' +
        '- **Rarest-first**: download the pieces fewest peers have, so no piece disappears when the original seeder leaves.\n' +
        '- **Tit-for-tat choking**: upload mainly to the ~4 peers that upload fastest to you, re-evaluated every ~10 s, plus one random **optimistic unchoke** every ~30 s so newcomers can start.\n' +
        '- **Seeders** have every piece; **leechers** are still downloading. Once you finish, you become a seeder.',
      diagram: {
        nodes: [
          { id: 'me', label: 'You (new peer)', type: 'client', col: 0, row: 2, desc: 'Starts with only a magnet link: `magnet:?xt=urn:btih:<info-hash>`.' },
          { id: 'stun', label: 'STUN Server', type: 'external', col: 0, row: 0.5, desc: 'Tells you your public IP:port as seen from outside your NAT, which you share with peers so they can reach you.' },
          { id: 'turn', label: 'TURN Relay', type: 'external', col: 0, row: 3.6, desc: 'Fallback that forwards traffic when two peers are both behind strict (symmetric) NATs and hole punching fails. Costs bandwidth, so it is a last resort.' },
          { id: 'tracker', label: 'Tracker', sub: 'optional', type: 'service', col: 1.5, row: 0, desc: 'HTTP/UDP server that returns a list of peers for an info-hash. Fast, but a central point; DHT makes it optional.' },
          { id: 'dht', label: 'DHT (Kademlia)', sub: 'millions of nodes', type: 'service', col: 2, row: 4, multi: true, desc: 'Distributed table mapping info-hash → peers, spread across every participating client. Lookup takes O(log N) hops.' },
          { id: 'seed', label: 'Seeder', sub: 'has 100%', type: 'service', col: 3, row: 0.8, desc: 'A peer with the complete file.' },
          { id: 'peerA', label: 'Peer A', sub: 'has 60%', type: 'service', col: 4, row: 2, desc: 'A leecher that already has some pieces and uploads them while downloading the rest.' },
          { id: 'peerB', label: 'Peer B', sub: 'has 30%', type: 'service', col: 3, row: 3.3, desc: 'Another leecher. Swaps pieces with you in a tit-for-tat relationship.' },
        ],
        edges: [
          { from: 'me', to: 'stun', label: 'my public addr?' },
          { from: 'me', to: 'turn', label: 'fallback' },
          { from: 'me', to: 'tracker', label: 'announce' },
          { from: 'me', to: 'dht', label: 'get_peers' },
          { from: 'me', to: 'seed', both: true },
          { from: 'me', to: 'peerA', both: true, label: 'pieces' },
          { from: 'me', to: 'peerB', both: true },
          { from: 'seed', to: 'peerA', both: true },
          { from: 'peerA', to: 'peerB', both: true },
        ],
        flows: [
          {
            id: 'download', name: 'Join a swarm and download',
            steps: [
              { at: 'me', text: 'Parse the magnet link and get the 20-byte info-hash.' },
              { from: 'me', to: 'stun', text: 'Learn your public address and open a NAT mapping (needed so others can connect back).' },
              { from: 'me', to: 'dht', text: 'Ask the DHT for peers: each hop returns nodes whose IDs are XOR-closer to the info-hash, until you reach the nodes storing the peer list.' },
              { from: 'me', to: 'tracker', text: 'If the torrent lists a tracker, announce to it too and get more peers faster.' },
              { from: 'me', to: 'seed', text: 'Connect to peers and fetch the metadata (piece hashes) first, then start requesting pieces.' },
              { from: 'peerA', to: 'me', text: 'Download the **rarest** pieces first from whichever peers have them, several in parallel.' },
              { at: 'me', text: 'Hash every received piece; a mismatch means a bad or malicious peer, so throw it away and ban the peer.' },
              { from: 'me', to: 'peerB', text: 'Upload pieces you already have to peers who upload to you (tit-for-tat).' },
              { at: 'me', text: 'All pieces verified: you are now a **seeder** and add capacity to the swarm.' },
            ],
          },
        ],
      },
    },
    {
      h: 'DHTs and Kademlia in a nutshell',
      md:
        '- Every node and every key gets a **160-bit ID** (e.g., a SHA-1 hash). "Distance" between two IDs is their **XOR**, read as a number.\n' +
        '- A key is stored on the *k* nodes (typically k = 20) whose IDs are closest to it.\n' +
        '- Each node keeps **k-buckets**: for every bit-prefix length, up to k contacts. It knows many nodes near itself and a few far away, like a phone book that is detailed for your street and sparse for other cities.\n' +
        '- A lookup asks the α ≈ 3 closest known nodes in parallel, which reply with nodes even closer; each round roughly **halves the distance**, so finding anything among 10 million nodes takes about log₂(10M) ≈ **23 hops** at worst (far fewer in practice).\n' +
        '- Churn is handled by storing on k nodes, refreshing buckets, and preferring long-lived contacts (old nodes are likely to stay online).\n\n' +
        'It is the same "map keys to nodes by hash" idea as [consistent hashing](#/concept/consistent-hashing), but with no node knowing the full membership.',
    },
    {
      h: 'NAT traversal: getting through home routers',
      md:
        'Most peers sit behind a **NAT** that blocks unsolicited inbound connections, so two home users cannot simply connect.\n\n' +
        '1. **STUN**: each peer asks a public server "what is my public IP:port?"\n' +
        '2. Peers swap these candidate addresses through a **signalling** channel (tracker, DHT, or a web server for WebRTC).\n' +
        '3. **UDP hole punching**: both send packets to each other at the same moment. Each NAT sees outbound traffic and lets the reply in.\n' +
        '4. **TURN** relay if that fails, usually with **symmetric NATs** (common on mobile carriers and corporate networks) that pick a new port for each destination.\n\n' +
        '**ICE** (used by WebRTC) tries all candidates (local, STUN-derived, relayed) and picks the best working pair. In practice most connections succeed directly, and a minority need the paid relay.',
      callout: { type: 'warn', md: '**Trust and security**: peers are anonymous and can lie. Verify all content by hash, limit what a single peer can influence (Sybil and eclipse attacks on DHTs), and remember that your IP address is visible to every peer in the swarm.' },
    },
  ],
  compare: {
    title: 'When to choose which: P2P vs client-server vs CDN',
    headers: ['', 'Client-server', 'CDN', 'Peer-to-peer'],
    rows: [
      ['Who pays for bandwidth', 'You', 'You (cheaper, at the edge)', 'Mostly the users'],
      ['Scales with popularity', 'Needs more servers', 'Very well, for a fee', 'Gets *better* with more peers'],
      ['Control, auth, takedowns', 'Full', 'Full', 'Minimal'],
      ['Latency & reliability', 'Predictable', 'Best', 'Variable; depends on peers'],
      ['Choose when', 'Business data, transactions, private content', 'Public static/streaming content with SLAs', 'Huge public files, censorship resistance, direct low-latency media'],
      ['Real example', 'Banking, SaaS', 'Netflix Open Connect, YouTube', 'BitTorrent, IPFS, WebRTC calls, Blizzard/Windows Update delivery optimization'],
    ],
  },
  keyPoints: [
    'Peers are both clients and servers; capacity grows with the number of participants.',
    'Content is addressed and verified by cryptographic hash, so untrusted peers are safe sources.',
    'DHTs (Kademlia) locate data in O(log N) hops with no central index.',
    'BitTorrent uses piece-level swarming, rarest-first and tit-for-tat incentives.',
    'NAT traversal needs STUN + hole punching, with TURN relays as fallback.',
  ],
  pitfalls: [
    'Assuming peers are online, honest or fast: design for churn and malicious nodes.',
    'Forgetting free-riders: without incentives, peers download and leave.',
    'Ignoring NATs: a design that needs inbound connections fails for most home and mobile users.',
    'Using P2P for data that needs strong consistency, access control or deletion guarantees.',
  ],
  realWorld: [
    '**BitTorrent**: at its peak a large share of global upstream internet traffic; Mainline DHT has millions of concurrent nodes.',
    '**WebRTC** (Google Meet, Discord voice for small groups) connects browsers peer-to-peer via ICE/STUN/TURN.',
    '**Windows Update Delivery Optimization** and game launchers use P2P to cut CDN costs for huge patches.',
    '**IPFS** and **Ethereum** use Kademlia-style DHTs for content and node discovery; Bitcoin is a P2P gossip network.',
  ],
  related: ['client-server', 'consistent-hashing', 'gossip-protocol', 'cdn', 'tcp-vs-udp', 'checksums'],
  quiz: [
    { q: 'Why does a popular torrent usually download faster than an unpopular one?', options: ['Trackers prioritize popular files', 'More peers means more upload capacity and more sources for each piece', 'Popular files are compressed better', 'ISPs cache them'], answer: 1, explain: 'In P2P every downloader is also an uploader, so total capacity rises with demand.' },
    { q: 'How does a BitTorrent client know a piece from an unknown peer is not corrupted or malicious?', options: ['It trusts the tracker', 'It compares the piece\'s hash with the hash in the torrent metadata', 'It asks two other peers', 'TCP checksums are enough'], answer: 1, explain: 'Piece hashes are part of the content\'s identity (info-hash), so anything that does not match is discarded.' },
    { q: 'In Kademlia, how is "distance" between a node ID and a key defined?', options: ['Network latency', 'Number of router hops', 'XOR of the two IDs, interpreted as an integer', 'Geographic distance'], answer: 2, explain: 'XOR distance is symmetric and lets each lookup step roughly halve the remaining distance.' },
    { q: 'Two peers are both behind symmetric NATs and UDP hole punching fails. What does WebRTC/ICE fall back to?', options: ['STUN', 'A TURN relay server', 'DNS', 'Giving up'], answer: 1, explain: 'TURN relays the media through a public server. It always works but costs the operator bandwidth.' },
  ],
  references: [
    { title: 'Spiceworks: What Is Peer-to-Peer?', url: 'https://www.spiceworks.com/tech/networking/articles/what-is-peer-to-peer/' },
    { title: 'Maymounkov & Mazières: Kademlia (2002)', url: 'https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf' },
    { title: 'BitTorrent Protocol Specification (BEP 3)', url: 'https://www.bittorrent.org/beps/bep_0003.html' },
  ],
});
