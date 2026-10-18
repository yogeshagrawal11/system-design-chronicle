SD.design({
  id: 'flight-booking',
  title: 'Flight Booking System',
  company: 'Expedia / Kayak / airline.com',
  difficulty: 'medium',
  order: 19,
  icon: '✈️',
  tagline: 'Search hundreds of airlines in seconds, hold a seat for 15 minutes, and turn a payment into a ticket without ever charging for a seat you did not get.',
  summary:
    'An online travel agency (OTA) lets users search flights across many airlines, pick an itinerary, hold it, pay, and receive an e-ticket. Unlike a hotel or cinema, **we do not own the inventory**: seats and fares live in airline systems, reached through **GDSs** (Amadeus, Sabre, Travelport) or airline **NDC** APIs that are slow (1–5 s), rate-limited and charged per request.\n\n' +
    'That shapes the whole design. **Search** is served mostly from a **fare cache** because users look ~1,000 times for every booking. **Booking** is a multi-step **saga** across systems we do not control — create a reservation (PNR) that holds seats with a deadline, authorize the card, issue the ticket, capture the money — where every step can time out and must be compensated if a later step fails. ' +
    'Underneath, airlines deliberately **overbook**, so even a confirmed ticket is a probabilistic promise.',
  analogy:
    'A travel agent with a phone and a notebook. For quick questions ("roughly how much is Paris in December?") she checks her notebook of recent quotes. When you are ready, she calls the airline to put seats on hold under your name for a short time, takes your card, and only then asks the airline to issue the ticket. If the airline says no, she tears up the card slip.',
  numbers: [
    { value: '~1000:1', label: 'look-to-book ratio' },
    { value: '1–5 s', label: 'live GDS search latency' },
    { value: '15 min', label: 'typical seat hold' },
    { value: '5–10%', label: 'no-shows airlines plan for' },
  ],
  requirements: {
    functional: [
      'Search one-way / round-trip flights by origin, destination, dates, passengers and cabin across many airlines; filter and sort by price, duration, stops.',
      'Show an accurate **final price** before payment (re-verify cached fares).',
      'Hold the selected itinerary for a limited time while the user enters details and pays.',
      'Book: create the airline reservation (PNR), take payment, issue e-tickets, email confirmation.',
      'View, cancel and get notified of changes (schedule changes, cancellations) to bookings.',
    ],
    nonFunctional: [
      'Search p95 < 2 s for the first results (stream more as they arrive).',
      '**Never** charge a customer without a ticket, and never issue a ticket without payment — correctness over speed on the booking path.',
      'Bookings are durable and auditable (money + legal travel documents).',
      'Highly available search; graceful degradation when a GDS/airline is slow or down.',
      'Control supplier cost: GDS/NDC calls cost money and are quota-limited.',
    ],
    outOfScope: ['Fare construction / pricing engine internals (ITA-style)', 'Loyalty programs, hotels, cars', 'Check-in and boarding passes', 'Airline departure control systems'],
  },
  estimation: {
    inputs: [
      { id: 'searches', label: 'Searches / day', value: 100e6, min: 1e6, max: 1e9, step: 1e6 },
      { id: 'ltb', label: 'Look-to-book ratio', value: 1000, min: 100, max: 5000, step: 50, unit: ':1' },
      { id: 'hit', label: 'Fare cache hit rate', value: 90, min: 0, max: 99, step: 1, unit: '%' },
      { id: 'fanout', label: 'Suppliers queried per live search', value: 6, min: 1, max: 20, step: 1 },
      { id: 'keys', label: 'Distinct cached search keys', value: 30e6, min: 1e6, max: 300e6, step: 1e6 },
      { id: 'kb', label: 'Cached result size', value: 40, min: 5, max: 200, step: 5, unit: 'KB' },
    ],
    outputs: [
      { label: 'Search QPS (avg)', f: (v) => v.searches / 86400 },
      { label: 'Search QPS (peak ×3)', f: (v) => (v.searches / 86400) * 3 },
      { label: 'Supplier calls / sec', f: (v) => (v.searches / 86400) * (1 - v.hit / 100) * v.fanout, note: 'misses × fan-out' },
      { label: 'Supplier calls / day', f: (v) => v.searches * (1 - v.hit / 100) * v.fanout },
      { label: 'Supplier cost / day (at $0.002/call)', f: (v) => '$' + Math.round(v.searches * (1 - v.hit / 100) * v.fanout * 0.002).toLocaleString(), note: 'illustrative price' },
      { label: 'Bookings / day', f: (v) => v.searches / v.ltb },
      { label: 'Booking QPS (peak ×5)', f: (v) => ((v.searches / v.ltb) / 86400) * 5 },
      { label: 'Fare cache memory', unit: 'bytes', f: (v) => v.keys * v.kb * 1000 },
    ],
    notes: 'The booking path is tiny (~100K/day ≈ 6 QPS peak) but must be **correct**; the search path is huge and must be **cheap**. Every point of cache hit rate removes millions of paid supplier calls per day, which is why OTAs invest so heavily in fare caching and pre-shopping.',
  },
  api: [
    { method: 'GET', path: '/v1/search?from=JFK&to=LHR&depart=2026-12-20&return=2027-01-03&adults=2&cabin=economy', desc: 'Search itineraries',
      res: '200 OK (streamed / paginated)\n{ "searchId": "s_9f2", "complete": false,\n  "offers": [\n    { "offerId": "of_77a", "airline": "BA", "segments": [...],\n      "price": { "total": 1224.40, "currency": "USD" },\n      "source": "cache", "pricedAt": "2026-10-17T09:12:00Z" }\n  ] }',
      notes: 'Returns cached offers immediately and streams live results (SSE or polling with `searchId`). Offers carry where the price came from and how old it is, so the UI can show "price confirmed at checkout".' },
    { method: 'POST', path: '/v1/offers/{offerId}/price', desc: 'Re-price and verify availability',
      res: '200 OK { "offerId": "of_77a", "available": true,\n  "price": { "total": 1251.10, "currency": "USD" },\n  "priceChanged": true, "fareRules": { "refundable": false, "changeFee": 150 } }',
      notes: 'A live call to the supplier for this exact itinerary and fare class. ~5–15% of cached prices change here; the UI must show the new price before continuing.' },
    { method: 'POST', path: '/v1/bookings', desc: 'Hold seats (create PNR)',
      req: 'Idempotency-Key: 6c1e...\n{ "offerId": "of_77a", "expectedTotal": 1251.10,\n  "passengers": [{ "first": "Ana", "last": "Silva", "dob": "1990-04-02", "passport": "..." }, ...],\n  "contact": { "email": "ana@example.com" } }',
      res: '201 Created { "bookingId": "bk_4410", "status": "HELD", "pnr": "X7KQ2M",\n  "holdExpiresAt": "2026-10-17T09:41:00Z" }',
      notes: 'Idempotency key prevents a double-click from creating two PNRs (two holds on scarce seats).' },
    { method: 'POST', path: '/v1/bookings/{id}/pay', desc: 'Pay and ticket (starts the saga)',
      req: 'Idempotency-Key: a2b9...\n{ "paymentMethod": "pm_card_visa_4242", "amount": 1251.10, "currency": "USD" }',
      res: '202 Accepted { "status": "TICKETING" }\n→ later: { "status": "CONFIRMED", "tickets": ["125-2345678901", "125-2345678902"] }',
      notes: 'Asynchronous: ticketing can take seconds. Client polls `GET /bookings/{id}` or gets a push. The same idempotency key replays the same outcome on retry.' },
    { method: 'GET', path: '/v1/bookings/{id}', desc: 'Booking status and documents', res: '{ "status": "CONFIRMED", "pnr": "X7KQ2M", "tickets": [...], "segments": [...] }' },
    { method: 'DELETE', path: '/v1/bookings/{id}', desc: 'Cancel (void within 24 h, or refund per fare rules)' },
  ],
  dataModel: [
    { name: 'bookings', store: 'PostgreSQL (sharded by booking_id)', fields: [['booking_id', 'uuid PK', ''], ['user_id', 'uuid', 'indexed'], ['status', 'enum', 'HELD → TICKETING → CONFIRMED | FAILED | EXPIRED | CANCELLED'], ['offer_snapshot', 'jsonb', 'segments, fare basis, rules at booking time'], ['total / currency', 'decimal / char(3)', ''], ['supplier / pnr', 'string', 'airline record locator'], ['hold_expires_at', 'timestamp', 'indexed for the sweeper'], ['ticketing_deadline', 'timestamp', 'airline TTL'], ['idempotency_key', 'string unique', ''], ['version', 'int', 'optimistic locking']],
      why: 'Money and legal documents: needs ACID transitions (status changes with a version check), unique constraints and an audit trail. Volume is small, so a relational DB is ideal.' },
    { name: 'saga_steps', store: 'PostgreSQL / workflow engine', fields: [['booking_id', 'uuid', ''], ['step', 'enum', 'HOLD, AUTH, TICKET, CAPTURE'], ['state', 'enum', 'PENDING, DONE, COMPENSATED, UNKNOWN'], ['external_ref', 'string', 'auth id, ticket no.'], ['attempts', 'int', ''], ['updated_at', 'timestamp', '']],
      why: 'Lets the orchestrator resume after a crash and know exactly which compensations are owed.' },
    { name: 'fare_cache', store: 'Redis Cluster', fields: [['key', 'string', 'JFK:LHR:20261220:20270103:2A:Y'], ['offers', 'compressed blob', 'top N offers'], ['priced_at', 'timestamp', ''], ['TTL', '', '5 min → 24 h depending on departure date']],
      why: 'Read-heavy, disposable, key-value. Staleness is tolerated because the price is re-verified before booking.' },
    { name: 'outbox', store: 'PostgreSQL (same DB as bookings)', fields: [['id', 'bigserial', ''], ['booking_id', 'uuid', ''], ['event', 'string', 'BookingConfirmed…'], ['payload', 'jsonb', ''], ['published', 'bool', '']],
      why: 'Written in the same transaction as the status change, then relayed to Kafka, so emails and analytics never miss or invent a booking.' },
  ],
  architecture: {
    intro: 'Two very different paths share one supplier gateway. The **search path** (top) is cache-first and high volume. The **booking path** (bottom) is low volume and run by a durable **saga orchestrator** with its own relational DB, an outbox for events, and a sweeper that releases expired holds.',
    nodes: [
      { id: 'client', label: 'Web / Mobile', type: 'client', col: 0, row: 1, desc: 'Search form, results page (streams results), checkout with a visible hold countdown.' },
      { id: 'gw', label: 'API Gateway', sub: 'auth, rate limits', type: 'gateway', col: 1, row: 1, desc: 'Authenticates users, rate-limits scrapers (search is expensive for us — every miss costs money), and routes search vs booking traffic to separate fleets.', tech: ['Kong', 'Envoy', 'AWS API Gateway'] },
      { id: 'search', label: 'Search Service', sub: 'merge + rank', type: 'service', col: 2, row: 0, multi: true, desc: 'Normalizes the query, reads the fare cache, fans out live requests on a miss, merges and de-duplicates offers from different sources (same flight via GDS and NDC), ranks them, and streams results back.', tech: ['Go / Java', 'SSE'] },
      { id: 'cache', label: 'Fare Cache', sub: 'route+date → offers', type: 'cache', col: 3, row: 0, desc: 'Recent search results keyed by the normalized query. TTL depends on how far away departure is: minutes for next week, hours for next year.', tech: ['Redis Cluster', 'Aerospike'] },
      { id: 'pre', label: 'Fare Pre-Shopper', sub: 'warms popular routes', type: 'worker', col: 4, row: 0, desc: 'Background jobs that re-shop the most popular origin/destination/date combos during cheap off-peak quota, keeping the cache warm. Also powers "cheapest month" calendars.', tech: ['Airflow', 'Kubernetes CronJobs'] },
      { id: 'sgw', label: 'Supplier Gateway', sub: 'GDS / NDC adapters', type: 'service', col: 4, row: 1, multi: true, desc: 'One adapter per supplier: translates our model to EDIFACT/SOAP/NDC XML, enforces per-supplier quotas and timeouts, has circuit breakers, and records every request/response for disputes.', tech: ['Java', 'Resilience4j', 'NDC 21.3'] },
      { id: 'gds', label: 'GDS', sub: 'Amadeus / Sabre', type: 'external', col: 5, row: 0, desc: 'Global distribution systems aggregating hundreds of airlines: availability, pricing, PNR creation and ticketing. Slow, charged per transaction, but broad coverage.' },
      { id: 'ndc', label: 'Airline NDC APIs', sub: 'direct connect', type: 'external', col: 5, row: 1, desc: 'Direct airline APIs (IATA NDC standard). Richer offers (bundles, seats, bags) and sometimes cheaper fares, but each airline behaves a little differently.' },
      { id: 'book', label: 'Booking Orchestrator', sub: 'saga, durable', type: 'service', col: 2, row: 2, multi: true, desc: 'Runs the booking state machine: hold → authorize → ticket → capture, with a compensation for each step. Durable (state persisted after each step) so a crash resumes exactly where it stopped.', tech: ['Temporal', 'AWS Step Functions', 'Java'] },
      { id: 'bdb', label: 'Booking DB', sub: 'bookings + outbox', type: 'db', col: 3, row: 2, desc: 'Source of truth for our side of every booking, saga progress and the outbox. Strongly consistent, replicated synchronously within the region.', tech: ['PostgreSQL', 'Aurora'] },
      { id: 'pay', label: 'Payment Service', sub: 'auth / capture / void', type: 'service', col: 2, row: 3, desc: 'Wraps the payment processor: authorizes (reserves funds), captures after ticketing, voids or refunds on failure. Every call carries an idempotency key.', tech: ['Stripe', 'Adyen', 'airline BSP/merchant'] },
      { id: 'sweep', label: 'Hold Expiry Sweeper', sub: 'releases holds', type: 'scheduler', col: 3, row: 3, desc: 'Every few seconds finds `HELD` bookings past `hold_expires_at` and asks the orchestrator to cancel them, returning seats to the airline quickly instead of waiting for the airline\'s own time limit.', tech: ['Temporal timers', 'cron + SKIP LOCKED'] },
      { id: 'events', label: 'Booking Events', sub: 'outbox → Kafka', type: 'queue', col: 4, row: 2, desc: 'Confirmed / cancelled / changed events for notifications, analytics, fraud and accounting. Also carries airline schedule-change messages coming back in.', tech: ['Kafka', 'Debezium'] },
      { id: 'notify', label: 'Notifications', sub: 'email, push', type: 'worker', col: 5, row: 3, desc: 'Sends e-ticket receipts, hold-expiry warnings and schedule-change alerts.', tech: ['SES', 'FCM / APNs'] },
    ],
    edges: [
      { from: 'client', to: 'gw' },
      { from: 'gw', to: 'search', label: 'search' },
      { from: 'gw', to: 'book', label: 'hold / pay' },
      { from: 'search', to: 'cache', label: 'get / set' },
      { from: 'search', to: 'sgw', label: 'live shop (miss)' },
      { from: 'pre', to: 'sgw', label: 're-shop', async: true },
      { from: 'pre', to: 'cache', label: 'warm', async: true },
      { from: 'sgw', to: 'gds' },
      { from: 'sgw', to: 'ndc' },
      { from: 'book', to: 'sgw', label: 'price, PNR, ticket' },
      { from: 'book', to: 'bdb', label: 'state + outbox' },
      { from: 'book', to: 'pay', label: 'auth / capture' },
      { from: 'sweep', to: 'bdb', label: 'expired holds' },
      { from: 'sweep', to: 'book', label: 'cancel' },
      { from: 'bdb', to: 'events', label: 'relay', async: true },
      { from: 'events', to: 'notify', async: true },
    ],
  },
  flows: [
    {
      id: 'search-hit', name: 'Search (cache hit)',
      steps: [
        { from: 'client', to: 'gw', text: 'User searches JFK → LHR, Dec 20 – Jan 3, 2 adults, economy.' },
        { from: 'gw', to: 'search', text: 'Gateway checks the per-IP search rate limit and routes to the search fleet.' },
        { at: 'search', text: 'Normalize into key `JFK:LHR:20261220:20270103:2A:Y` (airport groups, sorted params).' },
        { from: 'search', to: 'cache', text: 'Cache lookup → **hit**, priced 6 minutes ago, TTL for a 2-month-out flight is 2 h.' },
        { at: 'search', text: 'Apply filters, rank by a price/duration/quality score, attach "price as of 09:12".' },
        { from: 'search', to: 'client', text: 'Return 200 offers in ≈150 ms. No supplier call, no supplier cost.' },
      ],
    },
    {
      id: 'search-miss', name: 'Search (cache miss → live fan-out)',
      steps: [
        { from: 'client', to: 'gw', text: 'A rare route: Boise → Lisbon next Tuesday.' },
        { from: 'gw', to: 'search', text: 'Routed to the search service.' },
        { from: 'search', to: 'cache', text: 'Cache **miss**.' },
        { from: 'search', to: 'sgw', text: 'Fan out one shopping request per relevant supplier, each with a 3 s budget.' },
        { from: 'sgw', to: 'gds', text: 'GDS low-fare search (covers most interline itineraries).' },
        { from: 'sgw', to: 'ndc', text: 'In parallel, NDC AirShopping to two airlines with direct connections.' },
        { from: 'sgw', to: 'search', text: 'Results arrive at different times; a slow supplier is cut off at the deadline.' },
        { at: 'search', text: 'Merge, de-duplicate the same flight seen via two channels (keep the cheaper), rank.' },
        { from: 'search', to: 'cache', text: 'Store the merged result with a short TTL (next-week departure → 10 min).' },
        { from: 'search', to: 'client', text: 'Stream results as they arrive; first page in ≈1.5 s.' },
      ],
    },
    {
      id: 'hold', name: 'Select, re-price and hold',
      steps: [
        { from: 'client', to: 'gw', text: 'User picks offer `of_77a` and enters passenger details.' },
        { from: 'gw', to: 'book', text: '`POST /bookings` with an Idempotency-Key.' },
        { from: 'book', to: 'sgw', text: 'Re-price this exact itinerary and fare class live — the cached price may be stale.' },
        { at: 'book', text: 'Price rose from $1,224 to $1,251 → return `priceChanged` and require the user to accept before continuing.' },
        { from: 'sgw', to: 'gds', text: 'User accepts → create the **PNR**: airline decrements inventory in that booking class and sets a ticketing time limit.' },
        { from: 'book', to: 'bdb', text: 'Insert booking `HELD`, PNR `X7KQ2M`, `hold_expires_at = now + 15 min` (before the airline deadline).' },
        { from: 'book', to: 'client', text: 'Return the hold; checkout page shows a 15-minute countdown.' },
      ],
    },
    {
      id: 'pay-ticket', name: 'Pay → ticket saga (happy path)',
      steps: [
        { from: 'client', to: 'gw', text: 'User submits card details; client sends `POST /bookings/bk_4410/pay` with an Idempotency-Key.' },
        { from: 'gw', to: 'book', text: 'Orchestrator verifies the hold is still valid and moves status to `TICKETING` (version check).' },
        { from: 'book', to: 'pay', text: 'Step 1: **authorize** $1,251.10 (funds reserved, not captured). 3-D Secure if required.' },
        { from: 'book', to: 'sgw', text: 'Step 2: **issue tickets** for PNR X7KQ2M with the agreed fare.' },
        { from: 'sgw', to: 'gds', text: 'GDS issues e-ticket numbers `125-2345678901/02`.' },
        { from: 'book', to: 'pay', text: 'Step 3: **capture** the authorized amount.' },
        { from: 'book', to: 'bdb', text: 'Status `CONFIRMED` + tickets + outbox event, all in one transaction.' },
        { from: 'bdb', to: 'events', text: 'Outbox relay publishes `BookingConfirmed`.' },
        { from: 'events', to: 'notify', text: 'E-ticket receipt emailed to the passenger.' },
      ],
    },
    {
      id: 'compensate', name: 'Ticketing fails → compensate',
      steps: [
        { from: 'book', to: 'pay', text: 'Card authorized successfully.' },
        { from: 'book', to: 'sgw', text: 'Ticket request sent… and times out after 30 s. Outcome **unknown**.' },
        { at: 'book', text: 'Do not blindly retry or refund. Mark step `UNKNOWN` and **query the PNR** to learn whether tickets exist.' },
        { from: 'sgw', to: 'gds', text: 'PNR shows no tickets and the fare is no longer available → ticketing definitively failed.' },
        { from: 'book', to: 'pay', text: 'Compensate step 1: **void** the authorization — the customer is never charged.' },
        { from: 'book', to: 'sgw', text: 'Compensate the hold: cancel the PNR so seats return to inventory.' },
        { from: 'book', to: 'bdb', text: 'Status `FAILED`, reason recorded; outbox event emitted.' },
        { from: 'events', to: 'notify', text: 'User is told the fare sold out and offered alternatives.' },
      ],
    },
    {
      id: 'expire', name: 'Hold expires unpaid',
      steps: [
        { from: 'sweep', to: 'bdb', text: 'Sweeper selects `HELD` bookings with `hold_expires_at < now` using `FOR UPDATE SKIP LOCKED`.' },
        { from: 'sweep', to: 'book', text: 'Requests cancellation of `bk_5520` (abandoned checkout).' },
        { from: 'book', to: 'sgw', text: 'Cancel the PNR with the airline, releasing the seats for other buyers.' },
        { from: 'book', to: 'bdb', text: 'Conditional update `HELD → EXPIRED` (fails safely if a payment just started).' },
        { from: 'events', to: 'notify', text: 'Optional "your hold expired — prices may have changed" email.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔎 Searching across airlines without going broke',
      md: 'A live search is expensive in three ways: **latency** (GDS low-fare search 1–5 s), **money** (per-transaction fees and look-to-book penalties), and **quota** (suppliers throttle us). With ~1,000 searches per booking, querying suppliers on every search is not viable.\n\n' +
        '**Cache design**\n\n' +
        '- Key on the *normalized* query (sorted, city codes resolved, pax mix) so equivalent searches share an entry.\n' +
        '- **TTL by days-to-departure**: fares for flights a year out change rarely (hours), next-week fares change constantly (minutes).\n' +
        '- Store a few hundred top offers, not every combination.\n' +
        '- **Pre-shop** popular routes in off-peak hours; use cache results for calendars and price alerts.\n' +
        '- **Always re-price on selection.** The cache is a *hint*; the price the user pays comes from a live call. Show the cached price age honestly.',
      options: [
        { name: 'Live fan-out on every search', pros: ['Always fresh'], cons: ['Seconds of latency, huge supplier bills, quota exhaustion', 'One slow supplier slows every search'] },
        { name: 'Cache-only (pre-computed fares)', pros: ['Instant, cheap'], cons: ['Stale prices and phantom availability → many failed bookings and angry users'] },
        { name: 'Cache-first + live on miss + verify on select', pros: ['Fast and cheap for 90%+ of searches', 'Correct where it matters: at checkout'], cons: ['Some users see "price changed" at checkout', 'Cache tuning (TTL, warming) is ongoing work'], chosen: true },
      ],
      verdict: 'Cache aggressively with departure-aware TTLs, warm popular routes, stream live results for misses with per-supplier deadlines, and re-verify the single chosen offer before holding. Track the "price changed at checkout" rate as the cache freshness SLO.',
    },
    {
      title: '⏳ Seat holds with a TTL',
      md: 'Between "I want this flight" and "payment succeeded" the user needs a few minutes. Who reserves the seat during that time?\n\n' +
        'In airline systems, creating a **PNR** with segments in a booking class *sells* that inventory immediately and attaches a **ticketing time limit**; unticketed PNRs are auto-cancelled by the airline when it passes. So the real hold lives at the airline. Our side mirrors it with `hold_expires_at` set **earlier** than the airline\'s limit, and a sweeper cancels promptly so we do not hoard seats (airlines penalize agencies for churning unticketed PNRs).\n\n' +
        'If you own the inventory (designing the airline itself), a hold is an atomic conditional decrement plus a hold row:\n\n' +
        '```\nBEGIN;\nUPDATE fare_inventory\n   SET held = held + 2\n WHERE flight_id = \'BA178-2026-12-20\' AND booking_class = \'M\'\n   AND sold + held + 2 <= authorized;     -- includes overbooking allowance\n-- 0 rows updated → class sold out, offer the next class up\nINSERT INTO holds (hold_id, flight_id, booking_class, seats, expires_at)\nVALUES (..., now() + interval \'15 minutes\');\nCOMMIT;\n```\n' +
        'Specific seat selection (14C) is a separate, finer hold on the seat map, often only allowed after ticketing or for a fee.',
      options: [
        { name: 'No hold — book at payment time', pros: ['No abandoned holds'], cons: ['Seat can sell out while the user types their card → failure after payment intent', 'Price can change mid-checkout'] },
        { name: 'Soft hold in our own Redis (TTL key)', pros: ['Cheap and simple'], cons: ['Does not reserve real airline inventory — other agencies can still sell the seat'] },
        { name: 'Real hold via PNR + our own TTL + sweeper', pros: ['Seat really reserved', 'Our TTL < airline TTL so we control expiry and UX'], cons: ['Supplier calls and penalties for churned PNRs', 'Needs reliable cleanup'], chosen: true },
      ],
      verdict: 'Create the PNR at checkout start (after re-pricing), keep our own shorter TTL, release on expiry with a sweeper or durable timer, and use idempotency keys so retries never create a second PNR.',
    },
    {
      title: '🔁 Booking + payment as a saga',
      md: 'Booking spans systems with no shared transaction: the airline (via GDS/NDC) and the payment processor. Two-phase commit is impossible — neither will join our coordinator. So we model it as a **saga**: a sequence of local steps, each with a compensating action.\n\n' +
        '1. **Create PNR** (hold seats) — compensate by cancelling the PNR.\n2. **Authorize card** — compensate by voiding the authorization.\n3. **Issue ticket** — compensate by voiding the ticket (same day) or refunding.\n4. **Capture payment** — compensate by refunding.\n\n' +
        'Order matters: **authorize before ticketing, capture after**. Authorization reserves funds without moving money, so a failed ticket costs only a void. Issuing a ticket is the "point of no return" — after it, compensation means a void (usually free within 24 h) or a refund.\n\n' +
        '**The unknown-outcome problem.** A timeout does not mean failure. Before retrying a ticketing call, *read* the PNR to see whether tickets were issued. Every external call carries an idempotency key or a natural key (PNR) so a retry is safe. The orchestrator persists each step\'s state, so if it crashes mid-saga, it resumes and finishes or compensates — never leaving money taken without a ticket.',
      options: [
        { name: 'Two-phase commit', pros: ['Atomic in theory'], cons: ['GDS and card networks do not support XA/2PC', 'Blocking coordinator'] },
        { name: 'Choreography (services react to events)', pros: ['Loose coupling'], cons: ['Flow logic scattered across services', 'Hard to see where a stuck booking is'] },
        { name: 'Orchestrated saga on a durable workflow engine', pros: ['One readable state machine', 'Built-in retries, timers and resumption', 'Easy to audit per booking'], cons: ['Orchestrator becomes critical infrastructure'], chosen: true },
      ],
      verdict: 'An orchestrated saga (Temporal / Step Functions or a hand-rolled state machine in Postgres) with idempotent steps, authorize-then-ticket-then-capture ordering, and explicit handling of unknown outcomes by querying before retrying.',
    },
    {
      title: '📈 Overbooking and airline inventory',
      md: 'Airlines expect a share of passengers not to show up (often 5–10% on business-heavy routes). Flying with empty seats that were sold is lost revenue, so **revenue management** sets an **authorized capacity** above physical capacity per flight and cabin, e.g. 180 seats → sell up to 189.\n\n' +
        '- Inventory is split into **booking classes** (Y, B, M, H, Q…) that are *nested*: cheaper classes close first as the flight fills, which is why the same seat costs more next week.\n' +
        '- Overbooking levels come from models of no-show and cancellation rates by route, day, season and booking pattern, balanced against the cost of **denied boarding** (compensation, rebooking, reputation).\n' +
        '- When more passengers show up than seats, airlines first ask for volunteers with incentives, then involuntarily bump per regulations (EU261, US DOT rules).\n\n' +
        'For an OTA this means a ticket is a strong but not absolute promise. The system must ingest **schedule-change and cancellation messages** from airlines (GDS queues), update bookings, and notify and rebook passengers.',
      options: [
        { name: 'No overbooking', pros: ['No denied boardings'], cons: ['Flights leave with 5–10% empty sold seats; higher fares to compensate'] },
        { name: 'Fixed percentage', pros: ['Simple'], cons: ['Wrong for most flights — a holiday leisure flight and a Monday business shuttle behave very differently'] },
        { name: 'Model-based per flight and class', pros: ['Maximizes load factor with controlled bump risk'], cons: ['Needs data science and continuous monitoring'], chosen: true },
      ],
      verdict: 'On the airline side, model-driven authorized capacity with nested booking classes. On the OTA side, treat airline changes as events: consume them, reconcile the booking, and proactively notify and rebook.',
    },
    {
      title: '🔄 Staying in sync with the airline',
      md: 'The airline\'s PNR is the real source of truth; our Booking DB is a mirror that can drift: schedule changes, airline-initiated cancellations, passengers changing flights at the airport, or a ticket issued after our call timed out.\n\n' +
        '- **Consume GDS queue messages / NDC notifications** and turn them into events on our bus.\n' +
        '- **Reconcile nightly**: compare our CONFIRMED bookings with supplier PNRs and the ticket sales reports (BSP/ARC), and with captured payments. Every mismatch is a ticket for operations.\n' +
        '- Keep every raw supplier request/response — when a customer disputes a charge, that log is the evidence.',
    },
  ],
  scaling: [
    { stage: '🌱 Single-supplier startup', md: 'One GDS connection, a monolith with Postgres, synchronous booking in one request, no cache. Works for hundreds of bookings a day.' },
    { stage: '🌿 Growing OTA', md: 'Add the fare cache and split search from booking. Move booking to a saga with persisted state and idempotency keys after the first "charged but no ticket" incident.' },
    { stage: '🌳 Many suppliers', md: 'Supplier gateway with per-supplier adapters, quotas and circuit breakers; NDC direct connects; pre-shopping jobs; Kafka outbox for downstream consumers; nightly reconciliation.' },
    { stage: '🌍 Global', md: 'Search fleets and caches per region near users; booking DB primary in one region per market with cross-region replicas for DR; multi-currency pricing and local payment methods.' },
  ],
  tradeoffs: [
    { decision: 'Search data', chosen: 'Cache-first with re-pricing', alternative: 'Live search every time', why: 'Supplier calls are slow and paid; correctness is enforced at checkout instead.' },
    { decision: 'Cross-system booking', chosen: 'Orchestrated saga', alternative: '2PC / single transaction', why: 'External systems cannot join a distributed transaction; sagas with compensation are the only option.' },
    { decision: 'Payment ordering', chosen: 'Authorize → ticket → capture', alternative: 'Charge first, then ticket', why: 'A failed ticket costs a void instead of a refund (no money moved, no fees, no angry customer).' },
    { decision: 'Booking store', chosen: 'Relational (Postgres)', alternative: 'NoSQL', why: 'Low volume, needs transactions, constraints and auditing far more than scale.' },
    { decision: 'Hold location', chosen: 'Real PNR with our own shorter TTL', alternative: 'Local soft hold only', why: 'Only the airline can actually reserve the seat; our TTL keeps expiry under our control.' },
  ],
  failures: [
    { node: 'gds', scenario: 'GDS slow or down', impact: 'Live searches time out; PNR creation and ticketing fail for airlines only reachable through it.', mitigation: 'Per-supplier circuit breaker; serve cached results flagged as unverified; route bookings through NDC where available; queue ticketing retries within the ticketing deadline.' },
    { node: 'book', scenario: 'Orchestrator crashes mid-saga (after authorization, before ticketing)', impact: 'Customer funds are reserved but no ticket exists.', mitigation: 'Durable workflow state: on restart the saga resumes at the next step or compensates. Alert on bookings stuck in TICKETING for > 5 min.' },
    { node: 'pay', scenario: 'Payment provider times out on capture', impact: 'Unknown whether money was taken.', mitigation: 'Idempotency key on every call; query the payment status before retrying; never mark CONFIRMED or refund on a guess.' },
    { node: 'cache', scenario: 'Fare cache cluster lost', impact: 'All searches become live → supplier calls 10× → quotas exhausted, latency spikes.', mitigation: 'Replicated cache; admission control on live shopping (shed the least valuable searches, e.g. bots); rebuild from pre-shopper.' },
    { node: 'sweep', scenario: 'Sweeper stops running', impact: 'Expired holds are not released; seats stay locked until the airline\'s own time limit.', mitigation: 'Airline TTL is the backstop; run the sweeper redundantly with SKIP LOCKED; alert on oldest overdue hold.' },
    { node: 'sgw', scenario: 'Supplier quota exhausted by scrapers', impact: 'Real customers cannot search or book.', mitigation: 'Rate limit at gateway, bot detection, reserve a separate quota pool for booking-path calls.' },
  ],
  interviewTips: [
    'Say early that you do not own inventory: the GDS/airline is the source of truth, slow and paid. Most design choices follow from that.',
    'Quantify look-to-book — it justifies the cache and the separation of search and booking.',
    'Draw the saga with compensations and explain authorize-then-capture ordering.',
    'Discuss the unknown outcome of a timed-out external call — query before retry, idempotency keys everywhere.',
    'Bring up overbooking only after the core design; it shows domain depth.',
  ],
  realWorld: [
    '**Amadeus** and **Sabre** process billions of travel transactions a year and are the backbone most agencies connect to.',
    '**ITA Software** (now Google Flights) became famous because fare search is a hard combinatorial problem: fares, rules and routings explode into billions of candidate itineraries.',
    '**Skyscanner** and **Kayak** are metasearch: they mostly cache and redirect, so their entire system is the search half of this design.',
    '**IATA NDC** lets airlines sell directly with richer offers; many airlines add surcharges on GDS bookings to push agencies toward NDC.',
    'Several carriers have publicly limited or stopped overbooking (e.g. **Southwest** in 2017) after high-profile denied-boarding incidents.',
  ],
  concepts: ['saga-pattern', 'idempotency', 'caching-strategies', 'distributed-caching', 'circuit-breaker', 'acid-transactions', 'message-queues', 'change-data-capture', 'rate-limiting'],
  quiz: [
    { q: 'Why does the booking flow authorize the card before ticketing and capture only afterwards?', options: ['Capture is faster', 'If ticketing fails, voiding an authorization moves no money, unlike a refund', 'Card networks require it for flights', 'To avoid 3-D Secure'], answer: 1, explain: 'Authorization only reserves funds. A void after failed ticketing is free and invisible to the customer, whereas a refund takes days and costs fees.' },
    { q: 'The ticketing call to the GDS times out. What should the orchestrator do next?', options: ['Retry ticketing immediately', 'Void the payment immediately', 'Query the PNR to learn whether tickets were issued, then continue or compensate', 'Mark the booking confirmed'], answer: 2, explain: 'A timeout is an unknown outcome. Retrying could double-issue; compensating could cancel a valid ticket. Read the state first.' },
    { q: 'The look-to-book ratio is 1000:1 and live supplier calls are paid. Which change most reduces supplier cost?', options: ['Faster booking DB', 'Raising fare cache hit rate from 80% to 95%', 'More booking orchestrator instances', 'Shorter hold TTL'], answer: 1, explain: 'Supplier calls ≈ searches × miss rate × fan-out; going from 20% to 5% misses cuts them by 4×.' },
    { q: 'Why is our hold TTL set shorter than the airline\'s ticketing time limit?', options: ['To annoy users into paying faster', 'So we, not the airline, decide when the hold ends and can cleanly cancel before the airline acts', 'Airlines require exactly 15 minutes', 'Redis cannot store long TTLs'], answer: 1, explain: 'If the airline auto-cancels first, a payment in progress could succeed for a booking that no longer exists. Expiring earlier keeps state transitions under our control.' },
    { q: 'Why are flights overbooked even though it risks denied boarding?', options: ['Software bugs', 'Expected no-shows would otherwise fly as empty seats that were already paid for or could have been sold', 'GDS rules require it', 'To increase cache hit rates'], answer: 1, explain: 'Revenue management sells slightly above capacity because a predictable share of passengers do not show up.' },
  ],
  references: [
    { title: 'IATA — New Distribution Capability (NDC)', url: 'https://www.iata.org/en/programs/airline-distribution/retailing/ndc/' },
    { title: 'Temporal — Saga pattern made easy', url: 'https://temporal.io/blog/saga-pattern-made-easy' },
    { title: 'Microsoft — Saga distributed transactions pattern', url: 'https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga' },
  ],
});
