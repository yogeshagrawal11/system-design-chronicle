SD.paper({
  id: 'paper-paxos',
  title: 'Paxos',
  year: 1998,
  authors: 'Leslie Lamport — ACM Transactions on Computer Systems, 1998 (first submitted 1990)',
  icon: '🏛️',
  tagline: 'The Part-Time Parliament: how a group of unreliable machines can agree on one value, and then on a whole log of them.',
  summary:
    "Paxos is the algorithm that answers a deceptively simple question: **how can several machines agree on a single value when any of them may crash, restart, or have their messages delayed, lost or duplicated?** " +
    "Lamport wrote it up as the archaeology of an imaginary Greek island, Paxos, whose part-time legislators wander in and out of the chamber yet still keep a consistent book of laws.\n\n" +
    "Under the story is a precise protocol. A *proposer* picks a unique, increasing **ballot number**, asks a **majority** of *acceptors* to promise to ignore older ballots, learns whether any value may already have been chosen, and then asks the same majority to accept a value. " +
    "Because any two majorities overlap in at least one acceptor, a later ballot can always discover — and is forced to keep — a value that an earlier ballot got chosen. That one rule makes Paxos **safe no matter how badly timing goes**; it only needs a stable leader and a working majority to make progress.\n\n" +
    "Run the single-value protocol (the *Synod*) once per slot and you get **Multi-Paxos**: a replicated log, which is the foundation of state-machine replication behind Chubby, Spanner, ZooKeeper-style systems and Raft.",
  problem:
    "In the late 1980s people wanted replicated services: several copies of a database or lock server so one crash does not take the service down. Replicas stay identical only if they apply **the same commands in the same order**, which means they must *agree* on each command.\n\n" +
    "Doing that is surprisingly hard in an **asynchronous** network: you cannot tell a crashed machine from a slow one, messages can arrive late or twice, and two would-be leaders can be active at the same time. " +
    "Naive schemes (\"the leader decides\", two-phase commit) either block forever when the coordinator dies or let two sides decide different values during a split. The FLP result (1985) had even proven that no deterministic algorithm can *guarantee* termination in this model. " +
    "Lamport's goal was an algorithm that **never** gives a wrong answer and finishes whenever the system behaves reasonably for a while.",
  analogy:
    "Think of a committee that votes by mail and whose members are often away. Anyone can call a vote, but each call carries a ticket number, and members promise to ignore calls with smaller tickets than the highest they have seen. " +
    "Before proposing a motion, the caller asks a majority: \"what is the last motion you voted for?\" If anyone reports one, the caller must re-propose *that* motion rather than their own. " +
    "Because every two majorities share at least one member, once a motion has passed, every later caller hears about it and simply re-confirms it — the committee can never end up with two different decisions.",
  sections: [
    {
      h: 'Roles and the two phases',
      md:
        "Paxos separates three roles (a single server usually plays all of them):\n\n" +
        "- **Proposer** — tries to get a value chosen; in practice the current leader.\n" +
        "- **Acceptor** — votes; must store its promises and votes on **stable storage** so it remembers them after a crash.\n" +
        "- **Learner** — finds out which value was chosen and acts on it (applies it to the state machine).\n\n" +
        "A ballot `n` runs in two round trips:\n\n" +
        "1. **Prepare / Promise (phase 1).** The proposer sends `prepare(n)` to the acceptors. Each acceptor that has not promised a higher number replies `promise(n, lastBallot, lastValue)` — the highest-numbered vote it has cast so far, if any — and promises to reject any ballot below `n`.\n" +
        "2. **Accept / Accepted (phase 2).** With promises from a majority, the proposer chooses the value: if any promise reported a prior vote, it **must** use the value from the highest-numbered one; otherwise it may use its own. It sends `accept(n, v)`; each acceptor votes for it unless it has since promised a higher number. Once a majority has accepted `(n, v)`, **v is chosen** forever.\n\n" +
        "In the paper these messages are called *NextBallot*, *LastVote*, *BeginBallot*, *Voted* and *Success* — same protocol, parliamentary costume.",
      table: {
        headers: ['Paper (parliament)', 'Modern name', 'Meaning'],
        rows: [
          ['Priest / legislator', 'Proposer + acceptor + learner', 'A replica'],
          ['Ledger', 'Durable log on disk', 'What each acceptor has promised and voted'],
          ['Decree', 'Value / command', 'What is being agreed on'],
          ['Ballot number', 'Proposal number / term', 'Totally ordered, unique per proposer'],
          ['NextBallot → LastVote', 'Prepare → Promise', 'Phase 1: claim the ballot, learn prior votes'],
          ['BeginBallot → Voted', 'Accept → Accepted', 'Phase 2: get a majority to vote'],
          ['President', 'Distinguished proposer / leader', 'Avoids duelling proposers'],
        ],
      },
    },
    {
      h: 'Why it is safe: overlapping majorities',
      md:
        "The whole correctness argument hangs on one fact: **any two majorities of the same group share at least one member.** With 5 acceptors, a majority is 3, and any two sets of 3 overlap.\n\n" +
        "Suppose value `X` was chosen in ballot 5 (three acceptors voted for it). Any later ballot 7 must collect promises from three acceptors — at least one of whom voted for `X` in ballot 5. " +
        "That acceptor reports it, and the rule \"adopt the value of the highest-numbered vote you hear about\" forces ballot 7 to propose `X` again. By induction every later ballot proposes `X`, so **nothing else can ever be chosen**.\n\n" +
        "Notice what is *not* needed for safety: no clocks, no timeouts, no trusted leader, no reliable network. Messages may be lost, reordered or duplicated and two proposers may run simultaneously — the worst outcome is delay, never disagreement.",
    },
    {
      h: 'Liveness, leaders and duelling proposers',
      md:
        "Safety comes free; progress does not. Two proposers can **duel**: P1 prepares ballot 1, P2 prepares ballot 2 (invalidating P1), P1 retries with 3 (invalidating P2) and so on indefinitely. This is the FLP impossibility showing up in practice.\n\n" +
        "Lamport's fix is to elect a single **president** (leader) using timeouts, and let only it propose. Leader election only affects *liveness*: if two nodes briefly both think they are leader, safety still holds — the higher ballot simply wins. " +
        "Practical systems add randomised back-off so duels end quickly.\n\n" +
        "Fault tolerance is simple to state: with `2f + 1` acceptors Paxos tolerates `f` crashed or unreachable ones (3 nodes survive 1 failure, 5 survive 2).",
    },
    {
      h: 'Multi-Paxos: from one value to a replicated log',
      md:
        "One agreed value is not very useful; a replicated service needs an ordered **sequence** of commands. The paper's *multi-decree parliament* runs one instance of the protocol per log slot (decree 1, 2, 3, …).\n\n" +
        "The key optimisation: a stable leader runs **phase 1 once for all future slots**. After that, each new command only needs phase 2 — **one round trip to a majority** — which is about as cheap as replication can get. " +
        "If the leader dies, a new one runs phase 1 with a higher ballot, learns any half-finished slots and completes them (filling true gaps with no-ops) before taking new commands.\n\n" +
        "Every replica applies chosen commands in slot order to a deterministic state machine, so all replicas pass through the same states. This *state machine replication* pattern is what Chubby, Spanner's per-shard groups, etcd/Raft and many others implement.",
      table: {
        headers: ['Cost per command', 'Round trips', 'Notes'],
        rows: [
          ['Basic Paxos (each value)', '2', 'Prepare + accept every time'],
          ['Multi-Paxos, stable leader', '1', 'Phase 1 amortised across all slots'],
          ['Leader change', '1 extra', 'New leader re-runs phase 1, fixes open slots'],
        ],
      },
    },
  ],
  diagram: {
    intro: "One proposer (the leader), five acceptors (any 3 form a majority) and a learner that applies chosen values. A second proposer shows how competing ballots are resolved.",
    nodes: [
      { id: 'client', label: 'Client', sub: 'submits command', type: 'client', col: 0, row: 2, desc: 'Sends a command (e.g. `set x=5`) to the service and waits until it has been chosen and applied.' },
      { id: 'p1', label: 'Proposer P1', sub: 'leader, ballot 5', type: 'service', col: 2, row: 1, desc: 'Drives ballots. Picks a unique, increasing ballot number, gathers promises from a majority, then asks them to accept a value. In Multi-Paxos it is the stable leader.' },
      { id: 'p2', label: 'Proposer P2', sub: 'rival, ballot 7', type: 'service', col: 2, row: 3, desc: 'A second node that thinks the leader is dead (perhaps because of a slow network). Its higher ballot pre-empts P1, but safety guarantees it cannot choose a different value once one was chosen.' },
      { id: 'a1', label: 'Acceptor A1', type: 'db', col: 4, row: 0, desc: 'Stores `promisedBallot` and `(acceptedBallot, acceptedValue)` durably before replying. Rejects any message with a ballot lower than its promise.' },
      { id: 'a2', label: 'Acceptor A2', type: 'db', col: 4, row: 1, desc: 'An acceptor. Any 3 of the 5 acceptors form a majority (quorum).' },
      { id: 'a3', label: 'Acceptor A3', type: 'db', col: 4, row: 2, desc: 'An acceptor. Because any two majorities overlap, at least one acceptor in every new quorum remembers the most recent chosen value.' },
      { id: 'a4', label: 'Acceptor A4', type: 'db', col: 4, row: 3, desc: 'An acceptor. May be crashed or partitioned — Paxos with 5 acceptors tolerates any 2 being down.' },
      { id: 'a5', label: 'Acceptor A5', type: 'db', col: 4, row: 4, desc: 'An acceptor. May be crashed or partitioned — Paxos with 5 acceptors tolerates any 2 being down.' },
      { id: 'learner', label: 'Learner', sub: 'state machine', type: 'worker', col: 6, row: 2, desc: 'Learns the chosen value (from the leader or directly from a majority of acceptors) and applies it to the replicated state machine in log order.' },
    ],
    edges: [
      { from: 'client', to: 'p1', label: 'command' },
      { from: 'p1', to: 'a1', both: true },
      { from: 'p1', to: 'a2', both: true },
      { from: 'p1', to: 'a3', both: true },
      { from: 'p2', to: 'a3', both: true },
      { from: 'p2', to: 'a4', both: true },
      { from: 'p2', to: 'a5', both: true },
      { from: 'a3', to: 'learner', label: 'accepted', async: true },
      { from: 'p1', to: 'learner', label: 'chosen', async: true, curve: -0.3 },
    ],
    flows: [
      {
        id: 'round', name: 'A basic Paxos round',
        desc: 'P1 gets value X chosen with ballot 5 using the majority {A1, A2, A3}.',
        steps: [
          { from: 'client', to: 'p1', text: 'The client asks the service to agree on command X.' },
          { at: 'p1', text: 'P1 picks ballot 5 — higher than any ballot it has seen, and unique because ballot numbers embed the proposer id.' },
          { from: 'p1', to: 'a1', text: 'Phase 1a: P1 sends prepare(5) to the acceptors (shown for A1; A2 and A3 get the same).' },
          { from: 'a2', to: 'p1', text: 'Phase 1b: each acceptor writes “promised 5” to disk and replies promise(5, none) — it has never voted, so it reports no prior value.' },
          { at: 'p1', text: 'With promises from a majority (3 of 5) and no reported votes, P1 is free to propose its own value X.' },
          { from: 'p1', to: 'a3', text: 'Phase 2a: P1 sends accept(5, X) to the same majority.' },
          { at: 'a3', text: 'Each acceptor checks it has not promised anything above 5, records the vote (5, X) durably and replies accepted.' },
          { from: 'a3', to: 'learner', text: 'Once a majority has accepted (5, X), X is chosen; learners are told and apply it.' },
          { at: 'learner', text: 'The state machine executes X and the client gets its reply. Total cost: two round trips to a majority.' },
        ],
      },
      {
        id: 'rival', name: 'A rival proposer cannot undo a decision',
        desc: 'X was chosen in ballot 5 by {A1, A2, A3}. P2 now runs ballot 7 with {A3, A4, A5}, hoping to choose Y.',
        steps: [
          { at: 'p2', text: 'P2 suspects P1 is dead and starts ballot 7, intending to propose its own value Y.' },
          { from: 'p2', to: 'a4', text: 'P2 sends prepare(7) to A3, A4 and A5 — a different majority from ballot 5.' },
          { from: 'a4', to: 'p2', text: 'A4 and A5 never voted, so they reply promise(7, none).' },
          { from: 'a3', to: 'p2', text: 'But A3 is in both majorities: it replies promise(7, lastVote = (5, X)).' },
          { at: 'p2', text: 'The rule says: adopt the value of the highest-numbered vote reported. P2 must drop Y and propose X.' },
          { from: 'p2', to: 'a5', text: 'Phase 2a: P2 sends accept(7, X). The acceptors vote for it.' },
          { from: 'p1', to: 'a1', text: 'If P1 now retries accept(5, ...) it is rejected — A1–A3 may have promised 7 — so P1 learns it was pre-empted.' },
          { at: 'learner', text: 'Every learner still sees X. Overlapping majorities made it impossible to choose anything else.' },
        ],
      },
      {
        id: 'multi', name: 'Multi-Paxos steady state',
        desc: 'A stable leader has already run phase 1 for all slots; each new command costs one round trip.',
        steps: [
          { at: 'p1', text: 'P1 ran prepare once with ballot 9 for every slot ≥ 42 and got promises from a majority. It is now the leader.' },
          { from: 'client', to: 'p1', text: 'A client sends command C.' },
          { at: 'p1', text: 'P1 assigns C to the next free log slot, 42.' },
          { from: 'p1', to: 'a2', text: 'P1 sends accept(9, slot 42, C) straight away — no phase 1 needed.' },
          { from: 'a2', to: 'p1', text: 'A majority replies accepted; slot 42 now holds C forever.' },
          { from: 'p1', to: 'learner', text: 'P1 tells the learners (often piggybacked on the next message) that slot 42 is chosen.' },
          { at: 'learner', text: 'Each replica applies slots in order 41, 42, 43… so all state machines stay identical.' },
        ],
      },
    ],
  },
  sims: ['raft-election'],
  ideas: [
    '**Ballot numbers** totally order attempts; acceptors promise to ignore anything older than their latest promise.',
    '**Majority quorums overlap**, so any new ballot learns about any value that might already be chosen.',
    'A proposer must **re-propose the highest-numbered prior vote** it hears about — this is what makes decisions permanent.',
    '**Safety never depends on timing**; only progress needs a stable leader and a live majority.',
    '`2f + 1` replicas tolerate `f` failures; acceptor state must be **persisted** before replying.',
    '**Multi-Paxos** amortises phase 1 under a stable leader, giving one round trip per log entry and full state machine replication.',
  ],
  impact:
    "Paxos is the intellectual ancestor of nearly every strongly consistent replicated system in use today.\n\n" +
    "- **Google Chubby** and **Spanner** run Multi-Paxos groups (Spanner has one per data split); Google's \"Paxos Made Live\" (2007) documented how much engineering it took to turn the paper into a product.\n" +
    "- **ZooKeeper's Zab**, **Viewstamped Replication** (developed independently around the same time) and **Raft** (2014) are close relatives. Raft repackages Multi-Paxos with a strong leader and log-matching rules specifically to be easier to understand — try the Raft election simulator above for intuition.\n" +
    "- **etcd**, **Consul**, **CockroachDB**, **TiKV**, **Kafka KRaft** and **Amazon's internal lock and config services** all rely on Paxos- or Raft-style consensus.\n" +
    "- Variants such as Fast Paxos, Generalized/EPaxos, Flexible Paxos (only phase-1 and phase-2 quorums need to overlap) and Byzantine Paxos explore cheaper quorums and stronger fault models.\n\n" +
    "The paper itself has a famous history: reviewers found the Greek-parliament framing distracting and it sat unpublished for about eight years. Lamport later wrote **\"Paxos Made Simple\" (2001)**, which opens by saying the algorithm is among the simplest distributed algorithms — a good next read.",
  related: ['consensus-algorithms', 'data-replication', 'fault-tolerance', 'distributed-locking', 'cap-theorem', 'strong-vs-eventual-consistency', 'paper-chubby', 'paper-spanner', 'paper-zookeeper'],
  url: 'https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf',
  quiz: [
    {
      q: 'Why must a proposer adopt the value of the highest-numbered vote reported in the promises it receives?',
      options: ['To make ballots finish faster', 'Because that value might already be chosen, and changing it would let two different values be chosen', 'Because acceptors only store one ballot', 'To balance load across acceptors'],
      answer: 1,
      explain: 'Some majority may have accepted that value in an earlier ballot. Re-proposing it guarantees that every later ballot keeps the same decision.',
    },
    {
      q: 'A Paxos group has 5 acceptors. How many can fail while the group still makes progress?',
      options: ['1', '2', '3', '4'],
      answer: 1,
      explain: 'Progress needs a majority (3 of 5) to respond, so up to 2 may be down. In general 2f + 1 nodes tolerate f failures.',
    },
    {
      q: 'Two proposers keep pre-empting each other with ever-higher ballots and nothing gets chosen. What does this break?',
      options: ['Safety — two values may be chosen', 'Liveness — the system makes no progress, but stays correct', 'Durability — acceptors lose their votes', 'Nothing; this cannot happen in Paxos'],
      answer: 1,
      explain: 'Duelling proposers can stall Paxos indefinitely (the FLP limitation), but no wrong value is ever chosen. Electing a single leader with back-off restores progress.',
    },
    {
      q: 'Why can Multi-Paxos commit most commands in a single round trip?',
      options: ['It skips the acceptors entirely', 'A stable leader runs phase 1 once for all future slots, so each new command only needs phase 2', 'It uses synchronized clocks instead of ballots', 'It only waits for one acceptor'],
      answer: 1,
      explain: 'Phase 1 establishes the leader’s ballot for every future slot. Until another proposer pre-empts it, the leader can go straight to accept for each command.',
    },
    {
      q: 'Why must an acceptor write its promise to stable storage before replying?',
      options: ['To speed up later reads', 'So that after a crash and restart it cannot forget a promise or vote and contradict itself', 'Because learners read from its disk', 'It does not need to; memory is enough'],
      answer: 1,
      explain: 'If an acceptor forgot it had voted for X, a later ballot might not hear about X and could choose Y — breaking the overlap argument.',
    },
  ],
});
