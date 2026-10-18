SD.design({
  id: 'uber',
  title: 'Ride Hailing (Uber)',
  company: 'Uber / Lyft',
  difficulty: 'hard',
  order: 2,
  featured: true,
  icon: '🚕',
  tagline: 'Track a million moving cars, match a rider to the right one in seconds, price it, and never assign one driver to two trips.',
  summary:
    "Ride hailing is a **real-time marketplace on a map**. Drivers stream GPS positions every few seconds; riders ask for a car; the system must find nearby available drivers, estimate arrival times on real roads, choose a good match, " +
    "offer it to the driver, and then drive a **trip state machine** from request to payment. " +
    "The hard parts are (1) ingesting **hundreds of thousands to millions of location updates per second** while keeping only the latest position in memory, (2) a **geospatial index of moving objects** (Uber uses H3 hexagons), " +
    "(3) **dispatch** that optimises globally rather than greedily, (4) **surge pricing** from live supply/demand, and (5) correctness: a driver must never be double-booked and a rider must never be charged twice.",
  analogy:
    "An air-traffic control room for taxis. Every car radios its position every few seconds; controllers keep a live board divided into hexagonal sectors; when a passenger calls, they look at the sectors around the passenger, pick the car that will arrive soonest (not just the closest as the crow flies), " +
    "radio the offer, and log every stage of the journey in a ledger so nobody gets billed twice.",
  numbers: [
    { value: '~30M', label: 'trips / day' },
    { value: '~1.5M', label: 'drivers online at peak' },
    { value: '~375K/s', label: 'location updates (4 s interval)' },
    { value: '<5 s', label: 'request → driver offer' },
    { value: '0', label: 'double-assigned drivers (invariant)' },
  ],
  requirements: {
    functional: [
      'Riders see nearby cars on a map and get an **upfront price and pickup ETA** before requesting.',
      'Riders request a ride; the system **matches** a nearby available driver who can accept or decline.',
      'Drivers continuously send their location; riders see the assigned driver move in real time.',
      'The trip moves through states: requested → driver assigned → arrived → in progress → completed (or cancelled).',
      '**Surge pricing** raises prices where demand exceeds supply.',
      'At trip end, the rider is **charged** and the driver credited; receipts are generated.',
    ],
    nonFunctional: [
      '**Low latency** matching: first offer to a driver within a few seconds of the request.',
      '**High write throughput** for locations (hundreds of thousands to millions of updates/s), but each update is tiny and only the latest one matters for matching.',
      '**Strong consistency** where money and assignment are concerned: one driver ↔ one active trip, exactly-once charging.',
      '**Availability** of the request path even when non-critical systems (surge, analytics) are degraded.',
      'Works with flaky mobile networks: retries, reconnects, and duplicate messages are normal.',
    ],
    outOfScope: ['Driver onboarding / background checks', 'Uber Eats (see the DoorDash design)', 'Ride sharing / pooling optimisation in depth', 'Fraud and safety tooling internals'],
  },
  estimation: {
    inputs: [
      { id: 'drivers', label: 'Drivers online at peak', value: 1.5e6, min: 1e5, max: 1e7, step: 1e5 },
      { id: 'interval', label: 'Location update interval', value: 4, min: 1, max: 30, step: 1, unit: 's' },
      { id: 'bytes', label: 'Bytes per location update', value: 200, min: 50, max: 1000, step: 10, unit: 'B' },
      { id: 'trips', label: 'Trips per day', value: 30e6, min: 1e6, max: 1e8, step: 1e6 },
      { id: 'peak', label: 'Peak / average request factor', value: 3, min: 1, max: 10, step: 0.5 },
      { id: 'cands', label: 'Candidate drivers per request', value: 20, min: 5, max: 100, step: 5 },
    ],
    outputs: [
      { label: 'Location updates / s', f: (v) => v.drivers / v.interval },
      { label: 'Location ingest bandwidth', unit: 'B/s', f: (v) => (v.drivers / v.interval) * v.bytes },
      { label: 'Live driver state in memory', unit: 'bytes', f: (v) => v.drivers * 256, note: '~256 B/driver: id, lat/lng, heading, H3 cell, status, vehicle type' },
      { label: 'Ride requests / s (peak)', f: (v) => (v.trips / 86400) * v.peak },
      { label: 'ETA computations / s (peak)', f: (v) => (v.trips / 86400) * v.peak * v.cands, note: 'every candidate needs a road ETA' },
      { label: 'Location history per day', unit: 'bytes', f: (v) => (v.drivers / v.interval) * 86400 * v.bytes * 0.5, note: 'assumes ~50% of the peak fleet online on average' },
      { label: 'Trip records per year', unit: 'bytes', f: (v) => v.trips * 365 * 5000, note: '~5 KB per trip (states, fare, route summary)' },
    ],
    notes:
      "Locations dominate **write volume** (≈ 375K/s) but are tiny and ephemeral: only the latest position per driver matters for matching, so the live state is just ~400 MB and lives in memory. History goes to a log for analytics, fare calculation and disputes. " +
      "Trip requests are comparatively few (~1K/s peak) but each one fans out into ~20 ETA computations and needs strongly consistent writes.",
  },
  api: [
    { method: 'WS', path: 'wss://rt.uber.example/driver', desc: 'Driver persistent connection (locations up, offers down)',
      req: '→ { "type": "loc", "seq": 8812, "pts": [ { "lat": 37.7749, "lng": -122.4194, "ts": 1760700000, "heading": 92, "speed": 11.2 } ] }\n← { "type": "offer", "offer_id": "o_77", "trip_id": "t_51", "pickup": {...}, "expires_in": 15 }',
      notes: 'Locations are batched (a few points per message) to save radio/battery. `seq` lets the server drop out-of-order or duplicate updates.' },
    { method: 'POST', path: '/v1/quotes', desc: 'Upfront price + pickup ETA', req: '{ "pickup": {"lat":37.77,"lng":-122.41}, "dropoff": {...}, "product": "UberX" }', res: '{ "quote_id": "q_9c", "fare": 18.40, "surge": 1.3, "pickup_eta_s": 240, "expires_at": "…+2min" }',
      notes: 'The quote is stored and signed so the rider is charged the price they saw, even if surge changes a second later.' },
    { method: 'POST', path: '/v1/trips', desc: 'Request a ride', req: 'Idempotency-Key: 4f1e…\n{ "quote_id": "q_9c", "payment_method": "pm_12" }', res: '202 { "trip_id": "t_51", "state": "MATCHING" }',
      notes: 'Idempotent: a retry after a dropped connection returns the same trip instead of hailing two cars.' },
    { method: 'POST', path: '/v1/offers/{offer_id}/accept', desc: 'Driver accepts an offer', res: '200 { "trip_id": "t_51", "state": "DRIVER_ASSIGNED" } | 409 offer expired' },
    { method: 'PATCH', path: '/v1/trips/{id}', desc: 'Driver marks arrived / started / completed', req: '{ "event": "START", "expected_version": 4 }', notes: 'Optimistic concurrency: the transition only applies if the trip is still at `expected_version`.' },
    { method: 'WS', path: 'wss://rt.uber.example/rider', desc: 'Rider live updates: trip state, driver position, ETA' },
    { method: 'POST', path: '/v1/trips/{id}/cancel', desc: 'Cancel (fee rules depend on state and elapsed time)' },
  ],
  dataModel: [
    { name: 'driver_live (memory)', store: 'Location shards (in-memory / Redis)', fields: [['driver_id', 'key', ''], ['lat, lng, heading, speed', 'float', 'latest only'], ['h3_cell', 'uint64', 'resolution 8–9'], ['status', 'enum', 'OFFLINE / AVAILABLE / OFFERED / ON_TRIP'], ['last_seen', 'timestamp', 'expire after ~30 s silence']],
      why: 'Overwritten every few seconds; losing it is harmless because the next update rebuilds it. Plus a reverse index `h3_cell → set(driver_id)` for nearby queries.' },
    { name: 'trips', store: 'Sharded SQL / Spanner-like (by trip_id)', fields: [['trip_id', 'PK', ''], ['rider_id, driver_id', 'bigint', ''], ['state', 'enum', 'state machine'], ['version', 'int', 'optimistic concurrency'], ['quote_id, fare', '', 'locked upfront price'], ['pickup, dropoff', 'geo', ''], ['timestamps', 'per state', 'requested_at, accepted_at, …']],
      why: 'Money and assignment require transactions and conditional updates. Write rate (~1K trips/s × ~6 transitions) is modest for a sharded relational store.' },
    { name: 'driver_assignment', store: 'Same DB (unique constraint)', fields: [['driver_id', 'PK', ''], ['active_trip_id', 'bigint', 'null when free']],
      why: 'The guard that makes double-booking impossible: assign = conditional write "set active_trip_id = t WHERE active_trip_id IS NULL".' },
    { name: 'location_events', store: 'Kafka → data lake', fields: [['driver_id', 'key', ''], ['trip_id', 'bigint?', ''], ['lat, lng, ts', '', ''], ['accuracy', 'float', '']],
      why: 'Durable trace for fare computation, safety investigations, ETA model training and surge.' },
    { name: 'payments', store: 'Ledger DB (double-entry)', fields: [['payment_id', 'PK', ''], ['trip_id', 'unique', 'one charge per trip'], ['amount, currency', '', ''], ['psp_ref', 'string', 'provider id'], ['status', 'enum', 'PENDING / CAPTURED / FAILED / REFUNDED']],
      why: 'Unique trip_id + idempotency key to the PSP guarantees exactly-once charging even with retries.' },
  ],
  architecture: {
    intro:
      "Top half: the **trip and money path** (requests, pricing, dispatch, payments) built on strongly consistent storage. Bottom half: the **location path** — a firehose of tiny updates kept in memory and streamed to Kafka. Dispatch sits in the middle and reads both.",
    nodes: [
      { id: 'rider', label: 'Rider App', type: 'client', col: 0, row: 1, desc: 'Gets quotes, requests rides, and watches the driver approach over a persistent connection.' },
      { id: 'driver', label: 'Driver App', type: 'client', col: 0, row: 3, desc: 'Streams GPS every ~4 s (batched), receives offers, and reports trip events (arrived, started, completed). Buffers events offline and replays them on reconnect.' },
      { id: 'gw', label: 'API Gateway', type: 'gateway', col: 1, row: 1, desc: 'Auth, rate limits, idempotency-key handling and routing for request/response APIs (quotes, trips, cancel).', tech: ['Envoy', 'Kong'] },
      { id: 'rt', label: 'Realtime Gateway', sub: 'WebSocket / push', type: 'gateway', col: 1, row: 3, multi: true, desc: 'Holds millions of persistent connections from drivers and riders. Upstream it forwards location batches; downstream it pushes offers, trip state changes and driver positions. Connection → server mapping is kept in a registry.', tech: ['WebSockets', 'gRPC streams', 'Uber RAMEN-style push'] },
      { id: 'trip', label: 'Trip Service', sub: 'state machine', type: 'service', col: 2, row: 1, multi: true, desc: 'Owns the trip lifecycle and enforces legal state transitions with versioned conditional writes. Orchestrates pricing, dispatch, notifications and payment.' },
      { id: 'loc', label: 'Location Service', sub: 'ingest', type: 'service', col: 2, row: 3, multi: true, desc: 'Validates and de-duplicates location batches (by `seq`), smooths GPS noise, snaps to roads, computes the H3 cell, updates the live index, and publishes to Kafka.' },
      { id: 'pay', label: 'Payment Service', type: 'service', col: 3, row: 0, desc: 'Charges the rider and credits the driver after completion via a payment provider, using the trip id as an idempotency key and a double-entry ledger.', tech: ['Stripe / Adyen / Braintree', 'Ledger DB'] },
      { id: 'tripdb', label: 'Trip Store', sub: 'transactional', type: 'db', col: 3, row: 1, desc: 'Trips, quotes and the driver→active-trip assignment table. Sharded by trip id; the assignment row is keyed by driver id with a uniqueness guard.', tech: ['MySQL (Schemaless)', 'Spanner', 'CockroachDB'] },
      { id: 'dispatch', label: 'Dispatch', sub: 'matching', type: 'service', col: 3, row: 2, multi: true, desc: 'For each request: find candidate drivers in nearby H3 cells, get road ETAs, and solve a small assignment problem over a short batching window. Sends the offer and handles accept/decline/timeout. Partitioned by city/region.' },
      { id: 'geo', label: 'Driver Geo Index', sub: 'H3 cell → drivers', type: 'cache', col: 3, row: 3, multi: true, desc: 'In-memory map from H3 cell to the set of available drivers, plus each driver latest state. Sharded by region / cell so each shard owns a part of a city. Entries expire if a driver goes silent.', tech: ['Redis', 'In-process shards (Ringpop-style)'] },
      { id: 'eta', label: 'ETA Service', type: 'ml', col: 4, row: 1, desc: 'Road-network routing (contraction hierarchies over live traffic) plus an ML model that corrects the routing estimate. Must handle tens of thousands of point-to-point queries per second.', tech: ['OSRM-style routing', 'DeepETA-style model'] },
      { id: 'pricing', label: 'Pricing', sub: 'fare + surge', type: 'service', col: 4, row: 2, desc: 'Computes upfront fares from route distance/time, product rates and the current surge multiplier for the pickup cell. Stores the quote so the price is honoured.' },
      { id: 'surge', label: 'Surge Engine', sub: 'stream job', type: 'worker', col: 4, row: 3, desc: 'Every ~30–60 s computes supply (available drivers) vs demand (app opens, requests) per H3 cell from the event stream, smooths it, and publishes multipliers to Pricing.', tech: ['Flink', 'Kafka Streams'] },
      { id: 'kafka', label: 'Event Stream', sub: 'locations, trip events', type: 'queue', col: 3, row: 4, desc: 'Durable log of every location point and trip event. Feeds surge, analytics, ETA training, fraud detection, and archival to the data lake.', tech: ['Kafka'] },
    ],
    edges: [
      { from: 'rider', to: 'gw', label: 'quote / request' },
      { from: 'rider', to: 'rt', label: 'live updates', both: true },
      { from: 'driver', to: 'rt', label: 'GPS / offers', both: true },
      { from: 'gw', to: 'trip' },
      { from: 'rt', to: 'loc', label: 'location batches' },
      { from: 'trip', to: 'tripdb', label: 'CAS transitions' },
      { from: 'trip', to: 'pricing', label: 'quote' },
      { from: 'trip', to: 'dispatch', label: 'find driver' },
      { from: 'trip', to: 'pay', label: 'on complete', async: true },
      { from: 'trip', to: 'rt', label: 'state push', curve: -0.2 },
      { from: 'dispatch', to: 'geo', label: 'nearby cells' },
      { from: 'dispatch', to: 'eta', label: 'ETAs' },
      { from: 'dispatch', to: 'rt', label: 'offer', both: true },
      { from: 'pricing', to: 'eta', label: 'route time' },
      { from: 'surge', to: 'pricing', label: 'multipliers' },
      { from: 'loc', to: 'geo', label: 'upsert' },
      { from: 'loc', to: 'kafka', async: true },
      { from: 'kafka', to: 'surge', async: true },
    ],
  },
  flows: [
    {
      id: 'ingest', name: 'Driver location ingestion',
      steps: [
        { from: 'driver', to: 'rt', text: 'Driver app sends a batch of GPS points (seq 8812) over its WebSocket every ~4 s.' },
        { from: 'rt', to: 'loc', text: 'Realtime gateway forwards the batch to the Location Service shard for this driver.' },
        { at: 'loc', text: 'Drop stale/duplicate points by `seq`, filter GPS jumps, snap to the nearest road, compute H3 cell (res 9).' },
        { from: 'loc', to: 'geo', text: 'Update the driver live record; if the cell changed, move the driver id from the old cell set to the new one. TTL refreshed.' },
        { from: 'loc', to: 'kafka', text: 'Publish the points to Kafka (keyed by driver id) for trace, ETA training and surge — fire-and-forget from the ingest path.' },
        { from: 'kafka', to: 'surge', text: 'Surge engine counts available drivers per cell in a 1-minute sliding window.' },
      ],
    },
    {
      id: 'quote', name: 'Get an upfront price',
      steps: [
        { from: 'rider', to: 'gw', text: 'Rider enters a destination; app calls `POST /quotes`.' },
        { from: 'gw', to: 'trip', text: 'Gateway routes to the Trip Service (which owns quotes).' },
        { from: 'trip', to: 'pricing', text: 'Ask Pricing for a fare for pickup → dropoff, product UberX.' },
        { from: 'pricing', to: 'eta', text: 'Get route distance and duration under current traffic.' },
        { at: 'pricing', text: 'Fare = base + per-km + per-min, × surge 1.3 for the pickup cell (latest multiplier from the Surge Engine), with min fare and caps.' },
        { from: 'trip', to: 'tripdb', text: 'Store the quote (fare, surge, expiry 2 min) so the rider pays exactly what they saw.' },
        { from: 'trip', to: 'gw', text: 'Return `quote_id`, $18.40 and pickup ETA 4 min.' },
        { from: 'gw', to: 'rider', text: 'Rider sees the price and taps Request.' },
      ],
    },
    {
      id: 'match', name: 'Request a ride and match a driver',
      steps: [
        { from: 'rider', to: 'gw', text: '`POST /trips` with the quote id and an **idempotency key**.' },
        { from: 'gw', to: 'trip', text: 'Trip Service creates trip t_51 in state `MATCHING` (a retry with the same key returns the same trip).' },
        { from: 'trip', to: 'dispatch', text: 'Hand the request to the Dispatch partition for San Francisco.' },
        { from: 'dispatch', to: 'geo', text: 'Fetch available drivers in the pickup cell and its k-ring of neighbours → 20 candidates.' },
        { from: 'dispatch', to: 'eta', text: 'Batch-request road ETAs for all 20 candidates to the pickup point.' },
        { at: 'dispatch', text: 'Collect requests for ~2 s, then solve the assignment for all open requests and drivers in the area (minimise total pickup time). t_51 → driver d_9 (ETA 3 min).' },
        { from: 'dispatch', to: 'rt', text: 'Mark d_9 as OFFERED (so no one else offers to them) and push the offer with a 15 s expiry.' },
        { from: 'rt', to: 'driver', text: 'Driver sees the offer and taps Accept.' },
        { from: 'driver', to: 'rt', text: 'Accept travels back over the same connection.' },
        { from: 'rt', to: 'dispatch', text: 'Dispatch receives the acceptance for offer o_77.' },
      ],
    },
    {
      id: 'assign', name: 'Commit the assignment (exactly one driver)',
      steps: [
        { from: 'dispatch', to: 'trip', text: 'Dispatch asks Trip Service to assign d_9 to t_51.' },
        { from: 'trip', to: 'tripdb', text: 'One transaction: `driver_assignment[d_9].active_trip = t_51 IF NULL` and `trips[t_51]: MATCHING → DRIVER_ASSIGNED IF version = 1`.' },
        { at: 'tripdb', text: 'Both conditions hold → commit. If the rider had cancelled or d_9 had another trip, the transaction fails and Dispatch tries the next candidate.' },
        { from: 'trip', to: 'rt', text: 'Push the new state to both apps.' },
        { from: 'rt', to: 'rider', text: 'Rider sees "Toyota Prius, 3 min away" and the car moving on the map.' },
      ],
    },
    {
      id: 'complete', name: 'Trip completes and payment',
      steps: [
        { from: 'driver', to: 'rt', text: 'During the trip, GPS points keep streaming (also tagged with the trip id).' },
        { from: 'rt', to: 'rider', text: 'Rider app receives the driver position every few seconds.' },
        { from: 'rt', to: 'loc', text: 'Location Service stores the trace for fare and safety.' },
        { from: 'loc', to: 'kafka', text: 'Trace points land in the durable stream.' },
        { from: 'rt', to: 'trip', text: 'Driver taps Complete; Trip Service transitions `IN_PROGRESS → COMPLETED` (versioned).' },
        { from: 'trip', to: 'tripdb', text: 'Persist the final state and clear the driver assignment row so d_9 is available again.' },
        { from: 'trip', to: 'pay', text: 'Emit "trip completed" asynchronously; the rider does not wait for the charge.' },
        { at: 'pay', text: 'Charge the upfront fare (+ tolls/tips) via the PSP with idempotency key = trip id; write ledger entries for rider debit and driver credit. Retries are safe.' },
      ],
    },
    {
      id: 'decline', name: 'Offer declined or timed out',
      steps: [
        { from: 'dispatch', to: 'rt', text: 'Offer o_77 sent to driver d_9 with a 15 s expiry.' },
        { from: 'rt', to: 'driver', text: 'Driver is in a tunnel; the message is delivered late or not at all.' },
        { at: 'dispatch', text: '15 s timer fires with no response → offer expires; d_9 goes back to AVAILABLE (and gets a lower acceptance score).' },
        { from: 'dispatch', to: 'geo', text: 'Re-query candidates (positions have changed) excluding d_9.' },
        { from: 'dispatch', to: 'eta', text: 'Refresh ETAs for the new candidate set.' },
        { from: 'dispatch', to: 'rt', text: 'Offer to the next-best driver. A late "accept" from d_9 gets `409 offer expired`.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '📡 Ingesting ~375K location updates per second',
      md:
        "Each update is ~200 bytes and is **obsolete four seconds later**. That shapes everything: we want the latest position in memory for matching and a durable log for history, but we never want a database transaction per GPS point.",
      options: [
        { name: 'Write every point to a database', pros: ['Simple; durable'], cons: ['375K writes/s of data nobody reads twice', 'Index churn on every write; huge cost', 'Matching queries compete with ingest'] },
        { name: 'Redis GEO per city', desc: '`GEOADD drivers:sf lng lat d_9`, `GEOSEARCH` for nearby.', pros: ['Off-the-shelf, fast', 'Fine up to tens of thousands of drivers per key'], cons: ['One sorted set per city becomes a hot key at scale', 'Status filters (available, vehicle type) need extra structures'] },
        { name: 'Sharded in-memory index + Kafka log', desc: 'Location shards own regions/cells and keep `cell → drivers` in RAM; every point is also appended to Kafka.', pros: ['Memory-speed updates and queries', 'Shards scale horizontally by region', 'Kafka gives durability, replay and many consumers (surge, ETA, fraud)'], cons: ['Custom service; a crashed shard loses state for a few seconds until drivers report again', 'Need consistent hashing / membership (Uber used Ringpop) to route to the owning shard'], chosen: true },
      ],
      verdict:
        "Treat live location as **soft state**: keep it in sharded memory, rebuild it from the next update after a crash, and send the durable copy to Kafka. Batch points on the phone (2–4 per message) and send deltas to save battery and bandwidth; the server de-duplicates by sequence number because mobile retries make duplicates routine.",
    },
    {
      title: '⬡ Geospatial index for moving objects: why H3 hexagons',
      md:
        "Unlike Yelp businesses, drivers **move constantly**, so the index must handle ~375K moves per second. A fixed grid makes an update a cheap set move (`old cell → new cell`, only when the cell actually changes); a quadtree would split and merge leaves continuously as cars cluster at airports and stadiums.\n\n" +
        "Uber built **H3**, a hexagonal hierarchical grid:\n\n" +
        "- Every hexagon has **6 neighbours at the same distance** (squares have 4 edge + 4 corner neighbours at different distances), so a `k-ring` of radius k is a good approximation of a circle.\n" +
        "- Resolutions nest roughly: res 7 ≈ 5 km², res 8 ≈ 0.7 km², res 9 ≈ 0.1 km². Matching uses fine cells, surge uses coarser ones.\n" +
        "- Cells are 64-bit ids, perfect as shard keys and map keys.\n\n" +
        "**Nearby query:** take the pickup cell, expand `kRing(cell, k)` until enough available drivers are found (k = 1 → 7 cells, k = 2 → 19 cells), then rank by road ETA, not straight-line distance — a driver 300 m away across a river may be 10 minutes away.",
      options: [
        { name: 'Geohash grid', pros: ['Simple string keys'], cons: ['Rectangular cells with uneven neighbour distances; distortion away from the equator'] },
        { name: 'Quadtree', pros: ['Adapts to density'], cons: ['Constant restructuring with moving objects; hard to shard'] },
        { name: 'H3 hexagons', pros: ['Uniform neighbours, smooth k-ring expansion', 'Hierarchical resolutions for matching vs surge', 'Open source, used for analytics too'], cons: ['Hexagons do not tile perfectly into parents (approximate hierarchy)'], chosen: true },
      ],
      verdict: 'A fixed hierarchical grid wins for moving objects, and hexagons make radius expansion and per-area analytics (surge, supply heatmaps) cleaner.',
    },
    {
      title: '🧮 Dispatch: greedy nearest vs batched matching',
      md:
        "**Greedy** (give each request the nearest free driver immediately) is locally optimal but globally bad: two riders A and B, two drivers X and Y. Greedy gives A the driver X (2 min) and leaves B with Y (12 min). Swapping gives 4 + 5 = 9 min total instead of 14.\n\n" +
        "**Batched matching** collects requests for a short window (~1–2 s) per area and solves a bipartite assignment (Hungarian algorithm or min-cost flow) on a cost matrix of pickup ETAs, plus terms for driver acceptance probability, fairness, and product type. The small delay buys large total-ETA improvements at busy times. Press play to see the pipeline.",
      diagram: {
        nodes: [
          { id: 'req', label: 'Ride requests', sub: 'arriving continuously', type: 'client', col: 0, row: 1, desc: 'Requests from one dispatch region.' },
          { id: 'win', label: 'Batch window', sub: '~2 s per region', type: 'scheduler', col: 1, row: 1, desc: 'Accumulate open requests so the solver can see trade-offs between them.' },
          { id: 'cand', label: 'Candidates', sub: 'k-ring of H3 cells', type: 'cache', col: 2, row: 0, desc: 'Available drivers near each request.' },
          { id: 'cost', label: 'Cost matrix', sub: 'road ETA + penalties', type: 'ml', col: 2, row: 2, desc: 'ETA for every request × driver pair, adjusted for acceptance probability and other objectives.' },
          { id: 'solve', label: 'Assignment solver', sub: 'min total cost', type: 'service', col: 3, row: 1, desc: 'Hungarian / min-cost flow on a matrix of a few hundred rows — milliseconds.' },
          { id: 'offer', label: 'Send offers', sub: '15 s expiry', type: 'gateway', col: 4, row: 1, desc: 'Each chosen driver gets one offer; they are marked OFFERED.' },
          { id: 'res', label: 'Accept?', type: 'service', col: 5, row: 1, desc: 'Accept → commit assignment. Decline/timeout → request goes back into the next window.' },
        ],
        edges: [
          { from: 'req', to: 'win' }, { from: 'win', to: 'cand' }, { from: 'cand', to: 'cost' }, { from: 'win', to: 'cost' },
          { from: 'cost', to: 'solve' }, { from: 'solve', to: 'offer' }, { from: 'offer', to: 'res' }, { from: 'res', to: 'win', label: 'declined', curve: 0.45 },
        ],
        flows: [
          { id: 'batch', name: 'One matching round', steps: [
            { from: 'req', to: 'win', text: 'Riders A and B request within the same 2 s window.' },
            { from: 'win', to: 'cand', text: 'Look up free drivers near each: X and Y are candidates for both.' },
            { from: 'cand', to: 'cost', text: 'ETAs: A–X 2, A–Y 4, B–X 5, B–Y 12 minutes.' },
            { from: 'cost', to: 'solve', text: 'Greedy would pick A–X (2) then B–Y (12) = 14. Solver picks A–Y + B–X = 9.' },
            { from: 'solve', to: 'offer', text: 'Offer Y to A and X to B.' },
            { from: 'offer', to: 'res', text: 'Y accepts. X declines.' },
            { from: 'res', to: 'win', text: 'B goes back into the next window with fresh candidates.' },
          ] },
        ],
      },
      verdict: 'Use batched matching in busy areas (sub-second to 2 s windows) and near-immediate matching in quiet ones where there is nothing to optimise. Partition dispatch by city/region so each solver sees only local supply and demand.',
    },
    {
      title: '🚦 Trip state machine and never double-booking',
      md:
        "The trip is a finite state machine. Every transition is a **conditional write** (`UPDATE … SET state = ?, version = version + 1 WHERE id = ? AND version = ?`), so concurrent events (rider cancels at the same moment the driver accepts) resolve deterministically: exactly one wins, the other gets a conflict and re-reads.\n\n" +
        "The **driver_assignment** row is the second guard: a driver can hold at most one active trip, enforced in the same transaction as the trip transition. Messages from phones are **at-least-once**, so every handler is idempotent (accepting an already-accepted offer is a no-op success).",
      diagram: {
        nodes: [
          { id: 's_req', label: 'MATCHING', type: 'scheduler', col: 0, row: 1, desc: 'Trip created, dispatch searching for a driver.' },
          { id: 's_asg', label: 'DRIVER_ASSIGNED', type: 'service', col: 1, row: 1, desc: 'Driver accepted; driver_assignment row set atomically.' },
          { id: 's_arr', label: 'ARRIVED', type: 'service', col: 2, row: 1, desc: 'Driver at pickup; waiting-time clock starts.' },
          { id: 's_prog', label: 'IN_PROGRESS', type: 'service', col: 3, row: 1, desc: 'Rider on board; trace recorded for fare.' },
          { id: 's_done', label: 'COMPLETED', type: 'db', col: 4, row: 1, desc: 'Driver freed; payment event emitted.' },
          { id: 's_paid', label: 'PAID', type: 'db', col: 5, row: 1, desc: 'Charge captured via PSP; ledger balanced.' },
          { id: 's_cxl', label: 'CANCELLED', type: 'external', col: 1.5, row: 2.5, desc: 'Allowed from MATCHING, DRIVER_ASSIGNED and ARRIVED; fee depends on state and elapsed time.' },
          { id: 's_nod', label: 'NO_DRIVERS', type: 'external', col: 0, row: 2.5, desc: 'Matching gave up after N rounds / timeout; rider notified.' },
        ],
        edges: [
          { from: 's_req', to: 's_asg', label: 'accept' }, { from: 's_asg', to: 's_arr', label: 'arrive' }, { from: 's_arr', to: 's_prog', label: 'start' },
          { from: 's_prog', to: 's_done', label: 'complete' }, { from: 's_done', to: 's_paid', label: 'charge ok', async: true },
          { from: 's_req', to: 's_cxl', label: 'cancel' }, { from: 's_asg', to: 's_cxl' }, { from: 's_arr', to: 's_cxl', label: 'no-show' }, { from: 's_req', to: 's_nod', label: 'timeout' },
        ],
        flows: [
          { id: 'race', name: 'Race: rider cancels while driver accepts', steps: [
            { at: 's_req', text: 'Trip t_51 is MATCHING at version 1.' },
            { from: 's_req', to: 's_asg', text: 'Driver accept arrives: CAS "version = 1 → 2, DRIVER_ASSIGNED" succeeds first.' },
            { at: 's_asg', text: 'Rider cancel was also sent with expected_version = 1 → **conflict**. Service re-reads: trip is now DRIVER_ASSIGNED.' },
            { from: 's_asg', to: 's_cxl', text: 'Cancel is re-evaluated against the new state: allowed, within the 2-minute free-cancel window; driver freed in the same transaction.' },
          ] },
          { id: 'happy', name: 'Happy path', steps: [
            { from: 's_req', to: 's_asg', text: 'Driver accepts.' },
            { from: 's_asg', to: 's_arr', text: 'Driver arrives at pickup.' },
            { from: 's_arr', to: 's_prog', text: 'Rider on board.' },
            { from: 's_prog', to: 's_done', text: 'Drop-off; driver available again.' },
            { from: 's_done', to: 's_paid', text: 'Async payment captured once (idempotency key = trip id).' },
          ] },
        ],
      },
    },
    {
      title: '📈 Surge pricing and upfront fares',
      md:
        "Surge exists to rebalance a marketplace: higher prices reduce marginal demand and pull drivers toward busy areas.\n\n" +
        "1. **Measure** per H3 cell (res ~7–8) every 30–60 s: supply = available drivers (from the location stream), demand = sessions that opened the app or requested (from trip/app events).\n" +
        "2. **Compute** a multiplier from the demand/supply ratio via a tuned curve; **smooth** across neighbouring cells and over time so prices do not flicker between adjacent blocks.\n" +
        "3. **Cap and guard**: regulatory caps, emergency caps (disasters), minimum durations.\n" +
        "4. **Lock in** at quote time: the quote stores fare and multiplier with an expiry so the rider pays what they saw even if surge changes.\n\n" +
        "Surge is **not on the critical path**: if the engine is down, Pricing uses the last published multiplier (or 1.0 after a staleness limit) — a ride at the wrong price is better than no ride.",
    },
    {
      title: '⏱️ ETA: routing + machine learning',
      md:
        "ETAs drive matching, pricing and the rider experience, at tens of thousands of queries per second.\n\n" +
        "- **Routing engine**: road graph with live traffic speeds per segment. Plain Dijkstra on a continent-size graph is far too slow; **contraction hierarchies** precompute shortcuts so a city-scale query takes well under a millisecond (see the [Google Maps design](#/design/google-maps)).\n" +
        "- **Many-to-one queries**: dispatch asks \"20 drivers → one pickup\"; compute them in one batched search from the pickup on the reverse graph instead of 20 separate searches.\n" +
        "- **ML correction**: the route estimate is systematically off (traffic lights, pickup spots, airports). Uber has described *DeepETA*, a model that predicts the residual between routing ETA and actual time using features like time of day, region and route type.\n" +
        "- **Feedback loop**: every completed trip gives a labelled example (predicted vs actual), streamed through Kafka into training.",
    },
  ],
  scaling: [
    { stage: '🌱 One city, 1K drivers', md: 'A monolith with Postgres + PostGIS. Drivers POST location every 5 s into a table with a spatial index; matching is "nearest available driver" with a SQL query. Works fine.' },
    { stage: '🌿 Tens of cities, 50K drivers', md: 'Location writes overwhelm the DB → move live locations to Redis GEO per city; keep trips in Postgres. Add WebSockets for push instead of polling. Introduce a routing engine for ETAs.' },
    { stage: '🌳 Hundreds of cities, 1M+ drivers', md: 'Split into services: realtime gateway, location shards (consistent hashing by region/cell), dispatch per region, trip service on sharded transactional storage, Kafka for every event, batched matching, surge as a stream job, ML ETAs.' },
    { stage: '🌍 Global, multi-region', md: 'Cities are pinned to a home region (a trip never spans continents), so most state is regional; active-active regions with failover of whole cities. Trip state replicates cross-region for disaster recovery, and drivers can replay buffered state to the new region after failover.' },
  ],
  tradeoffs: [
    { decision: 'Live location storage', chosen: 'In-memory sharded index (soft state) + Kafka', alternative: 'Database row per update', why: 'Only the latest point matters for matching; memory handles 375K updates/s cheaply and the next update rebuilds lost state.' },
    { decision: 'Spatial index', chosen: 'H3 hexagonal grid', alternative: 'Quadtree / geohash', why: 'Moving objects need O(1) cell moves; hexagons give uniform neighbours and clean multi-resolution aggregates for surge.' },
    { decision: 'Matching', chosen: 'Batched global assignment (1–2 s window)', alternative: 'Greedy nearest driver', why: 'Lower total pickup time and better fairness at a cost of a short, invisible delay.' },
    { decision: 'Driver selection metric', chosen: 'Road ETA', alternative: 'Straight-line distance', why: 'Rivers, one-way streets and highways make crow-flies distance misleading.' },
    { decision: 'Trip consistency', chosen: 'Versioned conditional writes + assignment row', alternative: 'Distributed locks', why: 'CAS in the database is simpler and survives process crashes; a lock lease could expire mid-transition.' },
    { decision: 'Payment timing', chosen: 'Async after completion with idempotency key', alternative: 'Synchronous charge at trip end', why: 'The driver should not wait on a slow payment provider; retries are safe because of the idempotency key.' },
    { decision: 'Push channel', chosen: 'Persistent WebSocket/gRPC streams', alternative: 'Polling', why: 'Offers have a 15 s expiry; polling every few seconds from millions of phones would be both slower and more expensive.' },
  ],
  failures: [
    { node: 'geo', scenario: 'A geo-index shard crashes', impact: 'Drivers in that region are invisible to dispatch for a few seconds.', mitigation: 'Membership detects the loss, a replica or new owner takes the cells, and within one update interval (~4 s) drivers repopulate it. Dispatch retries the query.' },
    { node: 'rt', scenario: 'Realtime gateway node dies with 200K connections', impact: 'Those drivers and riders lose push; offers to them fail.', mitigation: 'Apps reconnect with jittered backoff to another node; the registry updates connection ownership; undelivered offers time out and are re-dispatched; trip state is re-synced on reconnect.' },
    { node: 'dispatch', scenario: 'Dispatch for a city is overloaded (New Year\'s Eve)', impact: 'Matching slows; riders wait longer for offers.', mitigation: 'Partition by sub-region, autoscale ahead of known events, shrink the batch window, and cap candidate counts. Surge naturally reduces demand.' },
    { node: 'tripdb', scenario: 'Trip store shard unavailable', impact: 'New trips and transitions on that shard fail — this is the most serious outage.', mitigation: 'Synchronous replication with fast leader failover; driver app buffers trip events and replays them in order with versions; idempotency keys make replays safe.' },
    { node: 'surge', scenario: 'Surge engine stops publishing', impact: 'Prices stop reacting to demand.', mitigation: 'Pricing uses the last multiplier with a staleness limit, then decays toward 1.0. Rides never block on surge.' },
    { node: 'pay', scenario: 'Payment provider times out', impact: 'Charges not captured immediately; risk of double charge on naive retry.', mitigation: 'Idempotency key = trip id at the PSP, ledger state machine (PENDING → CAPTURED), retry with backoff, reconciliation against PSP reports. Trip completion never waits on it.' },
    { node: 'eta', scenario: 'ETA service degraded', impact: 'Matching quality and price accuracy drop; latency rises.', mitigation: 'Timeout and fall back to straight-line distance × city speed factor; cache recent cell-to-cell ETAs.' },
  ],
  interviewTips: [
    'Separate the two workloads early: a **firehose of soft-state locations** vs a **low-volume, strongly consistent trip/money path**.',
    'Do the location math out loud: 1.5M drivers / 4 s ≈ 375K writes/s, ~400 MB of live state — it fits in memory.',
    'Explain why matching uses road ETA and why batching beats greedy, with a two-rider example.',
    'Show the trip state machine and how CAS + the driver assignment row prevent double-booking under races.',
    'Mention idempotency keys on ride requests and payments — mobile networks retry everything.',
  ],
  concepts: ['spatial-indexing', 'websockets', 'consistent-hashing', 'database-sharding', 'idempotency', 'message-queues', 'event-driven-architecture', 'strong-vs-eventual-consistency', 'saga-pattern', 'push-vs-pull', 'acid-transactions'],
  realWorld: [
    'Uber open-sourced **H3** (hexagonal grid) and **Ringpop** (consistent-hash membership used for sharding in-memory services in its early dispatch system).',
    'Uber has described moving its dispatch system from greedy matching to batched matching, and its **DeepETA** model for correcting routing ETAs.',
    'Uber\'s **Schemaless** (MySQL-based) and later Docstore stored trips; its push platform (RAMEN) keeps long-lived connections to apps.',
    'Lyft has published on its own geospatial and marketplace systems, including dynamic pricing (Prime Time).',
  ],
  quiz: [
    { q: 'Why is it acceptable to keep live driver locations only in memory?', options: ['Memory is durable', 'Each location is soon superseded; after a crash the next update (~4 s later) rebuilds the state, and the durable copy is in Kafka', 'Uber does not need locations after a trip', 'Databases cannot store coordinates'], answer: 1, explain: 'Live location is soft state. Durability matters for history, which goes to a log; matching only needs the latest point.' },
    { q: 'Riders A and B request at once. ETAs: A–X 2, A–Y 4, B–X 5, B–Y 12 minutes. What does batched matching choose?', options: ['A–X and B–Y (total 14)', 'A–Y and B–X (total 9)', 'A–X only', 'Whichever request arrived first gets X'], answer: 1, explain: 'Minimising total cost over the batch finds A–Y + B–X = 9 minutes, beating the greedy 14 minutes.' },
    { q: 'A rider cancels at the same instant the driver accepts. What prevents an inconsistent trip?', options: ['A global lock on all trips', 'Both writes are conditional on the trip version; only one commits, the other re-reads and re-evaluates', 'Whichever message arrives last wins', 'The client apps coordinate'], answer: 1, explain: 'Optimistic concurrency makes concurrent transitions serialisable per trip; the loser handles the conflict against the new state.' },
    { q: 'Why do moving objects favour a fixed grid (H3/geohash) over a quadtree?', options: ['Quadtrees cannot store points', 'A move in a fixed grid is a cheap set move between cells, whereas a quadtree must split/merge as density shifts', 'Fixed grids use less memory in all cases', 'Quadtrees are only for images'], answer: 1, explain: 'With ~375K moves per second, structural rebalancing is expensive; a fixed grid keeps updates O(1).' },
    { q: 'The surge engine crashes during a concert. What should happen to ride requests?', options: ['Block until surge recovers', 'Proceed using the last multiplier, decaying toward 1.0 after a staleness limit', 'Charge the maximum surge', 'Disable the product'], answer: 1, explain: 'Surge is an optimisation of the marketplace, not a correctness dependency; requests must keep flowing.' },
    { q: 'A rider phone retries `POST /trips` after a timeout. How do we avoid sending two cars?', options: ['Rate-limit the rider', 'An idempotency key returns the existing trip for a repeated request', 'Ignore all retries', 'Ask the rider to confirm twice'], answer: 1, explain: 'The server stores the key with the created trip and returns the same response for any retry.' },
  ],
  references: [
    { title: 'Uber H3: hexagonal hierarchical spatial index', url: 'https://www.uber.com/blog/h3/' },
    { title: 'Uber Engineering: DeepETA', url: 'https://www.uber.com/blog/deepeta-how-uber-predicts-arrival-times/' },
    { title: 'Design Uber (video)', url: 'https://www.youtube.com/results?search_query=design+uber+system+design' },
  ],
});
