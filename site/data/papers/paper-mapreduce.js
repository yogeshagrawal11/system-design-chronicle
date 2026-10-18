SD.paper({
  id: 'paper-mapreduce',
  title: 'MapReduce',
  year: 2004,
  authors: 'Jeffrey Dean, Sanjay Ghemawat (Google) — OSDI 2004',
  icon: '🗺️',
  tagline: 'Simplified Data Processing on Large Clusters: write two small functions, and the framework runs them on thousands of machines.',
  summary:
    "MapReduce is a programming model and a runtime for crunching huge datasets on clusters of cheap, failure-prone machines. The programmer writes just two functions:\n\n" +
    "- `map(key, value)` → emits a list of intermediate `(k2, v2)` pairs.\n" +
    "- `reduce(k2, list of v2)` → combines all values for one key into a result.\n\n" +
    "The library does everything else: splits the input into chunks, schedules **map tasks** close to where the data lives, **partitions and sorts** the intermediate output by key (the *shuffle*), runs **reduce tasks**, and quietly **re-runs** anything that fails or is slow. " +
    "Word count, inverted indexes, log analysis, graph processing and building Google's web index all fit this shape. The paper's key lesson is that a deliberately restricted model makes parallelism and fault tolerance automatic.",
  problem:
    "By 2003 Google engineers were writing hundreds of special-purpose programs that processed terabytes of crawled pages and logs. The actual logic of each was often trivial (count, group, invert), but every program had to re-solve the same hard problems: " +
    "**how to split the work across thousands of machines, move data between them, cope with machines dying mid-job, and avoid one slow disk holding up the whole job.**\n\n" +
    "That plumbing dwarfed the real logic and was easy to get wrong. Google wanted to hide parallelisation, data distribution, load balancing and failure handling behind a simple interface any engineer could use.",
  analogy:
    "Counting votes in a national election. Each local polling station (map task) tallies its own ballot box and writes results on slips sorted into one envelope per region. " +
    "Couriers (the shuffle) carry each region's envelopes to that region's counting centre (reduce task), which adds up everything for its candidates. " +
    "A head office (the master) assigns stations, tracks progress, and if a station goes silent, simply asks another station to recount that ballot box — counting twice is harmless because the answer is the same.",
  sections: [
    {
      h: 'The programming model',
      md:
        "Word count is the canonical example:\n\n" +
        "```\nmap(docName, text):\n  for word in text.split():\n    emit(word, 1)\n\nreduce(word, counts):\n  emit(word, sum(counts))\n```\n\n" +
        "Many real problems map neatly onto this:\n\n" +
        "- **Distributed grep** — map emits matching lines; reduce is the identity.\n" +
        "- **Inverted index** — map emits `(word, docId)`; reduce sorts doc ids into a posting list.\n" +
        "- **Reverse web-link graph** — map emits `(target, source)` for every link; reduce lists all sources per target.\n" +
        "- **Distributed sort** — map extracts the sort key; the framework's sorted shuffle does the rest.\n\n" +
        "Because map and reduce are supposed to be **deterministic, side-effect-free functions**, running a task twice gives the same output — and that is what makes failure recovery as simple as re-execution.",
    },
    {
      h: 'Execution: map, shuffle, reduce',
      md:
        "1. The input (usually files in **GFS**) is split into **M** pieces of 16–64 MB. The master creates M map tasks and **R** reduce tasks (R is chosen by the user, e.g. the number of output files).\n" +
        "2. The master assigns map tasks to idle workers, **preferring a machine that already holds a replica of the input chunk** so the data is read from local disk rather than over the network.\n" +
        "3. A map worker parses records, calls `map`, and buffers output in memory, periodically writing it to its **local disk**, divided into R regions by the partition function `hash(key) mod R`. It reports those file locations to the master.\n" +
        "4. A reduce worker fetches its region from **every** map worker via RPC (the shuffle), **sorts by key** so equal keys are adjacent, and calls `reduce` once per key.\n" +
        "5. Reduce output is written to a temporary file in GFS and **atomically renamed** to its final name when the task finishes, so each of the R outputs appears exactly once.\n\n" +
        "An optional **combiner** runs a mini-reduce on the map side (e.g. summing a thousand `(the, 1)` pairs into `(the, 1000)`) to shrink shuffle traffic dramatically.",
      table: {
        headers: ['Knob', 'Typical value in the paper', 'Why'],
        rows: [
          ['Input split size', '16–64 MB', 'Matches GFS chunk size, so one task reads one local chunk'],
          ['M (map tasks)', '≈ 200,000', 'Many small tasks give fine-grained load balancing and fast recovery'],
          ['R (reduce tasks)', '≈ 5,000', 'Bounded by the number of output files users want'],
          ['Workers', '≈ 2,000 machines', 'Each runs many tasks over the job lifetime'],
        ],
      },
    },
    {
      h: 'Fault tolerance and stragglers',
      md:
        "At thousands of machines, failures are routine. The master **pings** workers periodically:\n\n" +
        "- If a worker dies, its **in-progress** tasks are reset to idle and rescheduled. Its **completed map tasks are also re-run**, because their output lived on the dead machine's local disk. Completed reduce tasks are safe — their output is already in GFS.\n" +
        "- Reduce workers that had not yet fetched from the dead mapper are told to read from the replacement.\n" +
        "- The master itself was a single point of failure; the paper simply aborts the job and lets the client retry, since master failure was rare.\n\n" +
        "**Stragglers** — a machine with a failing disk or an overloaded CPU — can make the last 1% of tasks take as long as the first 99%. Near the end of a job the master launches **backup copies** of the remaining in-progress tasks and takes whichever finishes first. " +
        "In the paper's sort benchmark, disabling backups made the job **44% slower**.\n\n" +
        "Finally, if a particular input record deterministically crashes user code, workers report it and the master tells future attempts to **skip that record** — better to lose one bad record in a billion than the whole job.",
    },
    {
      h: 'Performance in practice',
      md:
        "On a cluster of about 1,800 machines the paper reports:\n\n" +
        "- **Grep** over 10¹⁰ 100-byte records (≈1 TB) in about **150 seconds**, including roughly a minute of start-up overhead.\n" +
        "- **Sort** of 1 TB in about **891 seconds**, comparable to the best published TeraSort results at the time.\n\n" +
        "Inside Google, the production web-indexing pipeline was rewritten as a sequence of 5–10 MapReduce jobs, shrinking the code and making it easy to add machines. Within a couple of years thousands of distinct MapReduce programs were in use.",
    },
  ],
  diagram: {
    intro: "Input splits in GFS feed map workers, which write partitioned output to local disk. Reduce workers pull their partition from every mapper, sort it, reduce it, and write final output back to GFS. The master coordinates all of it.",
    nodes: [
      { id: 'user', label: 'User Program', sub: 'map() + reduce()', type: 'client', col: 0, row: 2, desc: 'Links the MapReduce library, specifies input, output, M, R and the map/reduce functions, then submits the job and waits.' },
      { id: 'master', label: 'Master', sub: 'task scheduler', type: 'scheduler', col: 2, row: 0, desc: 'Keeps the state (idle / in-progress / completed) of every task and the location of every intermediate file. Assigns tasks with data locality, pings workers, reschedules failed tasks and launches backup tasks near the end.' },
      { id: 'input', label: 'Input Splits', sub: 'GFS, 64 MB each', type: 'storage', col: 1, row: 3, desc: 'The input data, already chunked and replicated three times by GFS. The master tries to run each map task on a machine holding one of the replicas.' },
      { id: 'map1', label: 'Map Worker', sub: 'split 1..k', type: 'worker', col: 3, row: 2, multi: true, desc: 'Reads a split, calls map() for each record, optionally runs the combiner, and partitions output into R buckets with hash(key) mod R.' },
      { id: 'map2', label: 'Map Worker', sub: 'split k+1..M', type: 'worker', col: 3, row: 4, multi: true, desc: 'Another map worker. Hundreds or thousands run in parallel, each processing many tasks over the life of the job.' },
      { id: 'local', label: 'Local Disk', sub: 'R partitions/mapper', type: 'storage', col: 4, row: 3, desc: 'Intermediate output is written to the mapper machine’s local disk, not GFS — it is temporary and cheap to regenerate. This is why completed map tasks must be re-run if their machine dies.' },
      { id: 'red1', label: 'Reduce Worker', sub: 'partition 0..j', type: 'worker', col: 5, row: 2, multi: true, desc: 'Pulls its partition from every mapper (the shuffle), sorts by key, calls reduce() once per key and writes one output file.' },
      { id: 'red2', label: 'Reduce Worker', sub: 'partition j+1..R', type: 'worker', col: 5, row: 4, multi: true, desc: 'Another reduce worker. Total reduce tasks = R, which equals the number of output files.' },
      { id: 'output', label: 'Output Files', sub: 'GFS, R files', type: 'storage', col: 6, row: 3, desc: 'Each reduce task writes to a temp file and atomically renames it on completion, so even if a reduce task runs twice the final output is written exactly once.' },
    ],
    edges: [
      { from: 'user', to: 'master', label: 'submit job' },
      { from: 'master', to: 'map1', label: 'assign map', curve: 0.2 },
      { from: 'master', to: 'red1', label: 'assign reduce', curve: -0.2 },
      { from: 'input', to: 'map1', label: 'local read' },
      { from: 'input', to: 'map2' },
      { from: 'map1', to: 'local', label: 'partitioned' },
      { from: 'map2', to: 'local' },
      { from: 'local', to: 'red1', label: 'shuffle (RPC)' },
      { from: 'local', to: 'red2' },
      { from: 'red1', to: 'output' },
      { from: 'red2', to: 'output' },
    ],
    flows: [
      {
        id: 'job', name: 'A word-count job end to end',
        steps: [
          { from: 'user', to: 'master', text: 'The user submits word count over 1 TB of web pages with M = 16,000 and R = 100.' },
          { at: 'master', text: 'The master creates 16,000 map tasks and 100 reduce tasks and looks up where GFS stores each input chunk.' },
          { from: 'master', to: 'map1', text: 'It assigns map task 17 to a worker that already holds a replica of split 17.' },
          { from: 'input', to: 'map1', text: 'The worker reads the 64 MB split from its own disk — no network transfer.' },
          { at: 'map1', text: 'map() emits (word, 1) for every word; the combiner pre-sums them, e.g. (the, 4210).' },
          { from: 'map1', to: 'local', text: 'Output is split into 100 files by hash(word) mod 100 on local disk; locations are reported to the master.' },
          { from: 'local', to: 'red1', text: 'Reduce task 3 fetches partition 3 from every one of the 16,000 map outputs (the shuffle).' },
          { at: 'red1', text: 'It sorts all pairs by word so identical words are adjacent, then calls reduce(word, counts) for each.' },
          { from: 'red1', to: 'output', text: 'Results go to a temp file in GFS, atomically renamed to part-00003 when done. When all 100 finish, the user program wakes up.' },
        ],
      },
      {
        id: 'failure', name: 'A worker dies mid-job',
        steps: [
          { at: 'master', text: 'The master pings every worker every few seconds. Map worker #2 stops answering.' },
          { at: 'map2', text: 'All its tasks — in-progress and completed — are reset to idle. Completed ones too, because their output sat on its now-unreachable local disk.' },
          { from: 'master', to: 'map1', text: 'The master reassigns those map tasks to healthy workers, again preferring ones near another replica of the input.' },
          { from: 'input', to: 'map1', text: 'The replacement re-reads the same input split. map() is deterministic, so it produces identical output.' },
          { from: 'map1', to: 'local', text: 'The new output is written to the replacement worker’s local disk.' },
          { from: 'master', to: 'red1', text: 'Reduce workers that had not yet pulled from the dead mapper are told the new location.' },
          { from: 'local', to: 'red1', text: 'They fetch the missing partitions and carry on. The user never notices, apart from a slightly longer runtime.' },
        ],
      },
      {
        id: 'straggler', name: 'Backup tasks beat a straggler',
        steps: [
          { at: 'master', text: 'The job is 99% complete, but one reduce task is crawling because its machine has a failing disk.' },
          { at: 'red2', text: 'The straggler is reading at a fraction of normal speed and would hold up the whole job for many minutes.' },
          { from: 'master', to: 'red1', text: 'The master launches a backup copy of the same reduce task on an idle, healthy worker.' },
          { from: 'local', to: 'red1', text: 'The backup fetches the same partition from the mappers and processes it quickly.' },
          { from: 'red1', to: 'output', text: 'The backup finishes first and atomically renames its output into place.' },
          { at: 'master', text: 'The task is marked complete; the straggler’s result is discarded. A few percent extra compute saved ~44% of runtime in the sort benchmark.' },
        ],
      },
    ],
  },
  ideas: [
    'A **restricted functional model** (map, then group-by-key, then reduce) makes parallelism automatic.',
    '**Move computation to the data**: schedule map tasks on machines holding a GFS replica of their input.',
    '**Re-execution is the fault-tolerance mechanism** — deterministic tasks can simply be run again.',
    'Intermediate data on **local disk**, final output on **replicated GFS** with **atomic rename** commits.',
    '**Backup tasks** neutralise stragglers; the tail of a job matters as much as its average.',
    'Many small tasks (M ≫ machines) give fine-grained load balancing and fast recovery.',
  ],
  impact:
    "MapReduce launched the **big-data era**. Yahoo engineers built an open-source clone, **Hadoop MapReduce** (on top of HDFS, a GFS clone), which powered most large-scale analytics from roughly 2007 to 2015 and spawned an ecosystem: **Hive** and **Pig** compiled SQL-like queries into MapReduce jobs, and **YARN** generalised the scheduler.\n\n" +
    "Its limitations inspired the next wave. Writing every intermediate result to disk made iterative and interactive work slow, so **Apache Spark** (2010) kept data in memory as RDDs; Google itself moved to **FlumeJava**, **MillWheel** and **Dataflow** (now Apache Beam), which unify batch and streaming. " +
    "Yet the core ideas — data-local scheduling, deterministic re-execution, partitioned shuffles, speculative execution — live on in Spark, Flink, BigQuery, Snowflake and Amazon EMR.",
  related: ['batch-vs-stream-processing', 'paper-gfs', 'paper-bigtable', 'fault-tolerance', 'database-sharding', 'concurrency-vs-parallelism', 'scalability'],
  url: 'https://research.google.com/archive/mapreduce-osdi04.pdf',
  quiz: [
    {
      q: 'When a worker fails, why must its *completed* map tasks be re-executed but not its completed reduce tasks?',
      options: ['Map tasks are cheaper', 'Map output lives on the failed machine’s local disk, while reduce output is already in replicated GFS', 'Reduce tasks are never retried', 'The master only tracks reduce tasks'],
      answer: 1,
      explain: 'Intermediate map output is stored locally and becomes unreachable with the machine. Reduce output was committed to GFS, so it survives.',
    },
    {
      q: 'What makes it safe to run the same map or reduce task twice (for failures or backup tasks)?',
      options: ['A distributed lock around each task', 'Tasks are deterministic and outputs are committed by atomic rename, so duplicates produce the same single result', 'Two-phase commit across workers', 'The master merges duplicate outputs'],
      answer: 1,
      explain: 'Deterministic functions give identical output, and the atomic rename means only one copy of each reduce output ever becomes visible.',
    },
    {
      q: 'Why does the master try to schedule a map task on a machine that holds a replica of its input split?',
      options: ['To reduce CPU usage', 'Network bandwidth is the scarce resource; reading from local disk avoids moving terabytes over the network', 'GFS forbids remote reads', 'To make reduce faster'],
      answer: 1,
      explain: 'In 2004 clusters, network bandwidth was much scarcer than disk bandwidth. Data locality meant most input was read without crossing the network.',
    },
    {
      q: 'In word count, what does adding a combiner primarily reduce?',
      options: ['The number of map tasks', 'The amount of data shuffled from mappers to reducers', 'The number of output files', 'The time to read input'],
      answer: 1,
      explain: 'The combiner pre-aggregates (word, 1) pairs on the map side, so far fewer bytes cross the network during the shuffle.',
    },
    {
      q: 'Why does MapReduce launch backup copies of tasks near the end of a job?',
      options: ['To double-check results for correctness', 'To finish faster when a few slow machines (stragglers) would otherwise dominate total job time', 'To test new hardware', 'Because the first copy always fails'],
      answer: 1,
      explain: 'A single slow machine can hold up a job. Racing a backup copy and taking whichever finishes first trims the long tail.',
    },
  ],
});
