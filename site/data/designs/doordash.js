SD.design({
  id: 'doordash',
  title: 'Food Delivery (DoorDash)',
  company: 'DoorDash / Uber Eats / Deliveroo',
  difficulty: 'hard',
  order: 3,
  icon: '🛵',
  tagline: 'Coordinate a customer, a kitchen and a driver so hot food arrives in 35 minutes, millions of times a day.',
  summary:
    "Food delivery is a **three-sided marketplace**: customers order, merchants cook, and dashers (couriers) pick up and deliver. Unlike ride hailing, there is a **cooking step in the middle** whose duration is uncertain, " +
    "so the core problem is **timing**: send a dasher so they arrive at the restaurant just as the food is ready — too early and they wait unpaid, too late and the food goes cold. " +
    "The hard parts are an **order lifecycle** that spans three parties and a payment provider (a long-running saga), **prep-time and ETA prediction**, " +
    "**assignment with batching** (one dasher carrying two orders from nearby stores), and **real-time tracking** for the customer — all under a brutal dinner-time peak.",
  analogy:
    "A wedding caterer coordinating several kitchens and a fleet of waiters. The head waiter does not send a server to the kitchen the moment a dish is ordered; they watch how fast each kitchen is cooking tonight and dispatch a server so they reach the pass just as the plate comes up — and if two tables are next to each other, one server carries both plates.",
  numbers: [
    { value: '~7M', label: 'orders / day' },
    { value: '~15%', label: 'of daily orders in the dinner peak hour' },
    { value: '~35 min', label: 'typical order-to-door time' },
    { value: '3', label: 'parties per order (+ payments)' },
    { value: '~700K', label: 'orders in flight at peak' },
  ],
  requirements: {
    functional: [
      'Customers browse nearby stores and menus, build a cart, see a **delivery-time estimate and fees**, and place an order.',
      'Merchants receive orders on a tablet/POS, **accept** them (with a prep-time estimate), and mark them ready.',
      'The system **assigns a dasher** (possibly batching multiple orders), who accepts, picks up and delivers.',
      'Customers **track** the order status and dasher location in real time, with an updating ETA.',
      'Payments: authorise at checkout, capture the final amount (incl. tip, adjustments) on delivery; pay merchants and dashers.',
      'Handle cancellations, unassignments, missing items and refunds.',
    ],
    nonFunctional: [
      '**Reliability of the order path**: a lost or duplicated order costs food, money and trust. Placing an order must be idempotent.',
      '**Low latency** browse (p99 < 300 ms) under massive read volume; menus are read ~20× per order.',
      '**Timely assignment**: decide within seconds, but the decision itself must be smart (timing + batching).',
      '**Scales with a sharp peak**: dinner hour, Super Bowl, rain. Capacity planning is per market.',
      'Eventual consistency is fine for tracking and menus; **strong consistency** for order state transitions and payments.',
    ],
    outOfScope: ['Restaurant onboarding / menu ingestion pipelines', 'Grocery picking flows', 'Ads and promotions engine', 'Dasher background checks and payroll internals'],
  },
  estimation: {
    inputs: [
      { id: 'orders', label: 'Orders per day', value: 7e6, min: 1e5, max: 5e7, step: 1e5 },
      { id: 'peakShare', label: 'Share of orders in peak hour', value: 15, min: 5, max: 40, step: 1, unit: '%' },
      { id: 'views', label: 'Menu/store reads per order', value: 20, min: 5, max: 100, step: 5 },
      { id: 'dashers', label: 'Dashers online at peak', value: 300e3, min: 1e4, max: 2e6, step: 1e4 },
      { id: 'interval', label: 'Dasher GPS interval', value: 5, min: 1, max: 30, step: 1, unit: 's' },
      { id: 'duration', label: 'Order lifetime (place → deliver)', value: 40, min: 15, max: 90, step: 5, unit: 'min' },
    ],
    outputs: [
      { label: 'Orders / s (average)', f: (v) => v.orders / 86400 },
      { label: 'Orders / s (peak hour)', f: (v) => (v.orders * v.peakShare) / 100 / 3600 },
      { label: 'Catalog reads / s (peak)', f: (v) => ((v.orders * v.peakShare) / 100 / 3600) * v.views },
      { label: 'Orders in flight at peak', f: (v) => Math.round(((v.orders * v.peakShare) / 100 / 3600) * v.duration * 60), note: "Little's law: arrival rate × time in system" },
      { label: 'Dasher location updates / s', f: (v) => v.dashers / v.interval },
      { label: 'Order state events / day', f: (v) => v.orders * 12, note: '~12 transitions per order (created, authorised, confirmed, assigned, arrived, picked up, …)' },
      { label: 'Order storage per year', unit: 'bytes', f: (v) => v.orders * 365 * 10240, note: '~10 KB per order incl. items, events, audit' },
    ],
    notes:
      "The peak is what you design for: with 15% of orders in one hour, the peak order rate is **3.6× the daily average**, and about 700K orders are simultaneously in flight — each one a small state machine waiting on a kitchen or a dasher. " +
      "Browse traffic is an order of magnitude larger than order traffic and must be served almost entirely from cache.",
  },
  api: [
    { method: 'GET', path: '/v1/stores?lat=..&lng=..&cuisine=thai', desc: 'Nearby stores with delivery ETA & fee', notes: 'ETA per store is a cached estimate per (store, customer geo cell), refreshed every minute or so — not computed per request.' },
    { method: 'GET', path: '/v1/stores/{id}/menu', desc: 'Store menu', notes: 'Heavily cached (CDN + Redis), versioned; item availability ("86\'d" items) is overlaid from a fast-changing store status record.' },
    { method: 'POST', path: '/v1/orders', desc: 'Place an order', req: 'Idempotency-Key: c0ffee…\n{ "store_id": "s_42", "items": [ { "item_id": "pad_thai", "qty": 2, "options": [...] } ],\n  "address_id": "a_7", "payment_method": "pm_3", "tip": 4.00, "quote_id": "q_88" }', res: '201 { "order_id": "o_9001", "state": "PLACED", "eta": "19:42" }',
      notes: 'Server re-prices the cart (never trust client totals) and checks the quote is still valid.' },
    { method: 'POST', path: '/v1/merchant/orders/{id}/confirm', desc: 'Merchant accepts with prep time', req: '{ "prep_minutes": 15 }' },
    { method: 'WS', path: 'wss://rt.example/dasher', desc: 'Dasher stream: GPS up, offers & instructions down', notes: 'Offers carry an expiry; dasher actions (accept, arrived, picked up, delivered + photo) are idempotent commands with client-generated ids.' },
    { method: 'GET', path: '/v1/orders/{id}/track', desc: 'Customer tracking (SSE / WebSocket)', res: 'event: status { "state": "PICKED_UP", "eta": "19:38" }\nevent: dasher { "lat": .., "lng": .. }' },
    { method: 'POST', path: '/v1/orders/{id}/cancel', desc: 'Cancel; refund rules depend on state (food already cooked?)' },
  ],
  dataModel: [
    { name: 'orders', store: 'Sharded SQL (CockroachDB / Postgres), by order_id', fields: [['order_id', 'PK', ''], ['customer_id, store_id', 'bigint', 'secondary indexes'], ['state', 'enum', 'PLACED → CONFIRMED → ASSIGNED → PICKED_UP → DELIVERED …'], ['version', 'int', 'optimistic concurrency'], ['items', 'json', 'priced snapshot of the cart'], ['totals', 'decimal', 'subtotal, fees, tax, tip'], ['promised_eta, ready_at', 'timestamp', '']],
      why: 'Order transitions and money need transactions; the transactional outbox table lives in the same DB.' },
    { name: 'outbox', store: 'Same DB as orders', fields: [['event_id', 'PK', ''], ['order_id', 'bigint', ''], ['type', 'string', 'OrderPlaced, OrderConfirmed, …'], ['payload', 'json', ''], ['published', 'bool', 'relay marks after Kafka ack']],
      why: 'Written in the same transaction as the state change, then relayed to Kafka — no lost or phantom events.' },
    { name: 'deliveries', store: 'Dispatch DB (by market)', fields: [['delivery_id', 'PK', ''], ['order_ids', 'array', 'batched orders'], ['dasher_id', 'bigint?', ''], ['route', 'json', 'pickup/dropoff sequence'], ['offer_state', 'enum', 'UNASSIGNED / OFFERED / ACCEPTED']],
      why: 'Separates "what to cook" (order) from "how to move it" (delivery). Batching maps several orders to one delivery.' },
    { name: 'dasher_state', store: 'Redis / in-memory (by market)', fields: [['dasher_id', 'key', ''], ['lat, lng, h3_cell', '', 'latest'], ['status', 'enum', 'IDLE / EN_ROUTE_PICKUP / WAITING / EN_ROUTE_DROPOFF'], ['load', 'int', 'orders carried'], ['last_seen', 'timestamp', '']],
      why: 'Soft state updated every few seconds and read by the assignment optimiser.' },
    { name: 'menus', store: 'Document store + Redis + CDN', fields: [['store_id', 'PK', ''], ['version', 'int', ''], ['categories/items/options', 'json', ''], ['hours', 'json', '']],
      why: 'Read-mostly, nested, versioned documents. Cache at every layer.' },
  ],
  architecture: {
    intro:
      "Three clients, two front doors (request/response and realtime). The **Order Service** owns the order state machine and writes to a transactional DB with an **outbox**; events flow through Kafka to **Dispatch**, which decides *when* and *to whom* to assign using ETA models and live dasher state.",
    nodes: [
      { id: 'customer', label: 'Customer App', type: 'client', col: 0, row: 1, desc: 'Browses stores, checks out, tracks the order. Subscribes to a realtime channel for its active order.' },
      { id: 'merchant', label: 'Merchant Tablet', sub: 'or POS integration', type: 'client', col: 0, row: 3, desc: 'Receives new orders, confirms with a prep time, marks ready. Many large chains integrate their POS by API instead.' },
      { id: 'dasher', label: 'Dasher App', type: 'client', col: 0, row: 4, desc: 'Streams GPS, receives offers, follows pickup/drop-off instructions, confirms with photos.' },
      { id: 'gw', label: 'API Gateway', type: 'gateway', col: 1, row: 1, desc: 'Auth, rate limiting, idempotency keys and routing for customer APIs.', tech: ['Envoy', 'Kong'] },
      { id: 'rt', label: 'Realtime Gateway', sub: 'WS / SSE / push', type: 'gateway', col: 1, row: 3, multi: true, desc: 'Persistent connections to tablets, dasher apps and tracking customers. Pub/sub channels per order and per device; falls back to mobile push (APNs/FCM) and, for merchants, automated phone calls.', tech: ['WebSockets', 'APNs/FCM'] },
      { id: 'catalog', label: 'Store & Menu', sub: 'browse / search', type: 'search', col: 2, row: 0, multi: true, desc: 'Store discovery, search and menus — the highest read volume in the system. Served from caches; store open/busy status and item availability are overlaid at read time.', tech: ['Elasticsearch', 'Redis', 'CDN'] },
      { id: 'order', label: 'Order Service', sub: 'state machine', type: 'service', col: 2, row: 1, multi: true, desc: 'Validates and prices carts, creates orders idempotently, enforces legal state transitions, orchestrates the payment/merchant/dasher saga and pushes status updates.' },
      { id: 'loc', label: 'Location Service', type: 'service', col: 2, row: 4, desc: 'Ingests dasher GPS, updates live dasher state, detects geofence events (arrived at store / at customer) and publishes positions to the tracking channel of the order.' },
      { id: 'pay', label: 'Payments', type: 'service', col: 3, row: 0, desc: 'Authorises at checkout, captures on delivery, handles refunds and partial adjustments; pays out merchants and dashers in batches. Idempotency key = order id + operation.', tech: ['Stripe / Adyen', 'Ledger'] },
      { id: 'orderdb', label: 'Order DB', sub: '+ outbox', type: 'db', col: 3, row: 1, desc: 'Strongly consistent store for orders, sharded by order id. State changes and their outbox events commit in one transaction.', tech: ['CockroachDB', 'Postgres'] },
      { id: 'kafka', label: 'Order Events', type: 'queue', col: 3, row: 2, desc: 'Outbox relay publishes every order event here: dispatch, notifications, analytics, ETA training and finance all consume independently.', tech: ['Kafka'] },
      { id: 'dispatch', label: 'Dispatch Optimizer', sub: 'assign + batch', type: 'worker', col: 3, row: 3, multi: true, desc: 'Per market, every few seconds: take unassigned deliveries and available dashers, predict times, and solve an assignment that may batch orders. Also decides to *wait* when sending a dasher now would be too early.', tech: ['Optimization solver (MIP)', 'Kotlin/Go services'] },
      { id: 'geo', label: 'Dasher State', sub: 'live, by market', type: 'cache', col: 3, row: 4, desc: 'Latest location, status and current load of every online dasher, indexed by H3 cell for nearby lookups.', tech: ['Redis', 'H3'] },
      { id: 'eta', label: 'ETA & Prep ML', type: 'ml', col: 4, row: 2, desc: 'Models for food prep time per store/time/order size, dasher travel times, parking/handoff time and end-to-end delivery ETA. Used at checkout (promise), in dispatch (timing) and during tracking (updates).', tech: ['Gradient boosting / deep models', 'Feature store'] },
    ],
    edges: [
      { from: 'customer', to: 'gw', label: 'browse / order' },
      { from: 'customer', to: 'rt', label: 'tracking', curve: -0.15 },
      { from: 'merchant', to: 'rt', label: 'orders / confirm', both: true },
      { from: 'dasher', to: 'rt', label: 'GPS / offers', both: true },
      { from: 'gw', to: 'catalog' },
      { from: 'gw', to: 'order', label: 'checkout' },
      { from: 'rt', to: 'order', label: 'actions / status', both: true },
      { from: 'rt', to: 'loc', label: 'GPS' },
      { from: 'order', to: 'pay', label: 'auth / capture' },
      { from: 'order', to: 'orderdb', label: 'tx + outbox' },
      { from: 'order', to: 'eta', label: 'promise ETA' },
      { from: 'orderdb', to: 'kafka', label: 'outbox relay', async: true },
      { from: 'kafka', to: 'dispatch', async: true },
      { from: 'dispatch', to: 'eta', label: 'predict' },
      { from: 'dispatch', to: 'geo', label: 'dashers' },
      { from: 'dispatch', to: 'rt', label: 'offers' },
      { from: 'dispatch', to: 'order', label: 'assigned', curve: 0.2 },
      { from: 'loc', to: 'geo', label: 'update' },
    ],
  },
  flows: [
    {
      id: 'checkout', name: 'Browse and place an order',
      steps: [
        { from: 'customer', to: 'gw', text: 'Customer opens the app; store list and menu requests go through the gateway.' },
        { from: 'gw', to: 'catalog', text: 'Store & Menu returns nearby open stores and the Thai restaurant menu from cache (~20 ms).' },
        { from: 'gw', to: 'order', text: 'Customer taps Place Order with an idempotency key.' },
        { from: 'order', to: 'eta', text: 'Re-price the cart server-side and ask for a promised delivery time: prep ~14 min + travel ~12 min + handoff → "19:42".' },
        { from: 'order', to: 'pay', text: 'Authorise (hold) the total on the card — not yet captured.' },
        { from: 'order', to: 'orderdb', text: 'One transaction: insert order (state PLACED) **and** an `OrderPlaced` outbox row.' },
        { from: 'orderdb', to: 'kafka', text: 'Outbox relay publishes `OrderPlaced` to Kafka.' },
        { from: 'order', to: 'rt', text: 'Push the new order to the merchant tablet channel.' },
        { from: 'rt', to: 'merchant', text: 'The tablet rings. If it is offline, fall back to push and then an automated call.' },
      ],
    },
    {
      id: 'confirm', name: 'Merchant confirms and dispatch times the dasher',
      steps: [
        { from: 'merchant', to: 'rt', text: 'Merchant taps Confirm: "ready in 15 min".' },
        { from: 'rt', to: 'order', text: 'Order Service transitions PLACED → CONFIRMED (versioned write) with `ready_at = 19:30`.' },
        { from: 'order', to: 'orderdb', text: 'State + `OrderConfirmed` outbox row commit together.' },
        { from: 'orderdb', to: 'kafka', text: 'Event published.' },
        { from: 'kafka', to: 'dispatch', text: 'Dispatch adds a delivery for o_9001 to the market pool.' },
        { from: 'dispatch', to: 'eta', text: 'Blend merchant prep estimate with the model (this store runs 4 min late on Friday nights) → ready ≈ 19:34.' },
        { at: 'dispatch', text: 'Nearest suitable dasher is 8 min away. Assigning now would make them wait 10 min, so **hold** the delivery and re-evaluate on the next cycles.' },
      ],
    },
    {
      id: 'assign', name: 'Assignment with batching',
      steps: [
        { at: 'dispatch', text: 'Cycle at 19:24: o_9001 (ready 19:34) and o_9007 from a store 200 m away (ready 19:36), both delivering to the same neighbourhood.' },
        { from: 'dispatch', to: 'geo', text: 'Fetch idle and nearly-finished dashers near both stores.' },
        { from: 'dispatch', to: 'eta', text: 'Score options: single deliveries vs one batched route (store A → store B → customer 1 → customer 2).' },
        { at: 'dispatch', text: 'Solver picks the batch for dasher d_55: arrives 19:33, both customers within their promised times, one dasher saved.' },
        { from: 'dispatch', to: 'rt', text: 'Send the batched offer to d_55 with route and pay; mark d_55 OFFERED.' },
        { from: 'rt', to: 'dasher', text: 'Dasher sees "2 orders, $11.50, 4.1 mi" and accepts.' },
        { from: 'dasher', to: 'rt', text: 'Accept (with command id, so a retry is harmless).' },
        { from: 'dispatch', to: 'order', text: 'Record assignment; both orders → ASSIGNED; customers notified "Your Dasher is on the way".' },
      ],
    },
    {
      id: 'track', name: 'Live tracking and pickup',
      steps: [
        { from: 'dasher', to: 'rt', text: 'Dasher app streams GPS every ~5 s.' },
        { from: 'rt', to: 'loc', text: 'Location Service ingests the point.' },
        { from: 'loc', to: 'geo', text: 'Update live dasher state (position, cell, status).' },
        { at: 'loc', text: 'Geofence: dasher entered the 50 m radius of store A → emit "arrived at store" (helps measure wait time and prep accuracy).' },
        { from: 'loc', to: 'rt', text: 'Publish the position to the `order:o_9001` tracking channel (throttled to one update per few seconds).' },
        { from: 'rt', to: 'customer', text: 'Customer map shows the dasher; ETA refreshed from the model as the route progresses.' },
        { from: 'dasher', to: 'rt', text: 'Dasher taps Picked Up → order transitions to PICKED_UP.' },
      ],
    },
    {
      id: 'deliver', name: 'Delivery and payment capture',
      steps: [
        { from: 'dasher', to: 'rt', text: 'Dasher marks Delivered with a drop-off photo.' },
        { from: 'rt', to: 'order', text: 'Order Service: PICKED_UP → DELIVERED (idempotent on the command id).' },
        { from: 'order', to: 'orderdb', text: 'Persist state + `OrderDelivered` outbox event.' },
        { from: 'order', to: 'pay', text: 'Capture the final amount (subtotal, fees, tip, minus any substitutions) against the earlier authorisation.' },
        { from: 'orderdb', to: 'kafka', text: 'Event fans out: dasher earnings, merchant payout ledger, ETA model training label (promised vs actual), rating prompt.' },
        { from: 'rt', to: 'customer', text: 'Customer sees "Delivered" and the photo.' },
      ],
    },
    {
      id: 'unassign', name: 'Dasher unassigns mid-delivery (failure path)',
      steps: [
        { from: 'dasher', to: 'rt', text: 'Dasher has a flat tyre and taps Unassign before pickup.' },
        { from: 'rt', to: 'order', text: 'Order Service records the unassignment; order goes back to CONFIRMED (food is still cooking).' },
        { from: 'order', to: 'orderdb', text: 'State + `DeliveryUnassigned` outbox event.' },
        { from: 'orderdb', to: 'kafka', text: 'Event published.' },
        { from: 'kafka', to: 'dispatch', text: 'Dispatch re-inserts the delivery with **high priority** (food ready soon, promise at risk).' },
        { from: 'dispatch', to: 'geo', text: 'Find the best available dasher, accepting a less efficient match to protect the promise.' },
        { from: 'dispatch', to: 'rt', text: 'Offer to the new dasher (possibly with a pay boost); customer ETA is updated honestly.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '⏰ When to dispatch a dasher (the core timing problem)',
      md:
        "Ride hailing assigns immediately because the rider is ready now. In food delivery the \"passenger\" (the food) is not ready for 10–20 minutes, and the cooking time is uncertain.",
      options: [
        { name: 'Assign immediately on order', pros: ['Simple; dasher committed early'], cons: ['Dasher waits at the restaurant (unpaid time, crowding)', 'Locks a dasher who could have done a short delivery first', 'Fewer batching opportunities'] },
        { name: 'Assign when food is ready', pros: ['Zero dasher wait'], cons: ['Food sits for the full travel time → cold food, late deliveries'] },
        { name: 'Assign at (predicted ready time − dasher travel time)', desc: 'Re-evaluate every cycle; commit when waiting longer would hurt the promise.', pros: ['Dasher arrives as food is ready', 'Keeps options open for batching', 'Self-correcting as predictions update'], cons: ['Depends on accurate prep-time and travel predictions', 'Needs a continuously running optimiser'], chosen: true },
      ],
      verdict:
        "Treat every confirmed order as a delivery with a **target arrival time at the store**, and let the optimiser decide each cycle whether to commit now or wait. Bias toward committing when uncertainty is high or dasher supply is thin — an idle dasher is cheaper than a late order.",
    },
    {
      title: '🧮 Assignment and batching as an optimisation problem',
      md:
        "Every few seconds per market (DoorDash called its dispatch engine *DeepRed*): \n\n" +
        "1. **Candidates**: unassigned deliveries × dashers (idle, or finishing a drop-off nearby), pruned by distance.\n" +
        "2. **Route options**: for each dasher, evaluate single deliveries and small batches (2–3 orders) whose stores and drop-offs are close and whose ready times align.\n" +
        "3. **Score**: predicted lateness vs promise, dasher idle/wait time, total distance, food-in-bag time, dasher acceptance likelihood.\n" +
        "4. **Solve**: a mixed-integer program picks a set of (dasher, route) pairs so each delivery is covered at most once and each dasher gets at most one route.\n" +
        "5. **Commit or defer**: only deliveries whose \"best start time\" is now are offered; the rest wait for the next cycle.\n\n" +
        "Batching is the big lever for efficiency at peak, but every batched order is a little later than it would be alone — the objective must cap the extra delay per customer.",
      diagram: {
        nodes: [
          { id: 'pool', label: 'Unassigned pool', sub: 'per market', type: 'queue', col: 0, row: 1, desc: 'Confirmed deliveries waiting for a dasher.' },
          { id: 'dash', label: 'Available dashers', sub: 'idle + finishing soon', type: 'cache', col: 0, row: 2.5, desc: 'From live dasher state.' },
          { id: 'gen', label: 'Route generator', sub: 'singles + batches', type: 'service', col: 1, row: 1.75, desc: 'Enumerates feasible routes per dasher: A, B, A+B (pickup A, pickup B, drop A, drop B)…' },
          { id: 'pred', label: 'ETA / prep models', type: 'ml', col: 2, row: 0.75, desc: 'Predict ready times and travel times for every leg.' },
          { id: 'score', label: 'Score routes', sub: 'lateness, wait, cost', type: 'worker', col: 2, row: 2.5, desc: 'Combines predictions into a cost per (dasher, route).' },
          { id: 'mip', label: 'MIP solver', sub: 'cover each order ≤1', type: 'scheduler', col: 3, row: 1.75, desc: 'Selects the best non-conflicting set of routes.' },
          { id: 'now', label: 'Start now?', type: 'service', col: 4, row: 1.75, desc: 'Offer only if the best start time is now; otherwise defer to the next cycle.' },
          { id: 'offer', label: 'Offer to dasher', type: 'gateway', col: 5, row: 1.75, desc: 'Sent via the realtime gateway with an expiry.' },
        ],
        edges: [
          { from: 'pool', to: 'gen' }, { from: 'dash', to: 'gen' }, { from: 'gen', to: 'pred' }, { from: 'gen', to: 'score' }, { from: 'pred', to: 'score' },
          { from: 'score', to: 'mip' }, { from: 'mip', to: 'now' }, { from: 'now', to: 'offer', label: 'yes' }, { from: 'now', to: 'pool', label: 'defer', curve: -0.4 },
        ],
        flows: [
          { id: 'cycle', name: 'One dispatch cycle', steps: [
            { from: 'pool', to: 'gen', text: 'Orders A (ready 19:34) and B (ready 19:36) from neighbouring stores are in the pool.' },
            { from: 'dash', to: 'gen', text: 'Dasher d_55 is 9 min away and idle; d_61 is finishing a drop-off nearby.' },
            { from: 'gen', to: 'pred', text: 'Generate routes: d_55→A, d_55→B, d_55→A+B, d_61→A, …; predict every leg.' },
            { from: 'pred', to: 'score', text: 'A+B by d_55: both customers within promise (+3 min for B), no wait at store. Lowest total cost.' },
            { from: 'score', to: 'mip', text: 'Solver selects {d_55: A+B} and leaves d_61 free for the next order.' },
            { from: 'mip', to: 'now', text: 'd_55 must leave now to arrive at 19:33 → start now.' },
            { from: 'now', to: 'offer', text: 'Offer the batched route to d_55.' },
          ] },
        ],
      },
    },
    {
      title: '⏳ Predicting prep time and ETAs',
      md:
        "One order involves several predictions, each with its own errors:\n\n" +
        "- **Prep time**: depends on the store, time of day, order size, and how busy the kitchen is *right now* (inferred from recent orders and dasher wait times). Merchant-entered estimates are biased, so they are a feature, not the answer.\n" +
        "- **Dasher → store** and **store → customer** travel: routing + learned corrections per area.\n" +
        "- **Handoff time**: parking at a mall, walking up a high-rise, finding an apartment entrance.\n\n" +
        "Key practices:\n\n" +
        "1. Predict a **distribution**, not a point: the checkout promise uses a conservative quantile, dispatch uses the median.\n" +
        "2. Treat the promise as a product decision: under-promising loses conversions, over-promising destroys trust.\n" +
        "3. Close the loop: every delivered order produces labels (actual prep, actual travel) that flow through Kafka into training.\n" +
        "4. Update the customer ETA during the order, but avoid jitter — only change it when the estimate moves meaningfully.",
    },
    {
      title: '🔁 The order saga and the transactional outbox',
      md:
        "An order touches a payment provider, a merchant, a dasher and several internal services. There is no global transaction; it is a **saga** of local steps with compensations:\n\n" +
        "| Step | Compensation if a later step fails |\n|---|---|\n| Authorise card | Void authorisation |\n| Merchant confirms | Notify merchant to stop; pay for food already made |\n| Assign dasher | Unassign, re-dispatch |\n| Capture payment on delivery | Refund (partial or full) |\n\n" +
        "The classic bug is the **dual write**: update the order row, then publish an event to Kafka. If the process dies between the two, Dispatch never hears about the order (a lost order), or it hears about one that rolled back.",
      options: [
        { name: 'Write DB, then publish to Kafka', pros: ['Simple'], cons: ['Crash in between ⇒ lost or phantom events', 'No atomicity'] },
        { name: 'Transactional outbox', desc: 'Insert the event in an outbox table in the same DB transaction; a relay (or CDC) publishes it.', pros: ['Atomic: event exists iff state changed', 'Replayable; at-least-once delivery'], cons: ['Consumers must be idempotent (dedupe by event_id)', 'Slight publish delay (ms–s)'], chosen: true },
        { name: 'Event sourcing', desc: 'Kafka is the source of truth; the order table is a projection.', pros: ['Full history, natural audit'], cons: ['Harder queries and migrations; read-your-writes is tricky for checkout'] },
      ],
      verdict: 'Use a transactional outbox (or CDC on the order table) with idempotent consumers. Run a reconciliation job that finds orders stuck in a state too long (e.g. CONFIRMED with no assignment after 10 min) and alerts or re-drives them.',
    },
    {
      title: '📍 Real-time tracking without melting the backend',
      md:
        "At peak, ~60K dasher GPS updates/s arrive, and hundreds of thousands of customers watch an order.\n\n" +
        "- **Fan-out is tiny per update**: each dasher position goes only to the 1–3 customers whose orders they carry, so a pub/sub channel per order is cheap.\n" +
        "- **Throttle and smooth**: customers do not need every point; send one every 3–5 s and let the app animate between points along the road.\n" +
        "- **Geofences** turn raw GPS into business events (arrived at store, arrived at customer) — useful for automatic status updates and for measuring wait times that feed prep-time models.\n" +
        "- **Degrade gracefully**: if the location pipeline lags, still show status changes (they come from the order path) with the last known position.",
    },
    {
      title: '🌧️ Surviving the dinner peak (and rain)',
      md:
        "Demand is spiky and correlated: dinner time, sports finals, bad weather (more orders *and* fewer dashers).\n\n" +
        "- **Supply levers**: peak pay incentives per region pushed to dashers ahead of the spike; forecasts per market and hour drive them.\n" +
        "- **Demand levers**: widen ETAs honestly, raise fees in constrained areas, shrink delivery radius, or temporarily hide stores that are far from available dashers.\n" +
        "- **Merchant levers**: stores can go into *busy mode* (longer prep times) or pause; the system can auto-throttle a kitchen that is falling behind.\n" +
        "- **System levers**: partition dispatch per market so one city cannot starve another; autoscale order and catalog tiers before the predicted peak; cache store lists per geo cell aggressively.",
    },
  ],
  scaling: [
    { stage: '🌱 One city, hundreds of orders/day', md: 'A monolith with Postgres. Dispatchers in an ops room assign orders by hand on a map. Merchants are phoned or emailed orders. Learn the domain before automating.' },
    { stage: '🌿 Dozens of cities, 50K orders/day', md: 'Automated greedy assignment (nearest idle dasher at ready time − travel time), merchant tablets with push, Redis for dasher locations, a queue for order events, cached menus.' },
    { stage: '🌳 National, millions of orders/day', md: 'Split into services (orders, catalog, dispatch, payments, location) with Kafka and a transactional outbox; dispatch becomes an optimiser with batching and ML prep/ETA models; per-market partitioning; strongly consistent distributed SQL for orders.' },
    { stage: '🌍 Multi-country', md: 'Market-level cells (a city never needs another continent\'s data): each region runs its own dispatch and order stack; global services only for identity, catalog ingestion and finance. Per-country payments and tax rules.' },
  ],
  tradeoffs: [
    { decision: 'Dispatch timing', chosen: 'Commit at predicted ready − travel, re-evaluated each cycle', alternative: 'Assign on order placement', why: 'Minimises dasher wait and food wait together and preserves batching options.' },
    { decision: 'Assignment algorithm', chosen: 'Global optimisation per market with batching', alternative: 'Greedy nearest dasher', why: 'Batching and swaps substantially improve dasher efficiency at peak; the solver runs in seconds per market.' },
    { decision: 'Event publication', chosen: 'Transactional outbox', alternative: 'Dual write (DB then Kafka)', why: 'Eliminates lost/phantom order events; consumers dedupe by event id.' },
    { decision: 'Order storage', chosen: 'Distributed SQL with versioned transitions', alternative: 'NoSQL key-value', why: 'Orders need multi-row transactions (order + outbox + items) and strong consistency for money; volume (~300/s peak) is modest.' },
    { decision: 'Customer ETA', chosen: 'Conservative quantile for the promise', alternative: 'Median prediction', why: 'Late deliveries hurt trust more than slightly longer quoted times hurt conversion — tuned by experiment.' },
    { decision: 'Merchant notification', chosen: 'Realtime push with phone-call fallback', alternative: 'Tablet polling', why: 'An unseen order is a failed order; layered channels maximise delivery within seconds.' },
  ],
  failures: [
    { node: 'merchant', scenario: 'Merchant tablet offline / order not confirmed', impact: 'Food never cooked; dasher dispatched to an empty counter.', mitigation: 'Escalation ladder: push → SMS → automated phone call → support agent; auto-cancel and refund after N minutes; dispatch waits for confirmation before committing a dasher.' },
    { node: 'dispatch', scenario: 'Dispatch optimiser for a market crashes or runs slowly', impact: 'Deliveries pile up unassigned; promises slip.', mitigation: 'Stateless restart from the order event log + live dasher state; fallback to a simple greedy assigner; per-market isolation so other cities are unaffected.' },
    { node: 'eta', scenario: 'ETA / prep models degraded or serving stale features', impact: 'Dashers arrive too early or too late; bad promises at checkout.', mitigation: 'Fallback to historical per-store averages and merchant estimates; monitor prediction error in real time and alert on drift.' },
    { node: 'kafka', scenario: 'Event stream lag spikes', impact: 'Dispatch learns about confirmed orders late.', mitigation: 'The outbox keeps events safe; consumer lag alarms; dispatch also periodically scans the order DB for confirmed-but-unassigned orders as a safety net.' },
    { node: 'pay', scenario: 'Payment provider outage during dinner peak', impact: 'Checkout fails — direct revenue loss.', mitigation: 'Multiple PSPs with routing failover; for trusted customers, accept the order and authorise asynchronously with risk limits; idempotency keys prevent double charges on retry.' },
    { node: 'rt', scenario: 'Realtime gateway partition drops dasher connections', impact: 'Offers not delivered; dasher actions delayed.', mitigation: 'Apps reconnect to other nodes; offers time out and re-dispatch; dasher commands are queued locally and replayed idempotently.' },
    { node: 'catalog', scenario: 'Cache stampede after a menu cache flush at 6 pm', impact: 'Menu DB overwhelmed; browsing slows for everyone.', mitigation: 'Request coalescing, staggered TTLs, serve stale-while-revalidate, never flush caches at peak.' },
  ],
  interviewTips: [
    'Name the three sides and the **cooking delay** right away — it is what makes this harder than ride hailing.',
    'Use Little\'s law to size in-flight orders at peak; it shows why orders are long-lived state machines.',
    'Explain dispatch timing (ready time − travel time) and how batching trades a few minutes of lateness for efficiency.',
    'Call out the dual-write problem and fix it with a transactional outbox.',
    'Mention per-market partitioning: dispatch, capacity planning and incentives are all local.',
  ],
  concepts: ['saga-pattern', 'change-data-capture', 'message-queues', 'event-driven-architecture', 'idempotency', 'websockets', 'spatial-indexing', 'caching-strategies', 'acid-transactions', 'microservices'],
  realWorld: [
    'DoorDash has blogged about its dispatch engine (**DeepRed**) using ML predictions plus mixed-integer optimisation, and about migrating from a Python monolith to Kotlin microservices.',
    'DoorDash has written about using **CockroachDB** and Kafka-based event pipelines, and about ML for prep-time and delivery ETA prediction.',
    'Uber Eats and Deliveroo (Frank) describe similar batching-and-timing dispatch systems; Deliveroo has written about simulation for testing dispatch changes.',
  ],
  quiz: [
    { q: 'Why does food delivery usually not assign a dasher the instant an order is placed?', options: ['Dashers prefer to wait', 'The food is not ready for minutes; assigning at ready time minus travel time avoids dasher waiting and keeps batching options open', 'Payments must clear first', 'Assignment algorithms are slow'], answer: 1, explain: 'The cooking delay is the key difference from ride hailing; good timing minimises both dasher idle time and food sitting time.' },
    { q: 'At peak, 300 orders/s arrive and each takes ~40 minutes to deliver. Roughly how many orders are in flight?', options: ['12,000', '72,000', '720,000', '7.2 million'], answer: 2, explain: "Little's law: 300/s × 2,400 s = 720,000 concurrent orders." },
    { q: 'The Order Service updates the DB then publishes to Kafka, and crashes in between. What fixes this class of bug?', options: ['Publish first, then write', 'A transactional outbox written in the same DB transaction and relayed to Kafka', 'Retry the HTTP request', 'Use a bigger Kafka cluster'], answer: 1, explain: 'The outbox makes the state change and the event atomic; a relay publishes at-least-once and consumers dedupe.' },
    { q: 'Batching two orders from neighbouring stores onto one dasher usually…', options: ['Makes both orders faster', 'Saves dasher capacity at the cost of a few minutes for one of the customers, which the optimiser must bound', 'Is never worth it', 'Requires both orders to be from the same store'], answer: 1, explain: 'Batching trades a small, capped delay for one customer for significant fleet efficiency, especially at peak.' },
    { q: 'Which prediction should the checkout promise use?', options: ['The fastest possible time', 'A conservative quantile of the predicted delivery-time distribution', 'The merchant-entered prep time alone', 'A fixed 30 minutes'], answer: 1, explain: 'Promises are judged against reality; a conservative quantile keeps on-time rates high while dispatch still uses the median for planning.' },
    { q: 'A merchant tablet is offline when an order arrives. What is the best design?', options: ['Wait indefinitely', 'Escalate through push, SMS and automated call, and only commit a dasher after the merchant confirms', 'Dispatch a dasher immediately to tell the merchant', 'Cancel instantly'], answer: 1, explain: 'Layered notification maximises confirmation, and deferring dasher commitment avoids sending couriers to orders that will never be cooked.' },
  ],
  references: [
    { title: 'DoorDash Engineering: Next-generation optimization for dasher dispatch', url: 'https://doordash.engineering/2020/02/28/next-generation-optimization-for-dasher-dispatch-at-doordash/' },
    { title: 'Design DoorDash / Uber Eats (video)', url: 'https://www.youtube.com/results?search_query=design+doordash+system+design' },
  ],
});
