SD.design({
  id: 'google-maps',
  title: 'Maps & Navigation (Google Maps)',
  company: 'Google Maps / Apple Maps / Waze',
  difficulty: 'hard',
  order: 5,
  icon: '🗺️',
  tagline: 'Draw the whole planet at 20 zoom levels, find the fastest route across a continent in milliseconds, and know about the traffic jam that started two minutes ago.',
  summary:
    "A maps product is really **three systems sharing one map database**: (1) **map rendering** — the planet is cut into a pyramid of tiles per zoom level, built offline and served from CDNs as compact **vector tiles** that the phone draws itself; " +
    "(2) **routing** — shortest paths on a road graph with hundreds of millions of nodes, made millisecond-fast by **preprocessing** (contraction hierarchies, graph partitioning with overlay graphs) and kept current by plugging in **live traffic** weights; " +
    "and (3) **search/geocoding** — turning \"1600 Amphitheatre Pkwy\" or \"coffee\" into coordinates and places. " +
    "Feeding all three is a **traffic pipeline** that turns millions of anonymous phone GPS pings per second into per-road-segment speeds, which drive both ETAs and the red/yellow/green lines.",
  analogy:
    "A giant atlas that has been photocopied at every magnification and cut into identical square cards, so anyone can grab exactly the cards they are looking at. For directions, the cartographers have already pre-computed the major \"express routes\" between neighbourhoods, so finding a cross-country route means stitching a few express routes together instead of examining every side street — and a team watching every road's traffic updates the travel time on each express route every few minutes.",
  numbers: [
    { value: '~1M/s', label: 'tile requests (mostly CDN hits)' },
    { value: '22', label: 'zoom levels (z0 = 1 tile, z21 ≈ 4.4 trillion)' },
    { value: '<100 ms', label: 'continental route query' },
    { value: '~millions/s', label: 'GPS probe points for traffic' },
    { value: '~1–2 min', label: 'traffic freshness' },
  ],
  requirements: {
    functional: [
      'Display a **pannable, zoomable map** of the world with roads, labels, buildings and POIs.',
      '**Search / geocode** addresses and places; reverse-geocode a tapped point.',
      'Compute **routes** (driving, walking, transit) between two points with alternatives and an **ETA**.',
      'Show **live traffic** on the map and use it for ETAs; reroute during navigation when a faster route appears.',
      'Turn-by-turn **navigation** with voice instructions; offline maps for downloaded regions.',
    ],
    nonFunctional: [
      'Map panning must feel instant: tiles from the nearest edge in tens of ms; rendering at 60 fps on the device.',
      'Route queries in **< 100–200 ms** even for 1,000 km routes.',
      'Traffic data fresh within **~2 minutes**; ETAs accurate within a few percent on typical trips.',
      'Massive read scale with long-tail geography (the Sahara is rarely viewed; Manhattan constantly).',
      '**Privacy**: location probes are anonymised and aggregated; no individual trace leaves the pipeline.',
    ],
    outOfScope: ['Satellite imagery capture and photogrammetry', 'Street View', 'Transit schedule ingestion details', 'Ads / local business listings management'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active users', value: 300e6, min: 1e6, max: 2e9, step: 1e6 },
      { id: 'tiles', label: 'Tiles fetched per user per day', value: 300, min: 20, max: 2000, step: 10 },
      { id: 'hit', label: 'CDN / device cache hit rate', value: 95, min: 50, max: 99.9, step: 0.5, unit: '%' },
      { id: 'routes', label: 'Route requests per user per day', value: 1, min: 0.1, max: 10, step: 0.1 },
      { id: 'nav', label: 'Concurrently navigating users', value: 20e6, min: 1e5, max: 1e8, step: 1e5 },
      { id: 'zmax', label: 'Pre-built zoom levels (max z)', value: 16, min: 10, max: 18, step: 1 },
    ],
    outputs: [
      { label: 'Tile requests / s (avg)', f: (v) => (v.dau * v.tiles) / 86400 },
      { label: 'Tile requests reaching origin / s', f: (v) => ((v.dau * v.tiles) / 86400) * (1 - v.hit / 100) },
      { label: 'Tile egress bandwidth (avg)', unit: 'B/s', f: (v) => ((v.dau * v.tiles) / 86400) * 20 * 1024, note: '~20 KB per vector tile, compressed' },
      { label: 'Route requests / s (peak ×3)', f: (v) => ((v.dau * v.routes) / 86400) * 3 },
      { label: 'GPS probe points / s', f: (v) => v.nav / 5, note: 'one point every ~5 s from navigating phones' },
      { label: 'Tiles in pyramid (z0…zmax, ~30% non-empty)', f: (v) => Math.round(((Math.pow(4, v.zmax + 1) - 1) / 3) * 0.3) },
      { label: 'Vector tile storage', unit: 'bytes', f: (v) => ((Math.pow(4, v.zmax + 1) - 1) / 3) * 0.3 * 15 * 1024, note: '~15 KB per non-empty tile' },
    ],
    notes:
      "Each zoom level has **4×** the tiles of the previous one, so the deepest level dominates storage: z0…16 is ~5.7 billion tiles, z18 alone would be ~69 billion. Vector tiles let us stop pre-building around z16 and **over-zoom** on the device (the same geometry scaled up), " +
      "while the CDN plus on-device caches absorb ~95%+ of tile requests. Routing traffic is small in QPS but each query touches a huge in-memory graph.",
  },
  api: [
    { method: 'GET', path: '/tiles/v{ver}/{z}/{x}/{y}.mvt', desc: 'Vector tile (Mapbox Vector Tile / protobuf)', res: '200 application/x-protobuf\nCache-Control: public, max-age=604800, immutable',
      notes: 'The **data version** in the URL makes tiles immutable: map updates publish a new version instead of invalidating CDN caches. Styling (colours, fonts) is applied on the device.' },
    { method: 'GET', path: '/v1/geocode?q=1600+Amphitheatre+Pkwy&near=37.4,-122.1', desc: 'Forward geocode / place search', res: '{ "results": [ { "place_id": "p_123", "name": "...", "lat": 37.422, "lng": -122.084, "confidence": 0.98 } ] }' },
    { method: 'GET', path: '/v1/reverse?lat=37.422&lng=-122.084', desc: 'Reverse geocode a point to an address' },
    { method: 'POST', path: '/v1/routes', desc: 'Compute routes', req: '{ "origin": {"place_id": "p_123"}, "destination": {"lat": 37.77, "lng": -122.42},\n  "mode": "drive", "depart_at": "now", "alternatives": true, "avoid": ["tolls"] }',
      res: '{ "routes": [ { "polyline": "a~l~Fjk~uOwHJy@P", "distance_m": 52310, "eta_s": 2940,\n  "traffic_delay_s": 420, "steps": [ { "instruction": "Turn left onto …", "segment_ids": [...] } ] } ] }',
      notes: 'Polyline-encoded geometry keeps responses small. Segment ids let the client and server reason about the route during navigation.' },
    { method: 'POST', path: '/v1/probes', desc: 'Batched anonymous GPS probes from navigating devices', req: '{ "session": "rotating-anon-id", "points": [ { "lat":..., "lng":..., "ts":..., "speed":..., "heading":... } ] }',
      notes: 'Session ids rotate frequently; start/end of trips are trimmed to protect home/work locations.' },
    { method: 'GET', path: '/v1/traffic/{z}/{x}/{y}', desc: 'Traffic overlay tile (short TTL ~60 s)' },
  ],
  dataModel: [
    { name: 'map_features', store: 'Geo-partitioned feature store (Bigtable / Spanner) by S2 cell', fields: [['feature_id', 'PK', ''], ['type', 'enum', 'road, building, water, POI, boundary…'], ['geometry', 'bytes', 'points / lines / polygons'], ['attributes', 'map', 'name, road class, speed limit, one-way, lanes…'], ['version', 'int', '']],
      why: 'The single source of truth for the map. Everything else (tiles, routing graph, search index) is **derived** from it by batch pipelines.' },
    { name: 'vector_tiles', store: 'Object storage + CDN', fields: [['key', 'string', 'ver/z/x/y'], ['layers', 'protobuf', 'roads, labels, landuse… geometry simplified for this zoom'], ['size', 'int', '~5–50 KB']],
      why: 'Immutable blobs keyed by version and tile coordinates — the ideal CDN object.' },
    { name: 'road_graph', store: 'In-memory routing servers (built offline)', fields: [['node_id', 'uint32', 'intersection'], ['edges', 'array', '(to, segment_id, length, base time, turn restrictions)'], ['cell_id', 'per level', 'multi-level partition'], ['shortcuts / overlay', 'precomputed', 'CH shortcuts or cell boundary cliques']],
      why: 'Routing must run in RAM; the preprocessing output is a binary blob loaded at start-up.' },
    { name: 'segment_speeds', store: 'In-memory KV (by segment_id), refreshed every ~1 min', fields: [['segment_id', 'key', ''], ['live_speed', 'float', 'from probes, last few minutes'], ['historical_profile', 'array[168]', 'typical speed per hour of week'], ['incident', 'enum?', 'closure, accident']],
      why: 'The live metric that routing and ETA combine with the static graph.' },
    { name: 'places_index', store: 'Search index sharded by S2 region + global name index', fields: [['place_id', 'PK', ''], ['names, address tokens', 'text', 'multilingual'], ['location', 'S2 cell', ''], ['prominence', 'float', 'popularity, reviews']],
      why: 'Geocoding is a text search biased by location and prominence.' },
  ],
  architecture: {
    intro:
      "The top row is the **map display path** (device → CDN → tile store). The middle is **search** and the bottom is **routing and traffic**. On the right, an offline **map build pipeline** turns the master map data into tiles, a search index and a preprocessed routing graph.",
    nodes: [
      { id: 'client', label: 'Maps App', sub: 'renders vector tiles', type: 'client', col: 0, row: 2, desc: 'Computes which tiles cover the viewport, fetches and caches them, and renders vector geometry on the GPU with a style sheet (so rotation, 3D tilt and dark mode need no new tiles). Sends probes while navigating; holds offline regions.' },
      { id: 'cdn', label: 'Tile CDN', type: 'cdn', col: 1, row: 1, desc: 'Edge caches for immutable, versioned tiles. Popular areas and low zooms are effectively always cached; the long tail falls back to the origin.', tech: ['Google edge / Cloud CDN', 'CloudFront'] },
      { id: 'gw', label: 'API Gateway', type: 'gateway', col: 1, row: 3, desc: 'Auth / API keys, quotas, routing to search, directions and probe ingestion.', tech: ['GFE / Envoy'] },
      { id: 'tiles', label: 'Tile Store', sub: 'origin', type: 'storage', col: 2, row: 1, desc: 'Pre-built vector tiles for every version and zoom up to ~z16, plus traffic overlay tiles regenerated every minute.', tech: ['GCS / S3', 'Bigtable'] },
      { id: 'geocode', label: 'Geocoding / Search', type: 'service', col: 2, row: 2, multi: true, desc: 'Parses addresses ("221B Baker St" → number, street, city), handles typos and languages, queries the place index, and ranks by text match, distance to the user and prominence.' },
      { id: 'route', label: 'Directions Service', type: 'service', col: 2, row: 3, multi: true, desc: 'Snaps origin/destination to road segments, calls the routing engine for best + alternative paths, asks the ETA model for final times, builds turn-by-turn steps. Handles reroutes during navigation.' },
      { id: 'ingest', label: 'Probe Ingest', type: 'queue', col: 2, row: 4, desc: 'High-volume stream of anonymised GPS points from phones.', tech: ['Pub/Sub', 'Kafka'] },
      { id: 'places', label: 'Place Index', type: 'search', col: 3, row: 2, multi: true, desc: 'Text + spatial index of addresses and POIs, sharded by region with a global layer for famous places.', tech: ['Custom inverted index', 'Elasticsearch'] },
      { id: 'engine', label: 'Routing Engine', sub: 'partitioned graph', type: 'service', col: 3, row: 3, multi: true, desc: 'Holds the preprocessed road graph in RAM (multi-level partition with overlay graphs / contraction hierarchies). Answers point-to-point queries in milliseconds using the latest live weights.', tech: ['CRP / CCH (custom C++)', 'OSRM, GraphHopper (open source)'] },
      { id: 'traffic', label: 'Traffic Pipeline', sub: 'stream', type: 'worker', col: 3, row: 4, desc: 'Map-matches GPS points to road segments, estimates current speed per segment over a sliding window, detects incidents (sudden slowdowns), and drops data where too few devices exist to protect privacy.', tech: ['Dataflow / Flink', 'HMM map matching'] },
      { id: 'speeds', label: 'Live Segment Speeds', type: 'cache', col: 4, row: 3, desc: 'Current and historical speed for every road segment. Routing re-customises its overlay with these every minute or two; ETA and traffic tiles read them too.', tech: ['In-memory KV', 'Bigtable'] },
      { id: 'eta', label: 'ETA Model', type: 'ml', col: 4, row: 4, desc: 'Predicts arrival time along the chosen route from live + historical speeds, time of day and route features. Google and DeepMind have described graph neural networks over road "supersegments" for this.', tech: ['TensorFlow', 'GNN'] },
      { id: 'pipeline', label: 'Map Build Pipeline', sub: 'batch', type: 'worker', col: 4, row: 1, desc: 'Takes a new map data version and derives: generalised vector tiles per zoom, the place index, and the routing graph with its partition and preprocessing. Runs incrementally for changed regions.', tech: ['MapReduce / Beam', 'Tippecanoe-style tiling'] },
      { id: 'mapdb', label: 'Map Data', sub: 'source of truth', type: 'db', col: 5, row: 1, desc: 'Master geometry and attributes from imagery extraction, Street View, authoritative sources, user edits and operators. Versioned.', tech: ['Spanner / Bigtable'] },
    ],
    edges: [
      { from: 'client', to: 'cdn', label: 'z/x/y tiles' },
      { from: 'client', to: 'gw', label: 'search, route, probes' },
      { from: 'cdn', to: 'tiles', label: 'miss' },
      { from: 'gw', to: 'geocode' },
      { from: 'gw', to: 'route' },
      { from: 'gw', to: 'ingest', label: 'probes', async: true },
      { from: 'geocode', to: 'places' },
      { from: 'route', to: 'engine', label: 'path query' },
      { from: 'route', to: 'eta', label: 'refine ETA', curve: 0.25 },
      { from: 'engine', to: 'speeds', label: 'live weights' },
      { from: 'ingest', to: 'traffic', async: true },
      { from: 'traffic', to: 'speeds', label: 'per-segment speed' },
      { from: 'speeds', to: 'eta' },
      { from: 'mapdb', to: 'pipeline', async: true },
      { from: 'pipeline', to: 'tiles', label: 'vector tiles', async: true },
      { from: 'pipeline', to: 'places', label: 'index', async: true },
      { from: 'pipeline', to: 'engine', label: 'graph build', async: true, curve: 0.2 },
    ],
  },
  flows: [
    {
      id: 'tiles', name: 'Pan and zoom the map',
      steps: [
        { at: 'client', text: 'User zooms into downtown Seattle at z15. App computes the visible tiles: x 5245–5248, y 11444–11446 → 12 tiles.' },
        { at: 'client', text: '9 are already in the on-device cache from earlier; only 3 are requested.' },
        { from: 'client', to: 'cdn', text: '`GET /tiles/v2026.41/15/5246/11445.mvt` from the nearest edge → **hit** for 2 of them (~15 ms).' },
        { from: 'cdn', to: 'tiles', text: 'One tile is a miss at this edge; fetched from the tile store origin and cached (immutable, long TTL).' },
        { at: 'client', text: 'Vector geometry is drawn on the GPU with the current style; labels are placed client-side to avoid collisions as the map rotates.' },
        { at: 'client', text: 'Zooming to z18 needs no new tiles: z16 tiles are **over-zoomed** (geometry is precise enough), so the deepest levels never had to be pre-built.' },
      ],
    },
    {
      id: 'search', name: 'Search for an address',
      steps: [
        { from: 'client', to: 'gw', text: 'User types "1600 amphitheatre pkwy mountain view".' },
        { from: 'gw', to: 'geocode', text: 'Routed to Geocoding with the user location as a bias.' },
        { at: 'geocode', text: 'Parse into house number 1600, street "Amphitheatre Parkway" (expand "pkwy"), locality Mountain View; normalise case and spelling.' },
        { from: 'geocode', to: 'places', text: 'Query the regional index for the street + locality; interpolate the house number along the street segment if no exact address point exists.' },
        { at: 'places', text: 'Rank candidates by text match, distance from user and prominence; return the best with a confidence score.' },
        { from: 'geocode', to: 'gw', text: 'Return place id + coordinates.' },
        { from: 'gw', to: 'client', text: 'App drops a pin and offers Directions.' },
      ],
    },
    {
      id: 'route', name: 'Compute a driving route',
      steps: [
        { from: 'client', to: 'gw', text: '`POST /routes` from Seattle to Portland, depart now.' },
        { from: 'gw', to: 'route', text: 'Directions Service snaps both points to the nearest drivable segments (respecting the side of the road).' },
        { from: 'route', to: 'engine', text: 'Query the routing engine for the best path plus 2 alternatives.' },
        { from: 'engine', to: 'speeds', text: 'The engine\'s overlay was re-customised one minute ago with live segment speeds (an accident near Tacoma has slowed I-5).' },
        { at: 'engine', text: 'Search local cells around origin and destination, then jump across the precomputed overlay graph between cell boundaries: ~10K nodes settled instead of millions → ~20 ms.' },
        { from: 'route', to: 'eta', text: 'ETA model refines the travel time for each candidate route using live + historical speeds and time of day.' },
        { from: 'route', to: 'gw', text: 'Return routes: I-5 2h 58m (+12 min traffic), alternative via I-205 3h 02m.' },
        { from: 'gw', to: 'client', text: 'Polylines drawn on the map; navigation starts.' },
      ],
    },
    {
      id: 'traffic', name: 'Live traffic from GPS probes',
      steps: [
        { from: 'client', to: 'gw', text: 'Navigating phones batch anonymous GPS points (one every few seconds) and upload them every ~30 s.' },
        { from: 'gw', to: 'ingest', text: 'Gateway writes the batch to the probe stream; no response needed beyond an ack.' },
        { from: 'ingest', to: 'traffic', text: 'Stream job consumes points, keyed by region.' },
        { at: 'traffic', text: '**Map matching**: a hidden-Markov model snaps noisy points to the most likely sequence of road segments (handles parallel roads and overpasses).' },
        { at: 'traffic', text: 'Aggregate speeds per segment over the last few minutes; require several distinct devices before publishing; flag segments much slower than their historical profile as incidents.' },
        { from: 'traffic', to: 'speeds', text: 'Publish updated speeds for changed segments.' },
        { from: 'speeds', to: 'eta', text: 'ETA model and traffic overlay tiles pick up the new speeds; the routing engine re-customises its overlay with them on its next cycle.' },
      ],
    },
    {
      id: 'mapupdate', name: 'A new road opens (map data update)',
      steps: [
        { at: 'mapdb', text: 'Operators publish a new road and a changed turn restriction; a new map data version is cut.' },
        { from: 'mapdb', to: 'pipeline', text: 'The build pipeline computes which S2 regions changed.' },
        { at: 'pipeline', text: 'Regenerate only the affected tiles at every zoom (with per-zoom simplification), and re-run graph preprocessing only for the affected partition cells.' },
        { from: 'pipeline', to: 'tiles', text: 'Write new tiles under the new version prefix; unchanged tiles are aliased, not copied.' },
        { from: 'pipeline', to: 'places', text: 'Index the new street name for geocoding.' },
        { from: 'pipeline', to: 'engine', text: 'Routing servers load the new graph blob in the background and swap atomically (blue/green), so no query sees a half-built graph.' },
        { from: 'client', to: 'cdn', text: 'Clients learn the new version from config and start requesting `/tiles/v2026.42/…`; old versions age out of caches naturally — no purge needed.' },
      ],
    },
    {
      id: 'reroute', name: 'Rerouting during navigation',
      steps: [
        { at: 'client', text: 'Every few minutes (and immediately if the driver leaves the route), the app asks for a fresh route from its current position.' },
        { from: 'client', to: 'gw', text: 'Send current position, heading and the remaining route segment ids.' },
        { from: 'gw', to: 'route', text: 'Directions Service treats it as a new query from the current position.' },
        { from: 'route', to: 'engine', text: 'Compute the best path with the latest live weights.' },
        { from: 'route', to: 'eta', text: 'Compare ETA of the current route vs the new best.' },
        { at: 'route', text: 'Only suggest switching if the saving exceeds a threshold (e.g. > 3 min and > 5%) to avoid flip-flopping drivers between near-equal routes.' },
        { from: 'route', to: 'gw', text: 'Return "Faster route available, saves 8 min" or the unchanged route with an updated ETA.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🧱 Tiles: raster vs vector, and the zoom pyramid',
      md:
        "The Web Mercator world is a square. Zoom level *z* splits it into 2^z × 2^z tiles, so each level has **4×** the tiles of the one above:\n\n" +
        "| Zoom | Tiles | Typical view |\n|---|---|---|\n| 0 | 1 | Whole world |\n| 5 | 1,024 | Continent |\n| 10 | ~1M | City |\n| 15 | ~1.07B | Streets |\n| 18 | ~69B | Buildings |\n\n" +
        "Each level is **generalised**: at z5 a highway is a few points and small roads are dropped; at z15 every residential street is present. Labels and POIs are filtered by importance per zoom.",
      options: [
        { name: 'Pre-rendered raster tiles (PNG)', pros: ['Dumb clients; any device can show them', 'Simple CDN objects'], cons: ['Restyling (dark mode, language) needs a full re-render of billions of tiles', 'Rotation and 3D tilt look bad; labels rotate with the map', 'High-DPI screens need 2–3× bigger images; pre-rendering z18+ is enormous'] },
        { name: 'Vector tiles (geometry + attributes)', desc: 'Protobuf tiles with simplified geometry per layer; the device renders them with a style sheet.', pros: ['~2–5× smaller than raster for the same area', 'Restyle, rotate, tilt and change label language on the device', 'Over-zoom: z16 data can be displayed at z18–z21', 'One set of tiles serves every screen density'], cons: ['Needs a capable GPU renderer on every client', 'Label placement and text shaping run on the device'], chosen: true },
        { name: 'Render on demand only', pros: ['No storage for unseen tiles'], cons: ['High latency on first view, expensive CPU spikes when an area suddenly becomes popular'] },
      ],
      verdict:
        "Use **vector tiles pre-built up to ~z16**, versioned and immutable on the CDN, with on-device over-zoom for deeper levels. Keep a raster path for very low-end clients and for imagery (satellite) layers, which remain raster by nature. Most of the pyramid is ocean or empty land — store one shared \"empty\" tile for those.",
    },
    {
      title: '🧭 Routing at continental scale: from Dijkstra to overlay graphs',
      md:
        "A continental road graph has tens to hundreds of millions of nodes. **Dijkstra** settles every node closer than the destination — millions of nodes and seconds per query for a long trip. **A-star** search with a straight-line heuristic helps only modestly on road networks. The industrial answer is **preprocessing**:\n\n" +
        "- **Contraction Hierarchies (CH)**: order nodes by importance and \"contract\" unimportant ones, adding shortcut edges that preserve shortest distances. A query does a bidirectional search that only goes *upward* in importance; the two searches meet near the top (highways). Queries settle only a few hundred to few thousand nodes: **sub-millisecond**. Downside: changing edge weights (traffic) means re-contracting, which takes minutes.\n" +
        "- **Multi-level partitioning (CRP / customizable CH)**: cut the graph into cells (a few thousand nodes each, with few boundary nodes), recursively in several levels. Precompute, per cell, the shortest distances between its boundary nodes (an overlay \"clique\"). A query searches locally in the origin and destination cells and then over the overlay. When traffic changes, only the **customisation** step (recomputing cell cliques with new weights) runs — **seconds**, in parallel per cell.\n\n" +
        "Play the flow to see an overlay query.",
      diagram: {
        nodes: [
          { id: 'o', label: 'Origin', sub: 'snapped to segment', type: 'client', col: 0, row: 1, desc: 'Start point snapped to a road segment.' },
          { id: 'ca', label: 'Origin cell', sub: 'local Dijkstra', type: 'service', col: 1, row: 1, desc: 'Full-detail search inside the small cell containing the origin, to its boundary nodes.' },
          { id: 'l1', label: 'Level-1 overlay', sub: 'city-sized cells', type: 'cache', col: 2, row: 0, desc: 'Boundary-to-boundary distances precomputed for cells of ~thousands of nodes.' },
          { id: 'l2', label: 'Level-2 overlay', sub: 'region-sized cells', type: 'cache', col: 3, row: 0, desc: 'A coarser level over the level-1 boundaries: long trips cross the country in a few hundred overlay edges.' },
          { id: 'w', label: 'Live weights', sub: 'customisation', type: 'worker', col: 3, row: 2, desc: 'Every 1–2 min, recompute cell cliques with current segment speeds — only cells whose speeds changed, in parallel.' },
          { id: 'cb', label: 'Destination cell', sub: 'local Dijkstra', type: 'service', col: 4, row: 1, desc: 'Full-detail search from the boundary into the destination.' },
          { id: 'd', label: 'Destination', type: 'client', col: 5, row: 1, desc: 'End point.' },
          { id: 'unpack', label: 'Unpack path', sub: 'overlay → real roads', type: 'worker', col: 5, row: 2, desc: 'Expand overlay edges back into actual road segments for the polyline and turn instructions.' },
        ],
        edges: [
          { from: 'o', to: 'ca' }, { from: 'ca', to: 'l1' }, { from: 'l1', to: 'l2' }, { from: 'l2', to: 'cb' }, { from: 'cb', to: 'd' },
          { from: 'w', to: 'l1', label: 'update cliques' }, { from: 'w', to: 'l2' }, { from: 'd', to: 'unpack' },
        ],
        flows: [
          { id: 'q', name: 'Seattle → Portland query', steps: [
            { at: 'w', text: 'One minute ago, customisation updated cells around Tacoma with slower I-5 speeds.' },
            { from: 'o', to: 'ca', text: 'Search the origin cell in full detail until its boundary nodes are reached (~1K nodes).' },
            { from: 'ca', to: 'l1', text: 'Move up to the level-1 overlay: jump between boundary nodes using precomputed distances.' },
            { from: 'l1', to: 'l2', text: 'For the long middle section, use the coarser level-2 overlay — a few hundred edges for 280 km.' },
            { from: 'l2', to: 'cb', text: 'Descend near Portland and search the destination cell in detail.' },
            { from: 'cb', to: 'd', text: 'Shortest time found: ~10K nodes settled in total vs ~5M for plain Dijkstra.' },
            { from: 'd', to: 'unpack', text: 'Unpack overlay edges into real segments to draw the route and generate instructions.' },
          ] },
        ],
      },
      options: [
        { name: 'Dijkstra / A*', pros: ['No preprocessing; weights can change instantly'], cons: ['Seconds per long query; impossible at thousands of QPS'] },
        { name: 'Contraction Hierarchies', pros: ['Fastest queries (sub-ms)', 'Simple query algorithm'], cons: ['Weight changes require re-contraction (minutes) → awkward for live traffic'] },
        { name: 'Partition + overlay (CRP / CCH)', pros: ['Fast queries (ms)', 'Traffic updates via cheap, parallel re-customisation in seconds', 'Partition cells also become natural shards'], cons: ['More complex; slightly slower queries than pure CH'], chosen: true },
      ],
      verdict: 'Use a **partition-based overlay** (CRP or customizable CH) so live traffic can be applied every minute or two while keeping millisecond queries. Use plain CH for static profiles such as walking or cycling where weights rarely change.',
    },
    {
      title: '🚗 Live traffic and ETA prediction',
      md:
        "**From pings to speeds:** raw GPS is noisy (urban canyons, 10–30 m errors). Map matching uses a hidden-Markov model: candidate segments near each point are hidden states; transitions favour routes whose road distance matches the straight-line distance between consecutive points. The result is a sequence of segments with traversal times.\n\n" +
        "**Speeds per segment:** combine recent traversals (sliding window of a few minutes) with the segment's **historical profile** for this hour of the week; weight live data by sample count. Require a minimum number of distinct devices (privacy and robustness).\n\n" +
        "**ETA is a prediction, not a sum:** traffic changes during a 3-hour trip. ETA models predict the speed of each segment *at the time you will reach it*, mixing live and historical patterns. Google and DeepMind have described graph neural networks over \"supersegments\" (groups of adjacent segments) that improved ETA accuracy significantly in cities like Sydney and Berlin.\n\n" +
        "**Incidents:** sudden speed drops on a segment relative to its neighbours and history, user reports (Waze), and authority feeds generate closures that routing treats as infinite weight.",
    },
    {
      title: '🔎 Geocoding and reverse geocoding',
      md:
        "**Forward geocoding** is search with a geographic prior:\n\n" +
        "1. **Parse** free text into components (number, street, locality, postcode, country) — rule-based plus ML parsers trained per country, since address formats differ wildly (Japan uses block numbers, the UK has postcodes that pin a few houses).\n" +
        "2. **Retrieve** candidates from an inverted index of names and aliases (\"St\" = \"Street\", \"München\" = \"Munich\").\n" +
        "3. **Interpolate** house numbers along street segments when no exact address point exists.\n" +
        "4. **Rank** by text similarity, distance from the user/viewport, and prominence.\n\n" +
        "**Reverse geocoding** (point → address) is a spatial lookup: find the S2 cells around the point, fetch nearby address points and street segments, and choose the nearest plausible one (respecting which side of the street). Results are cacheable per small cell.",
    },
    {
      title: '🧩 Sharding the road graph and handling long routes',
      md:
        "Should every routing server hold the whole world graph?\n\n" +
        "- **Memory:** a continent-sized graph with preprocessing data is tens of GB; the planet is larger but still fits on big-memory servers. Many systems run **one graph per continent/region** (routes do not cross oceans by road) and replicate it for throughput.\n" +
        "- **Partition by cells:** the same multi-level partition used for the algorithm gives natural shards: fine cells live on regional servers; the **top-level overlay is small** and replicated everywhere, so a cross-country query touches the origin shard, the overlay, and the destination shard.\n" +
        "- **Separate graphs per profile:** car, truck (height/weight limits), bike and walk have different edges and weights, so they are distinct preprocessed artefacts.\n" +
        "- **Deployment:** graphs are immutable blobs produced by the pipeline; servers load the new blob alongside the old and switch atomically, while live weights are customised in place every minute.",
    },
  ],
  scaling: [
    { stage: '🌱 One city', md: 'Raster tiles rendered by Mapnik from PostGIS on demand and cached by NGINX; routing via an open-source engine (OSRM/GraphHopper) on one machine; geocoding with Nominatim. No live traffic.' },
    { stage: '🌿 One country', md: 'Pre-render tiles for popular zooms and put a CDN in front; precomputed CH graph in memory with replicas; historical speed profiles for ETAs; a proper address parser and search index.' },
    { stage: '🌳 Planet, hundreds of millions of users', md: 'Vector tiles with on-device rendering and over-zoom, versioned immutable tiles on a global CDN, incremental map build pipeline, partition-based routing with minute-level traffic customisation, streaming probe pipeline, ML ETAs.' },
    { stage: '🌍 Beyond', md: 'Offline maps (downloaded vector tile packs + on-device routing graph for a region), live lane-level guidance, multimodal routing that combines transit timetables with walking graphs, and per-region serving close to users.' },
  ],
  tradeoffs: [
    { decision: 'Tile format', chosen: 'Vector tiles rendered on device', alternative: 'Raster PNG tiles', why: 'Smaller, restylable, rotatable, sharp at any DPI, and over-zoomable so deep levels need not be stored.' },
    { decision: 'Tile invalidation', chosen: 'Versioned immutable URLs', alternative: 'CDN purges on change', why: 'Purging billions of objects is slow and error-prone; new versions simply replace old ones as clients switch.' },
    { decision: 'Routing algorithm', chosen: 'Partition + overlay with customisation', alternative: 'Contraction hierarchies', why: 'Live traffic changes weights every minute; customisation takes seconds while CH would need re-contraction.' },
    { decision: 'Traffic freshness', chosen: '~1–2 min aggregation windows', alternative: 'Per-ping real-time updates', why: 'Single pings are noisy and privacy-sensitive; small windows with minimum device counts give stable, private speeds.' },
    { decision: 'ETA', chosen: 'ML model over live + historical speeds', alternative: 'Sum of current segment times', why: 'Traffic evolves during the trip; predicting future segment speeds is far more accurate on long drives.' },
    { decision: 'Reroute policy', chosen: 'Switch only above a savings threshold', alternative: 'Always take the current best', why: 'Avoids oscillation between near-equal routes and confusing drivers.' },
  ],
  failures: [
    { node: 'cdn', scenario: 'CDN region degraded', impact: 'Tile latency jumps; blank squares while panning.', mitigation: 'Multi-CDN / anycast failover, large on-device caches, prefetch tiles around the viewport and along the active route, low-zoom tiles bundled in the app.' },
    { node: 'engine', scenario: 'Routing servers for a region crash or load a bad graph', impact: 'Directions fail or return absurd routes.', mitigation: 'Blue/green graph rollout with automated sanity checks (known-route regression tests), keep the previous graph loaded for instant rollback, replicas across zones.' },
    { node: 'traffic', scenario: 'Traffic pipeline lags 20 minutes', impact: 'Traffic colours and ETAs reflect old conditions; routes miss a new jam.', mitigation: 'Speeds carry timestamps; when stale, blend toward historical profiles instead of trusting old live data; alert on pipeline lag.' },
    { node: 'speeds', scenario: 'Corrupted speed data (e.g. a bug publishes 0 km/h for a highway)', impact: 'Routing avoids major roads; ETAs explode.', mitigation: 'Validate against historical bounds and neighbour segments before publishing; cap the change rate per segment; quick kill-switch to historical-only mode.' },
    { node: 'pipeline', scenario: 'Bad map data version (a bridge deleted by mistake)', impact: 'Wrong tiles and routes everywhere that version is served.', mitigation: 'Automated diff checks (large deletions need review), staged rollout of map versions by region, and versioned artefacts allowing instant rollback.' },
    { node: 'ingest', scenario: 'Probe ingest overwhelmed during a major event', impact: 'Traffic data gaps.', mitigation: 'Sample probes in dense areas (you do not need every phone on a jammed highway), backpressure clients via longer upload intervals, partition the stream by region.' },
  ],
  interviewTips: [
    'Split the problem early into **tiles**, **routing** and **search**, all derived from one map database by offline pipelines.',
    'Do the tile pyramid math (4^z) and explain why vector tiles + over-zoom avoid storing the deepest levels.',
    'Explain why plain Dijkstra is too slow and name a preprocessing technique; bonus points for explaining how live traffic fits (customisation).',
    'Describe the probe → map matching → segment speed → ETA pipeline and its privacy safeguards.',
    'Mention versioned, immutable tile URLs — it is a clean answer to CDN cache invalidation.',
  ],
  concepts: ['cdn', 'spatial-indexing', 'caching-strategies', 'batch-vs-stream-processing', 'database-sharding', 'data-replication', 'message-queues', 'back-of-envelope-estimation'],
  realWorld: [
    'Google Maps switched its mobile clients to **vector-based rendering** around 2010–2013; Mapbox popularised the open **Mapbox Vector Tile** format and OpenMapTiles.',
    'Contraction hierarchies and Customizable Route Planning came out of academic work at KIT and Microsoft Research; open-source engines **OSRM** and **GraphHopper** implement CH/MLD.',
    'Google and DeepMind published work on **graph neural networks for ETA** using supersegments.',
    'Waze combines probe data with crowd-sourced incident reports, which Google Maps also consumes.',
  ],
  quiz: [
    { q: 'Roughly how many tiles exist at zoom level 15 in a Web Mercator pyramid?', options: ['~32 thousand', '~1 million', '~1 billion', '~1 trillion'], answer: 2, explain: '2^15 × 2^15 = 4^15 ≈ 1.07 billion tiles; every zoom level multiplies the count by 4.' },
    { q: 'Why can a vector-tile map show zoom 19 without storing tiles for zoom 19?', options: ['It downloads satellite imagery instead', 'The device over-zooms z16 vector geometry, which stays sharp because it is drawn, not scaled pixels', 'Zoom 19 does not exist', 'The CDN generates them on the fly'], answer: 1, explain: 'Vector geometry can be rendered at any scale; detail stops increasing past the deepest built level but remains crisp.' },
    { q: 'Traffic changes every minute. Why are contraction hierarchies awkward for live traffic, compared with partition-based overlays (CRP)?', options: ['CH cannot handle one-way streets', 'CH must re-contract when weights change (minutes); CRP only re-customises affected cells in seconds', 'CH uses more bandwidth', 'CRP does not need any preprocessing'], answer: 1, explain: 'CRP separates topology preprocessing (rare) from metric customisation (frequent and fast), which suits changing weights.' },
    { q: 'How should the tile CDN handle a new map data release?', options: ['Purge every tile globally', 'Publish tiles under a new version path; clients switch to the new version and old tiles expire naturally', 'Set TTL to zero', 'Only update the origin'], answer: 1, explain: 'Versioned immutable URLs avoid mass invalidation and make rollback trivial.' },
    { q: 'Why is a single GPS ping not used directly to set a road\'s speed?', options: ['GPS is always accurate, but slow', 'Pings are noisy and could identify individuals; aggregating map-matched traversals over a window with minimum device counts gives robust, private speeds', 'Roads have no speed', 'Phones cannot send speed'], answer: 1, explain: 'Map matching and aggregation remove noise; minimum-count thresholds also protect privacy.' },
    { q: 'During navigation a route 1 minute faster appears. What should the system usually do?', options: ['Always reroute immediately', 'Keep the current route unless savings exceed a threshold, to avoid flip-flopping', 'Ask the user every 10 seconds', 'Stop navigation'], answer: 1, explain: 'Small savings are within ETA error; hysteresis prevents oscillating between near-equal routes.' },
  ],
  references: [
    { title: 'Customizable Route Planning (Microsoft Research)', url: 'https://www.microsoft.com/en-us/research/publication/customizable-route-planning/' },
    { title: 'DeepMind: Traffic prediction with advanced graph neural networks', url: 'https://deepmind.google/discover/blog/traffic-prediction-with-advanced-graph-neural-networks/' },
    { title: 'Design Google Maps (video)', url: 'https://www.youtube.com/results?search_query=design+google+maps+system+design' },
  ],
});
