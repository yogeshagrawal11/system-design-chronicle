SD.design({
  id: 'bookmyshow',
  title: 'Ticket Booking System',
  company: 'BookMyShow / Ticketmaster',
  difficulty: 'hard',
  order: 8,
  icon: '🎟️',
  tagline: 'Sell each seat exactly once — even when ten million fans click “Book” in the same minute.',
  summary:
    "A ticket booking system lets users browse movies, concerts and matches, pick specific seats on a seat map, hold them for a few minutes while they pay, and receive a ticket. " +
    "The data is small (a cinema hall has ~300 seats) but the **contention is extreme**: for a hit concert, millions of people want the same few thousand seats at the same second. " +
    "The core problems are (1) **never double-selling a seat** under concurrency, (2) **temporary holds with a TTL** so abandoned checkouts release seats, (3) a **virtual waiting room** that turns a stampede into an orderly, fair line, and (4) a payment flow that stays correct when the payment gateway is slow, retries, or answers after the hold expired.",
  analogy:
    "A theatre box office with one clipboard per show. When you point at seats, the clerk pencils your name in and starts a 10-minute egg timer. If you pay before it rings, the pencil becomes ink; if not, the eraser comes out. " +
    "On the day a superstar's tickets go on sale, a doorman outside hands out numbered wristbands and lets people in a few at a time — the clerk is never mobbed.",
  numbers: [
    { value: '~300', label: 'seats per screen' },
    { value: '10 min', label: 'typical seat hold' },
    { value: '10M+', label: 'fans queued for a mega-concert' },
    { value: '0', label: 'acceptable double bookings' },
  ],
  requirements: {
    functional: [
      "Browse movies/events by city, see theatres and showtimes.",
      "View a **live seat map** for a show with available / held / booked seats.",
      "Select seats and **hold** them for a limited time (e.g. 10 min) while paying.",
      "Pay and receive a confirmed booking + e-ticket (QR code) by email/SMS/app.",
      "Cancel / refund according to policy; abandoned holds release automatically.",
      "For hot launches: a **fair virtual waiting room** before users can reach seat selection.",
    ],
    nonFunctional: [
      "**Correctness above all**: a seat is sold at most once; a successful payment always yields a ticket or an automatic refund.",
      "Survive **100×** normal traffic spikes at on-sale time without falling over.",
      "Seat selection and hold in < 500 ms p99 under contention.",
      "Fairness at on-sale: first-come-first-served (or a transparent lottery), and resistance to bots.",
      "Browsing can be eventually consistent (a seat map a second stale is fine); booking cannot.",
    ],
    outOfScope: ["Dynamic pricing algorithms", "Theatre-side POS integration details", "Recommendation engine"],
  },
  estimation: {
    inputs: [
      { id: 'bookings', label: 'Bookings per day (normal)', value: 1e6, min: 1e4, max: 2e7, step: 1e4 },
      { id: 'views', label: 'Seat-map views per booking', value: 20, min: 2, max: 100, step: 1 },
      { id: 'tpb', label: 'Tickets per booking', value: 2.5, min: 1, max: 6, step: 0.5 },
      { id: 'hotUsers', label: 'Users joining a hot on-sale', value: 5e6, min: 1e4, max: 2e7, step: 1e4 },
      { id: 'hotTickets', label: 'Tickets available in that sale', value: 100000, min: 1000, max: 1e6, step: 1000 },
      { id: 'admit', label: 'Waiting-room admission rate', value: 1000, min: 50, max: 20000, step: 50, unit: 'users/s' },
    ],
    outputs: [
      { label: 'Booking QPS (avg)', f: (v) => v.bookings / 86400 },
      { label: 'Booking QPS (Friday-evening peak ×10)', f: (v) => (v.bookings / 86400) * 10 },
      { label: 'Seat-map read QPS (peak)', f: (v) => ((v.bookings * v.views) / 86400) * 10, note: 'served from cache, not the booking DB' },
      { label: 'Ticket records per year', unit: 'bytes', f: (v) => v.bookings * 365 * v.tpb * 500, note: '~500 B per ticket row' },
      { label: 'Hot sale: max successful buyers', f: (v) => Math.floor(v.hotTickets / v.tpb) },
      { label: 'Hot sale: chance a queued user gets tickets', f: (v) => Math.min(100, ((v.hotTickets / v.tpb) / v.hotUsers) * 100).toFixed(2) + ' %' },
      { label: 'Hot sale: sold out after', f: (v) => (((v.hotTickets / v.tpb) / v.admit) / 60).toFixed(1) + ' min', note: 'if every admitted user buys' },
      { label: 'Hot sale: time to admit the whole queue', f: (v) => ((v.hotUsers / v.admit) / 60).toFixed(0) + ' min', note: 'tell late joiners early that it will sell out' },
    ],
    notes:
      "Normal-day load is tiny for modern databases. The design is driven by the **hot on-sale**: millions of users for a few tens of thousands of bookings. " +
      "The admission rate is chosen from what the *booking path* can sustain (holds + payments per second), not from how many users are waiting.",
  },
  api: [
    { method: 'GET', path: '/v1/shows?city=BLR&movieId=m42&date=2026-10-17', desc: 'List theatres and showtimes', res: '[{ "showId": "s9001", "theatre": "PVR Forum", "start": "19:30", "minPrice": 250 }]', notes: "Read-heavy, cacheable for minutes at the CDN." },
    { method: 'GET', path: '/v1/shows/{showId}/seats', desc: 'Seat availability for the seat map',
      res: '{ "layoutVersion": 7, "available": "<bitmap>", "held": "<bitmap>", "prices": {"GOLD": 350, "SILVER": 250} }',
      notes: "The static layout (rows, aisles, seat labels) comes from the CDN; only the availability bitmap is dynamic. May be ~1 s stale." },
    { method: 'POST', path: '/v1/holds', desc: 'Atomically hold a set of seats',
      req: '{ "showId": "s9001", "seats": ["H7", "H8"] }',
      res: '201 { "holdId": "h_8c1", "expiresAt": "2026-10-17T19:02:00Z", "amount": 700 }\n409 { "unavailable": ["H8"] }',
      notes: "All-or-nothing: either every requested seat is held or none. Requires a valid waiting-room token for hot shows." },
    { method: 'POST', path: '/v1/bookings', desc: 'Start payment for a hold',
      req: 'Idempotency-Key: 2f6e...\n{ "holdId": "h_8c1", "paymentMethod": "upi" }',
      res: '202 { "bookingId": "b_77", "status": "PAYMENT_PENDING", "redirectUrl": "https://psp/..." }',
      notes: "Idempotency key ensures a double-click or retry never creates two payment intents." },
    { method: 'POST', path: '/v1/payments/webhook', desc: 'Payment gateway callback (signed)', req: '{ "paymentIntent": "pi_3", "bookingId": "b_77", "status": "succeeded" }', notes: "May arrive late, twice, or out of order — handler must be idempotent." },
    { method: 'GET', path: '/v1/queue/{eventId}/status', desc: 'Waiting-room position', res: '{ "position": 482113, "etaSec": 480, "admitted": false }', notes: "Served from the waiting room's own cheap infrastructure (often a static page + edge function), never from the booking backend." },
  ],
  dataModel: [
    { name: 'show_seats', store: 'Postgres (sharded by show_id)', fields: [['show_id', 'bigint', 'shard + partition key'], ['seat_id', 'varchar', 'e.g. H7'], ['status', 'enum', 'AVAILABLE | HELD | BOOKED'], ['hold_id', 'uuid?', 'who holds it'], ['hold_expires_at', 'timestamp?', ''], ['booking_id', 'uuid?', ''], ['version', 'int', 'optional, for optimistic CAS']],
      why: "One row per seat per show is the inventory. All seats of a show sit on one shard, so a multi-seat hold is a single local transaction. PK (show_id, seat_id) makes double-insert impossible." },
    { name: 'bookings', store: 'Postgres', fields: [['booking_id', 'uuid PK', ''], ['user_id', 'bigint', ''], ['show_id', 'bigint', ''], ['seats', 'text[]', ''], ['amount', 'decimal', ''], ['status', 'enum', 'PAYMENT_PENDING | CONFIRMED | FAILED | REFUNDED'], ['payment_intent', 'string', 'unique'], ['idempotency_key', 'string', 'unique per user']],
      why: "A small state machine per order. Unique constraints on the payment intent and idempotency key make retries and duplicate webhooks harmless." },
    { name: 'catalog (movies, theatres, screens, shows)', store: 'Postgres + Elasticsearch', fields: [['show_id', 'bigint', ''], ['screen_id', 'bigint', 'links to seat layout'], ['movie_id', 'bigint', ''], ['start_time', 'timestamp', ''], ['price_map', 'json', 'per seat category']],
      why: "Read-mostly reference data. Indexed into search by city/date/genre; seat layouts are versioned JSON files on the CDN." },
    { name: 'seat availability', store: 'Redis', fields: [['avail:{show_id}', 'bitmap', '1 bit per seat'], ['hold:{show_id}:{seat}', 'string + TTL', 'only in the Redis-fronted hot-sale mode']],
      why: "Seat-map reads outnumber holds 20:1; a 300-bit bitmap answers them in microseconds without touching Postgres." },
  ],
  architecture: {
    intro: "Browsing is cheap and cached; the **booking path** (hold → pay → confirm) is strongly consistent and protected by a waiting room that meters how many users can reach it.",
    nodes: [
      { id: 'client', label: 'User App / Web', type: 'client', col: 0, row: 2, desc: "Browses shows, renders the seat map, holds seats and pays. In a hot sale it first lands in the waiting room." },
      { id: 'cdn', label: 'CDN', sub: 'pages + seat layouts', type: 'cdn', col: 1, row: 0, desc: "Serves static assets, show listings and versioned seat-layout JSON. Absorbs the bulk of browsing traffic.", tech: ['CloudFront', 'Akamai'] },
      { id: 'wr', label: 'Waiting Room', sub: 'virtual queue', type: 'gateway', col: 1, row: 2, desc: "For flagged hot events, every user is placed in a FIFO queue and admitted at a controlled rate with a **signed, short-lived admission token**. For normal shows it is a pass-through.", tech: ['Queue-it', 'Cloudflare Waiting Room', 'custom edge + Redis'] },
      { id: 'gw', label: 'API Gateway', sub: 'token check, rate limit', type: 'gateway', col: 2, row: 2, desc: "Authenticates users, verifies the waiting-room token on booking endpoints, enforces per-user and per-IP rate limits, and runs bot detection.", tech: ['Kong', 'Envoy', 'WAF'] },
      { id: 'catalog', label: 'Catalog Service', sub: 'movies, shows', type: 'service', col: 3, row: 0, multi: true, desc: "Search and listing of movies, theatres and showtimes. Read-only from the user's point of view; heavily cached." },
      { id: 'catdb', label: 'Catalog Store', sub: 'SQL + search index', type: 'search', col: 4, row: 0, desc: "Source of truth for reference data plus an Elasticsearch index for city/date/genre queries.", tech: ['Postgres', 'Elasticsearch'] },
      { id: 'booking', label: 'Booking Service', sub: 'holds + orders', type: 'service', col: 3, row: 2, multi: true, desc: "Owns seat inventory. Serves availability, performs atomic multi-seat holds, creates orders, and confirms them after payment. The only component allowed to change seat status." },
      { id: 'redis', label: 'Seat Cache', sub: 'bitmaps + holds', type: 'cache', col: 4, row: 1, desc: "Per-show availability bitmaps for the seat map. In hot-sale mode, also the fast front line for holds via an atomic Lua script, with Postgres as the durable record.", tech: ['Redis Cluster'] },
      { id: 'db', label: 'Booking DB', sub: 'sharded by show', type: 'db', col: 5, row: 2, desc: "Seat inventory and orders. A conditional UPDATE on (show_id, seat_id) rows is the final arbiter of who gets a seat. Synchronous replica in another AZ.", tech: ['Postgres', 'Aurora', 'MySQL'] },
      { id: 'sweeper', label: 'Hold Sweeper', sub: 'expire + reconcile', type: 'scheduler', col: 5, row: 1, desc: "Every few seconds releases expired holds, updates the bitmaps, and reconciles orders stuck in PAYMENT_PENDING with the payment provider." },
      { id: 'pay', label: 'Payment Service', sub: 'intents + webhooks', type: 'service', col: 3, row: 3, desc: "Creates payment intents with idempotency keys, handles signed webhooks, and issues refunds. Isolates the booking path from PSP quirks." },
      { id: 'psp', label: 'Payment Gateway', sub: 'UPI / cards / wallets', type: 'external', col: 3, row: 4, desc: "Third-party provider. Slow (seconds), occasionally times out, and may confirm a payment minutes later via webhook.", tech: ['Razorpay', 'Stripe', 'Adyen'] },
      { id: 'q', label: 'Booking Events', type: 'queue', col: 4, row: 3, desc: "BookingConfirmed / Cancelled / Refunded events for downstream consumers.", tech: ['Kafka', 'SQS'] },
      { id: 'notif', label: 'Ticketing & Notify', sub: 'QR, email, SMS', type: 'worker', col: 5, row: 3, desc: "Generates the QR e-ticket, sends confirmation, pushes the booking to the theatre's system." },
    ],
    edges: [
      { from: 'client', to: 'cdn', label: 'static + layout' },
      { from: 'client', to: 'wr', label: 'API calls' },
      { from: 'wr', to: 'gw', label: 'admitted + token' },
      { from: 'gw', to: 'catalog', label: 'browse' },
      { from: 'gw', to: 'booking', label: 'seats / hold / book' },
      { from: 'catalog', to: 'catdb' },
      { from: 'booking', to: 'redis', label: 'bitmap / hold' },
      { from: 'booking', to: 'db', label: 'conditional UPDATE' },
      { from: 'sweeper', to: 'db', label: 'release expired' },
      { from: 'sweeper', to: 'redis', label: 'update bitmap' },
      { from: 'booking', to: 'pay', label: 'create intent' },
      { from: 'pay', to: 'psp', label: 'charge', both: true },
      { from: 'booking', to: 'q', label: 'confirmed', async: true },
      { from: 'q', to: 'notif', async: true },
    ],
  },
  flows: [
    {
      id: 'seatmap', name: 'Open the seat map (read path)',
      steps: [
        { from: 'client', to: 'cdn', text: "App fetches the screen's static seat layout `layout/screen-12/v7.json` from the CDN (rows, aisles, categories)." },
        { from: 'client', to: 'wr', text: "Request for live availability. This show is not flagged hot, so the waiting room passes it straight through." },
        { from: 'wr', to: 'gw', text: "Gateway authenticates and rate-limits." },
        { from: 'gw', to: 'booking', text: "Booking Service handles `GET /shows/s9001/seats`." },
        { from: 'booking', to: 'redis', text: "Read the 300-bit availability bitmap for the show — microseconds, no database hit." },
        { from: 'booking', to: 'client', text: "Return the bitmap; the app paints free seats green over the cached layout. A second of staleness is acceptable — the hold step is the real check." },
      ],
    },
    {
      id: 'hold', name: 'Hold two seats (write path, contention-safe)',
      steps: [
        { from: 'client', to: 'wr', text: "User taps H7 + H8 and presses Continue: `POST /holds`." },
        { from: 'wr', to: 'gw', text: "Gateway verifies the user and the admission token (if the show is hot)." },
        { from: 'gw', to: 'booking', text: "Booking Service generates `holdId` and an expiry of now + 10 min." },
        { from: 'booking', to: 'db', text: "One statement: `UPDATE show_seats SET status='HELD', hold_id=…, hold_expires_at=… WHERE show_id=s9001 AND seat_id IN ('H7','H8') AND (status='AVAILABLE' OR (status='HELD' AND hold_expires_at < now()))`." },
        { at: 'db', text: "Row locks serialise competing updates on the same seats. Rows affected = 2 → success. If it were 1, the transaction rolls back and the user gets `409` with the taken seat." },
        { from: 'booking', to: 'redis', text: "Flip the two bits in the availability bitmap so other users' seat maps show them as taken." },
        { from: 'booking', to: 'client', text: "Return `holdId` + `expiresAt`; the app starts a visible 10-minute countdown." },
      ],
    },
    {
      id: 'pay', name: 'Pay and confirm the booking',
      steps: [
        { from: 'client', to: 'wr', text: "`POST /bookings {holdId}` with an `Idempotency-Key`." },
        { from: 'wr', to: 'gw', text: "Forwarded to the API gateway." },
        { from: 'gw', to: 'booking', text: "Booking Service inserts an order `PAYMENT_PENDING` (unique on idempotency key) and extends the hold so it outlives the payment timeout." },
        { from: 'booking', to: 'pay', text: "Create a payment intent for ₹700 tagged with the booking id." },
        { from: 'pay', to: 'psp', text: "User completes UPI/card authentication on the provider's page." },
        { from: 'psp', to: 'pay', text: "Signed webhook: `succeeded`. A duplicate webhook later is ignored thanks to the unique `payment_intent`." },
        { from: 'pay', to: 'booking', text: "Payment Service tells Booking Service to confirm." },
        { from: 'booking', to: 'db', text: "`UPDATE show_seats SET status='BOOKED' WHERE hold_id=h_8c1 AND status='HELD'` + order → CONFIRMED in one transaction." },
        { from: 'booking', to: 'q', text: "Emit `BookingConfirmed`." },
        { from: 'q', to: 'notif', text: "Worker generates the QR ticket and sends email/SMS/push." },
      ],
    },
    {
      id: 'onsale', name: 'Hot on-sale through the waiting room',
      steps: [
        { from: 'client', to: 'wr', text: "At 12:00:00, 5M users hit the event page. All are routed to the waiting room, not the backend." },
        { at: 'wr', text: "Users who arrived before 12:00 are randomised (fair start); later arrivals are appended FIFO. Each gets a position and ETA, polled from a cheap edge endpoint." },
        { at: 'wr', text: "A controller admits N users/sec — N is tuned to what holds + payments can sustain, adjusted live from backend latency." },
        { from: 'wr', to: 'gw', text: "An admitted user receives a signed token (event, user, expiry ~15 min) and is redirected into the booking flow." },
        { at: 'gw', text: "Gateway rejects booking calls without a valid token — bots cannot skip the line by calling the API directly." },
        { from: 'gw', to: 'booking', text: "Admitted users hold seats. In hot mode the Booking Service first claims seats in Redis with an atomic Lua script, then persists to Postgres." },
        { from: 'booking', to: 'redis', text: "When inventory reaches zero, the waiting room is told to stop admitting and to show “sold out” to everyone still queued." },
      ],
    },
    {
      id: 'expire', name: 'Abandoned hold expires (background)',
      steps: [
        { at: 'sweeper', text: "Every 5 s: find seats with `status='HELD' AND hold_expires_at < now()` whose order is not paid." },
        { from: 'sweeper', to: 'db', text: "Set them back to AVAILABLE (guarded by the same hold_id so a concurrent confirm wins)." },
        { from: 'sweeper', to: 'redis', text: "Flip the bits back so the seats reappear on seat maps." },
        { at: 'sweeper', text: "For orders stuck in PAYMENT_PENDING, ask the provider for the real status before releasing — never release a seat that was actually paid for." },
        { from: 'booking', to: 'pay', text: "If a payment succeeds *after* its seats were legitimately released and resold, the booking is marked FAILED and an automatic refund is issued." },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔒 Never double-sell: pessimistic vs optimistic vs Redis locks',
      md:
        "Two users press Book on seat H8 within the same millisecond. Exactly one must win, and holds must be **all-or-nothing** across several seats. The options:\n\n" +
        "```\n-- Pessimistic\nBEGIN; SELECT * FROM show_seats WHERE show_id=? AND seat_id IN (...) FOR UPDATE;\n-- check all AVAILABLE, then UPDATE; COMMIT;\n\n-- Optimistic / conditional (compare-and-set in one statement)\nUPDATE show_seats SET status='HELD', hold_id=?, hold_expires_at=?\n WHERE show_id=? AND seat_id IN (...) AND status='AVAILABLE';\n-- rows_affected == n ? COMMIT : ROLLBACK\n```\n\n" +
        "Lock seats in a **consistent order** (sort seat ids) so two multi-seat holds cannot deadlock.",
      options: [
        { name: 'Pessimistic (SELECT … FOR UPDATE)', pros: ['Easy to reason about', 'Strong guarantee from the DB'], cons: ['Locks held across a round-trip; under a stampede, connections pile up waiting', 'Deadlock risk without ordered locking'] },
        { name: 'Conditional UPDATE / version CAS', pros: ['Single statement — locks held for microseconds', 'Loser learns immediately (rows affected) and retries other seats', 'The DB stays the single source of truth'], cons: ['Throughput bounded by one shard per show (~a few thousand holds/s — plenty for one venue)'], chosen: true },
        { name: 'Redis distributed lock per seat', desc: 'SET hold:{show}:{seat} {holdId} NX PX 600000', pros: ['Very fast, offloads the DB in a stampede', 'TTL gives hold expiry for free'], cons: ['Lock ≠ truth: a failover can lose a key and two users hold the same seat', 'Multi-seat atomicity needs a Lua script', 'Must still be reconciled with the durable DB'] },
      ],
      verdict: "Make the database's conditional UPDATE the arbiter — it is fast, atomic across all seats in the hold, and durable. For mega on-sales, put an atomic Redis Lua script *in front* as an admission filter (most losers are rejected without touching Postgres), but the seat is only yours once the Postgres row says so.",
      diagram: {
        intro: 'Seat lifecycle and the race on seat H8.',
        nodes: [
          { id: 'u1', label: 'User A', type: 'client', col: 0, row: 0, desc: 'Requests H7 + H8.' },
          { id: 'u2', label: 'User B', type: 'client', col: 0, row: 2, desc: 'Requests H8 + H9 at the same moment.' },
          { id: 'svc', label: 'Booking Service', type: 'service', col: 1, row: 1, desc: 'Issues a conditional UPDATE per hold request.' },
          { id: 'avail', label: 'AVAILABLE', sub: 'seat state', type: 'db', col: 2, row: 1, desc: 'Free seat. Only transition out is a successful conditional UPDATE.' },
          { id: 'held', label: 'HELD', sub: 'hold_id + expiry', type: 'cache', col: 3, row: 0, desc: 'Belongs to one hold until it expires or is confirmed.' },
          { id: 'booked', label: 'BOOKED', sub: 'terminal', type: 'db', col: 4, row: 1, desc: 'Paid. Only a cancellation/refund flow can move it back.' },
          { id: 'sweep', label: 'Expiry', sub: 'sweeper', type: 'scheduler', col: 3, row: 2, desc: 'Moves expired HELD seats back to AVAILABLE.' },
        ],
        edges: [
          { from: 'u1', to: 'svc' }, { from: 'u2', to: 'svc' },
          { from: 'svc', to: 'avail', label: 'UPDATE … WHERE AVAILABLE' },
          { from: 'avail', to: 'held', label: 'hold' },
          { from: 'held', to: 'booked', label: 'payment ok' },
          { from: 'held', to: 'sweep', label: 'TTL passed' },
          { from: 'sweep', to: 'avail', label: 'release' },
        ],
        flows: [
          { id: 'race', name: 'Two users race for H8', steps: [
            { from: 'u1', to: 'svc', text: 'A asks for H7+H8.' },
            { from: 'u2', to: 'svc', text: 'B asks for H8+H9 one millisecond later.' },
            { from: 'svc', to: 'avail', text: "Both UPDATEs reach Postgres. A's statement locks H7, H8 first (sorted order); B's waits on H8." },
            { from: 'avail', to: 'held', text: "A's UPDATE matches 2 rows → commit. H7, H8 are HELD by A." },
            { at: 'avail', text: "B's UPDATE now re-checks H8: status is HELD, not AVAILABLE → only 1 row (H9) matches → B rolls back and gets 409 “H8 taken”." },
            { from: 'held', to: 'booked', text: 'A pays within 10 minutes → BOOKED.' },
          ] },
          { id: 'abandon', name: 'Hold abandoned', steps: [
            { from: 'avail', to: 'held', text: 'User holds seats then closes the app.' },
            { from: 'held', to: 'sweep', text: '10 minutes pass with no payment.' },
            { from: 'sweep', to: 'avail', text: 'Sweeper releases the seats; they reappear on seat maps.' },
          ] },
        ],
      },
    },
    {
      title: '⏳ Holds with a TTL — and the payment race',
      md:
        "A hold must expire if the user walks away, but payments are slow and asynchronous. The nasty case: the user pays at minute 9:58, the provider confirms at minute 11, and the sweeper already released the seat at minute 10 — and someone else held it.\n\n" +
        "Defences, in order:\n\n" +
        "1. **Extend the hold when payment starts** to `max(remaining, PSP timeout + margin)`, e.g. 15 min. Most PSP sessions time out in under 10 min.\n" +
        "2. **Sweeper checks payment status** before releasing seats of an order in PAYMENT_PENDING.\n" +
        "3. **Confirm with a guard**: `UPDATE … SET BOOKED WHERE hold_id = ? AND status = 'HELD'`. If 0 rows match, the seat was lost → mark order FAILED and auto-refund. Users get money back, never a fake ticket.\n" +
        "4. **Idempotent webhooks**: the provider may call twice; unique `payment_intent` makes the second a no-op.",
      options: [
        { name: 'Lazy expiry (check expires_at on read/claim)', pros: ['No background job needed for correctness', 'Exactly-on-time release'], cons: ['Seat maps show stale “held” seats until someone tries them'] },
        { name: 'Active sweeper job', pros: ['Seat maps refresh promptly', 'Natural place to reconcile pending payments'], cons: ['Must be idempotent and guarded against racing with confirm'] },
        { name: 'Both', pros: ['Correctness from the conditional predicate, freshness from the sweeper'], cons: ['Two code paths to keep consistent'], chosen: true },
      ],
      verdict: "Encode expiry in the claim predicate (`OR hold_expires_at < now()`) so correctness never depends on the sweeper running on time, and run the sweeper for freshness and payment reconciliation. This is a small saga: hold → pay → confirm, with refund as the compensating action.",
    },
    {
      title: '🚦 Surviving the on-sale stampede: the virtual waiting room',
      md:
        "For a mega-concert, demand can be 100–1000× supply. If everyone hits the booking API at once, databases saturate, latencies explode, holds time out, and *nobody* buys — the classic on-sale meltdown. The answer is to **meter admission** to the expensive part of the system.",
      options: [
        { name: 'Just autoscale', pros: ['No user-visible queue'], cons: ['Inventory for one show lives on one shard — that hot spot cannot scale out', 'Scaling takes minutes; the spike takes seconds'] },
        { name: 'Rate limit with 429s', pros: ['Protects the backend'], cons: ['Unfair: rewards whoever retries fastest (bots)', 'Retry storms amplify load'] },
        { name: 'Virtual waiting room (FIFO + tokens)', pros: ['Backend sees a smooth, chosen rate', 'Fair and transparent (position + ETA)', 'Signed tokens stop bots skipping the queue', 'Queue pages are static and cheap to serve at the edge'], cons: ['Extra infrastructure', 'Users wait even when it may sell out — must communicate early'], chosen: true },
        { name: 'Pre-registration lottery', desc: 'e.g. Ticketmaster Verified Fan', pros: ['Defeats bots well; demand known in advance'], cons: ['Slower, less spontaneous; not suitable for everyday movie bookings'] },
      ],
      verdict: "Waiting room for flagged events, pass-through otherwise. Randomise the order of people who arrived before the sale opened (so refreshing early does not matter), then FIFO. Admission rate is a feedback loop on booking-path latency, and the room stops admitting once inventory hits zero.",
    },
    {
      title: '🗺️ Live seat maps without hammering the database',
      md:
        "Each booking involves ~20 seat-map views, and during a hot sale every admitted user stares at the same map. Keep the expensive truth (Postgres rows) away from these reads:\n\n" +
        "- **Static layout** (seat coordinates, labels, categories) is versioned JSON on the CDN — it changes only when a theatre is refurbished.\n" +
        "- **Availability** is a per-show bitmap in Redis (300 seats = 38 bytes), updated by the Booking Service on every hold/confirm/release.\n" +
        "- Clients refresh every few seconds, or receive updates over SSE/WebSocket for hot shows.\n\n" +
        "A stale map is harmless: the user may tap a seat that was just taken and get a fast 409 with a refreshed map.",
      options: [
        { name: 'Query Postgres per view', pros: ['Always exact'], cons: ['20× more load on the hottest shard at the worst moment'] },
        { name: 'Redis bitmap + polling', pros: ['Microsecond reads, tiny payloads', 'Simple'], cons: ['Up to a few seconds stale'], chosen: true },
        { name: 'Push updates (WebSocket/SSE)', pros: ['Near-real-time maps for hot shows'], cons: ['Many long-lived connections; only worth it for marquee events'] },
      ],
      verdict: "Bitmap in Redis with short polling by default; enable push for hot events. Accept staleness on reads because the hold is the authoritative check.",
    },
    {
      title: '🧩 Data partitioning: contention, not volume',
      md:
        "A year of tickets is only tens of GB-to-TB — volume is not the problem. **Contention** is: all demand for a show lands on its few hundred rows. Partition by `show_id` so:\n\n" +
        "- every multi-seat hold is a **single-shard transaction** (no 2PC);\n" +
        "- unrelated shows never contend with each other;\n" +
        "- one mega-event can be isolated on its own shard/instance ahead of the on-sale.\n\n" +
        "Stadium events with 50k+ seats are split into **sections** for availability caching, but holds still go to the event's shard. Bookings for a user are found via a secondary index or a `user_bookings` table populated asynchronously.",
      verdict: "Shard by show/event id, isolate known hot events in advance, and keep payment and notification work off the shard via events.",
    },
  ],
  scaling: [
    { stage: '🌱 One city', md: "Monolith + one Postgres. Holds via conditional UPDATE, a cron job releases expired holds. Payment provider redirect + webhook." },
    { stage: '🌿 National', md: "Split Catalog (cached, read-heavy) from Booking (consistent). Redis bitmaps for seat maps, CDN for layouts and listings. Kafka for confirmations/notifications. Shard booking DB by show_id." },
    { stage: '🌳 Blockbuster releases', md: "Opening weekend of a big film = 10× peak. Pre-warm caches, isolate hot shows, add per-user hold limits (max 10 seats, max 1 active hold per show) and bot detection at the gateway." },
    { stage: '🔥 Mega on-sales', md: "Virtual waiting room with signed tokens and adaptive admission rate; Redis Lua admission filter in front of Postgres; dedicated shard per event; load tests at 3× expected demand before announcing the sale date." },
  ],
  tradeoffs: [
    { decision: 'Concurrency control', chosen: 'Conditional UPDATE (CAS) in the DB', alternative: 'Redis distributed locks', why: "The DB row is durable truth and the statement is atomic across all seats; Redis locks can be lost on failover." },
    { decision: 'Hold expiry', chosen: 'Expiry in the claim predicate + sweeper', alternative: 'Sweeper only', why: "Correctness never depends on a background job being on time." },
    { decision: 'Peak protection', chosen: 'Virtual waiting room', alternative: 'Autoscaling + 429 rate limits', why: "A single show's inventory is a hot spot that cannot scale out; metering is fair and predictable." },
    { decision: 'Seat-map reads', chosen: 'Redis bitmap, slightly stale', alternative: 'Strongly consistent DB reads', why: "Views are 20× holds; the hold call is the real check, so staleness costs at most a quick retry." },
    { decision: 'Late payment after release', chosen: 'Auto-refund', alternative: 'Bump the new holder', why: "Taking a seat from someone who already holds it breaks trust worse than a refund." },
    { decision: 'Partitioning', chosen: 'By show_id', alternative: 'By user_id', why: "Holds touch many seats of one show; keeping them on one shard avoids distributed transactions." },
  ],
  failures: [
    { node: 'db', scenario: 'Booking DB primary fails during a sale', impact: "Holds and confirmations fail for shows on that shard until failover.", mitigation: "Synchronous replica in another AZ with automated failover (~30 s); waiting room pauses admission automatically when error rates rise; clients retry with the same idempotency key." },
    { node: 'redis', scenario: 'Seat cache lost or failed over', impact: "Seat maps go blank or stale; in hot mode, the Lua admission filter loses state.", mitigation: "Rebuild bitmaps from Postgres (one small query per show). Because Postgres is the arbiter, a lost Redis hold can never cause a double sale — only extra DB load." },
    { node: 'psp', scenario: 'Payment gateway slow or down', impact: "Holds expire while users wait; revenue loss.", mitigation: "Multiple PSPs with routing by health; extend holds while a payment is in flight; circuit breaker to fail fast and let the user pick another method; reconcile later by polling PSP status." },
    { node: 'wr', scenario: 'Waiting room overwhelmed or bypassed', impact: "Stampede reaches the booking backend; bots grab inventory.", mitigation: "Serve queue pages statically from the edge; gateway rejects booking calls without a valid signed token; per-token single use and short expiry." },
    { node: 'sweeper', scenario: 'Hold sweeper stops running', impact: "Abandoned seats look held on seat maps; fewer seats sold.", mitigation: "Claim predicate treats expired holds as available anyway, so new holds still succeed; alert on sweeper lag; run it as a leader-elected job with a standby." },
    { node: 'booking', scenario: 'Retry storm after a timeout creates duplicate orders', impact: "Users charged twice or two orders for one hold.", mitigation: "Idempotency key unique per user; one active order per hold; payment intent unique constraint." },
    { node: 'q', scenario: 'Notification pipeline delayed', impact: "Users paid but have not received the ticket yet — support calls spike.", mitigation: "The booking page shows CONFIRMED from the DB immediately; tickets are viewable in-app without waiting for email/SMS." },
  ],
  interviewTips: [
    "Say early that the data is tiny and the problem is **contention** — it reframes the whole design.",
    "Write the conditional UPDATE on the whiteboard. It is the single most convincing answer to “how do you prevent double booking?”.",
    "Distinguish browse (eventually consistent, cached) from booking (strongly consistent) — two different subsystems.",
    "Cover the payment-after-expiry race and its compensating action (refund).",
    "For hot launches, explain why autoscaling alone does not help a single-show hot spot, then introduce the waiting room.",
  ],
  realWorld: [
    "Ticketmaster's 2022 Eras Tour presale saw ~14M users plus bots and about 3.5 billion system requests — four times its previous peak — causing a widely reported meltdown.",
    "BookMyShow used a Queue-it-style waiting room for Coldplay's 2024 India tour, where reportedly over 10M users queued for roughly 150k tickets.",
    "Most cinema chains use 5–15 minute hold windows; airlines use the same hold-then-ticket pattern for seats (see #/design/flight-booking).",
  ],
  concepts: ['acid-transactions', 'distributed-locking', 'idempotency', 'rate-limiting', 'saga-pattern', 'caching-strategies', 'database-sharding', 'webhooks', 'message-queues'],
  quiz: [
    { q: "Why does autoscaling the Booking Service not solve a mega on-sale on its own?", options: ['Autoscaling is too expensive', 'All demand targets one show whose seats live on one shard — more app servers just queue up on the same rows', 'Load balancers cannot handle it', 'Autoscaling breaks idempotency'], answer: 1, explain: "The bottleneck is contention on a small, single-shard inventory. Metering admission (waiting room) is what protects it." },
    { q: "The hold statement is `UPDATE … WHERE seat_id IN ('H7','H8') AND status='AVAILABLE'`. It reports 1 row affected. What should happen?", options: ['Commit and give the user H7 only', 'Roll back so neither seat is held, and tell the user which seat is taken', 'Retry the same statement until it returns 2', 'Commit and hold H8 in Redis instead'], answer: 1, explain: "Holds are all-or-nothing. Rolling back avoids orphaned single seats and lets the user choose again with a fresh map." },
    { q: "A payment succeeds after the user's hold expired and the seat was resold. What is the safest behaviour?", options: ['Give both users the seat', 'Cancel the new holder', 'Mark the late order failed and refund automatically', 'Ignore the payment'], answer: 2, explain: "Refund is the compensating action. Defensive measures (extending holds during payment, checking PSP status before release) make this rare." },
    { q: "Why use a Redis Lua script rather than individual SET NX calls for hot-mode holds?", options: ['Lua is faster than C', 'To claim several seats atomically — all or none — in one round-trip', 'Redis does not support SET NX', 'To persist holds to disk'], answer: 1, explain: "Separate SET NX calls could hold H7 but fail on H8, leaving partial holds to unwind. A script runs atomically on the Redis shard." },
    { q: "In the waiting room, why randomise the order of users who arrived before the sale opened?", options: ['To save memory', 'So that refreshing earliest or running bots before opening time gives no advantage', 'Because FIFO is impossible at scale', 'To reduce CDN cost'], answer: 1, explain: "Everyone present at open is treated equally; FIFO applies only to later arrivals. This removes the incentive to hammer the site before the start." },
    { q: "Seat maps are served from a Redis bitmap that may be 2 seconds stale. Why is this acceptable?", options: ['Users do not notice', 'The hold call against the DB is the authoritative check; a stale view costs at most a fast 409 and a refresh', 'Redis is always consistent', 'It is not acceptable'], answer: 1, explain: "Separating view consistency from booking consistency lets reads scale cheaply without risking double sales." },
  ],
  references: [
    { title: 'Queue-it — How a virtual waiting room works', url: 'https://queue-it.com/blog/virtual-waiting-room/' },
    { title: 'Ticketmaster statement on the Taylor Swift Eras Tour on-sale (2022)', url: 'https://business.ticketmaster.com/press-release/taylor-swift-the-eras-tour-onsale-explained/' },
  ],
});
