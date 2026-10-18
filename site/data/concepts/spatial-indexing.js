SD.concept({
  id: 'spatial-indexing',
  category: 'database',
  order: 11,
  icon: '🗺️',
  title: 'Spatial Indexing',
  tagline: 'Geohash, quadtrees, S2/H3 and R-trees turn "what is near me?" from a full scan into a few cell lookups.',
  summary:
    '"Find drivers within 2 km" or "restaurants in this map viewport" are **two-dimensional** range queries. A normal B-tree index on `lat` and `lng` handles one dimension well, but combining two ranges still scans a wide strip of the planet — far too slow for Uber-scale (millions of moving points, thousands of searches per second).\n\n' +
    '**Spatial indexes** solve this by mapping 2-D space into **cells** that can be looked up quickly:\n\n' +
    '- **Geohash** — encode lat/lng as a base-32 string; nearby points share prefixes. Works on any key-value store or B-tree.\n' +
    '- **Quadtree** — recursively split a square into 4 until each cell holds ≤ K points; adapts to density.\n' +
    '- **Google S2** — project the sphere onto a cube, order cells along a Hilbert curve; 64-bit cell ids.\n' +
    '- **Uber H3** — hierarchical **hexagons**; every neighbour is equidistant, ideal for surge pricing and dispatch.\n' +
    '- **R-tree** — nested bounding rectangles; the classic for polygons and shapes (PostGIS, Oracle Spatial).',
  analogy:
    'Finding the nearest coffee shop in a city. Without an index you would check every shop\'s address. With a grid map, you look only at your own square and the 8 squares around it. ' +
    'A quadtree is a smart map that uses tiny squares downtown (many shops) and big squares in the suburbs (few shops), so every square holds a manageable handful.',
  sections: [
    {
      h: 'Geohash',
      md: 'Geohash interleaves the bits of longitude and latitude (repeatedly halving the world) and encodes them in base-32. Each extra character subdivides the cell into 32 smaller ones:',
      table: {
        headers: ['Length', 'Cell size (approx, at equator)', 'Typical use'],
        rows: [
          ['4', '39 km × 20 km', 'City / region'],
          ['5', '4.9 km × 4.9 km', 'Coarse "nearby" searches'],
          ['6', '1.2 km × 0.6 km', 'Ride-hailing / food delivery radius'],
          ['7', '153 m × 153 m', 'Neighbourhood, store search'],
          ['8', '38 m × 19 m', 'Building level'],
        ],
      },
      callout: { type: 'warn', md: '**Edge problem:** two points a metre apart can sit on opposite sides of a cell boundary and share no prefix (worst at the equator/prime meridian, where even the first character differs). Always search the **target cell plus its 8 neighbours**, then filter by true distance (haversine).' },
    },
    {
      h: 'Quadtree',
      md: 'Start with one square covering the map. If it holds more than K points (say 100), split it into 4 children; repeat. Dense Manhattan ends up with tiny cells; empty ocean stays one big cell.\n\n' +
        '- **Search:** descend to the leaf containing the user, collect points; if fewer than needed, expand to neighbouring leaves.\n' +
        '- **Memory:** 200M businesses × ~30 bytes (id + lat/lng) ≈ 6 GB of leaves + a few hundred MB of internal nodes — fits on one server, so replicate the whole tree to each search server.\n' +
        '- **Updates:** fine for slowly changing data (restaurants). For millions of moving drivers, rebalancing a tree constantly is expensive — fixed grids (geohash/H3) with a hash map per cell are simpler.',
    },
    {
      h: 'S2 and H3: hierarchical cells on a sphere',
      md: '**S2 (Google):** projects Earth onto the 6 faces of a cube, recursively quarters each face (levels 0–30; level 30 ≈ 1 cm²), and numbers cells along a **Hilbert curve**, so nearby cells usually have nearby 64-bit ids. A region (circle, polygon) is approximated by a small *cell covering* — a handful of id ranges to scan in a sorted store. Used by Google Maps, MongoDB `2dsphere`, Foursquare, Pokémon Go.\n\n' +
        '**H3 (Uber):** tiles the globe with **hexagons** at 16 resolutions (res 7 ≈ 5 km², res 9 ≈ 0.1 km²). Hexagons have one kind of neighbour (all 6 at the same distance), unlike squares (edge vs corner neighbours), which makes "k-ring" searches, smoothing and aggregations (demand per cell, surge pricing) clean. Each cell id is a 64-bit integer — a perfect hash or shard key.\n\n' +
        '**R-tree:** groups nearby objects into minimum bounding rectangles, nested hierarchically (like a B-tree for boxes). Best for **shapes** — delivery zones, building footprints, "which polygon contains this point?". PostgreSQL implements it via GiST (PostGIS).',
    },
    {
      h: 'Putting it together: proximity search at scale',
      md: '1. **Pick resolution from the search radius:** cell size ≈ radius, so center + neighbours covers the circle.\n' +
        '1. **Store cell → items:** Redis `GEOADD` (geohash in a sorted set), a hash map `h3_cell → {driver ids}`, or a DB column with a B-tree index on the geohash/S2 id.\n' +
        '1. **Query:** compute the user\'s cell, fetch the cell + neighbours (k-ring), filter by exact distance, rank (distance, rating, ETA).\n' +
        '1. **Moving objects:** drivers report every ~4 s; update the in-memory index in place, keep history asynchronously. Shard by region/cell id so each server owns a geographic area.\n' +
        '1. **Hot spots:** an airport or stadium cell can be 1000× denser — use finer resolution there (quadtree-like adaptivity) or split hot cells across shards.',
    },
  ],
  diagram: {
    intro: 'A ride-hailing style proximity service. Drivers stream locations into an in-memory cell index; riders query their cell plus neighbours.',
    nodes: [
      { id: 'driver', label: 'Driver App', type: 'client', col: 0, row: 0.5, desc: 'Sends `{driver_id, lat, lng}` every ~4 seconds while online.' },
      { id: 'rider', label: 'Rider App', type: 'client', col: 0, row: 3, desc: 'Asks for nearby available drivers and an ETA.' },
      { id: 'ingest', label: 'Location Ingest', type: 'service', col: 1.6, row: 0.5, multi: true, desc: 'Validates updates and computes the H3 cell (res 9) for each position. Publishes to the stream for history and analytics.' },
      { id: 'search', label: 'Nearby Service', type: 'service', col: 1.6, row: 3, multi: true, desc: 'Computes the rider\'s cell and a k-ring of neighbours, fetches candidates, filters by haversine distance, ranks by ETA.' },
      { id: 'geo', label: 'Geo Index', sub: 'cell → driver ids', type: 'cache', col: 3.3, row: 1.75, desc: 'In-memory map from H3/geohash cell to the set of drivers in it, plus driver → current cell. Sharded by region. Entries expire if a driver stops reporting.', tech: ['Redis GEO', 'in-memory H3 map', 'Elasticsearch geo'] },
      { id: 'stream', label: 'Location Stream', type: 'queue', col: 3.3, row: 0, desc: 'Durable feed of all location updates for trip tracking, ETA models and heatmaps.', tech: ['Kafka'] },
      { id: 'pg', label: 'Places DB', sub: 'PostGIS R-tree', type: 'db', col: 5, row: 3, desc: 'Static geometry: city boundaries, airport pickup zones, surge areas. Point-in-polygon via a GiST (R-tree) index.', tech: ['PostGIS'] },
      { id: 'eta', label: 'ETA / Routing', type: 'ml', col: 5, row: 1.75, desc: 'Road-network travel time for the top candidates — straight-line distance is not driving distance.' },
    ],
    edges: [
      { from: 'driver', to: 'ingest', label: 'loc every 4 s' },
      { from: 'ingest', to: 'geo', label: 'move cell' },
      { from: 'ingest', to: 'stream', async: true },
      { from: 'rider', to: 'search', label: 'nearby?' },
      { from: 'search', to: 'geo', label: 'k-ring cells' },
      { from: 'search', to: 'pg', label: 'zone lookup' },
      { from: 'geo', to: 'eta', label: 'candidates' },
    ],
    flows: [
      {
        id: 'update', name: 'Driver location update',
        steps: [
          { from: 'driver', to: 'ingest', text: 'Driver 77 reports (37.7793, −122.4193).' },
          { at: 'ingest', text: 'Compute H3 res-9 cell `8928308280fffff` (~0.1 km²).' },
          { from: 'ingest', to: 'geo', text: 'Driver moved from a neighbouring cell: remove from the old cell set, add to the new one, refresh TTL.' },
          { from: 'ingest', to: 'stream', text: 'Publish the raw update for trip tracking and analytics (async).' },
        ],
      },
      {
        id: 'nearby', name: 'Find nearby drivers',
        steps: [
          { from: 'rider', to: 'search', text: 'Rider at (37.7790, −122.4180) requests a ride.' },
          { from: 'search', to: 'pg', text: 'Point-in-polygon: rider is inside the "SF downtown" zone; airport rules do not apply.' },
          { at: 'search', text: 'Compute the rider\'s cell and its k-ring of radius 2 (19 hexagons ≈ 1 km around).' },
          { from: 'search', to: 'geo', text: 'Fetch driver ids from those 19 cells — ~40 candidates instead of the whole city\'s 20,000.' },
          { at: 'search', text: 'Filter by exact haversine distance and availability; keep the top 10.' },
          { from: 'geo', to: 'eta', text: 'Compute road ETAs for the 10 candidates; return the best few to dispatch.' },
          { from: 'search', to: 'rider', text: 'Rider sees nearby cars and an ETA within ~100 ms.' },
        ],
      },
    ],
  },
  compare: {
    title: 'Spatial index comparison',
    headers: ['Index', 'Cell shape', 'Adapts to density', 'Updates', 'Best for', 'Used by'],
    rows: [
      ['Geohash', 'Rectangles (base-32 prefixes)', 'No (fixed precision)', 'Cheap — just recompute string', 'Simple proximity on any KV/B-tree store', 'Redis GEO, Elasticsearch, DynamoDB geo libs'],
      ['Quadtree', 'Squares, recursive', 'Yes', 'Costly to rebalance', 'Static-ish points with uneven density', 'Yelp-style search, game engines'],
      ['S2', 'Quadrilaterals on a cube-sphere, Hilbert-ordered', 'Multi-level coverings', 'Cheap (cell id)', 'Region coverings, global accuracy', 'Google Maps, MongoDB 2dsphere, Foursquare'],
      ['H3', 'Hexagons, 16 resolutions', 'Multi-resolution', 'Cheap (cell id)', 'Moving objects, aggregation, surge/demand', 'Uber, DoorDash, Foursquare'],
      ['R-tree', 'Bounding rectangles, hierarchical', 'Yes', 'Moderate (splits)', 'Polygons, lines, containment', 'PostGIS (GiST), SQLite, Oracle Spatial'],
    ],
  },
  keyPoints: [
    'Spatial indexes map 2-D space to cells so "near me" becomes a few lookups.',
    'Geohash: shared prefix ≈ proximity, but always search the 8 neighbouring cells.',
    'Quadtrees adapt to density; great for mostly static points.',
    'S2 (Hilbert curve) and H3 (hexagons) give hierarchical integer cell ids — ideal shard keys.',
    'R-trees are the choice for polygons and containment queries.',
    'Always finish with an exact distance filter and road-based ETA.',
  ],
  pitfalls: [
    'Using separate B-tree indexes on lat and lng and expecting fast radius queries.',
    'Searching only the user\'s own geohash cell and missing results just across the boundary.',
    'Treating degrees as uniform distance — a degree of longitude shrinks toward the poles.',
    'Rebuilding a quadtree on every driver movement instead of using fixed cells for moving objects.',
    'Hot cells (airports, stadiums) overwhelming a single shard.',
  ],
  realWorld: [
    '**Uber** open-sourced **H3** and uses it for dispatch, surge pricing and marketplace analytics.',
    '**Google** uses **S2** across Maps and other geo products; **MongoDB** `2dsphere` indexes are built on S2.',
    '**Redis** `GEOADD`/`GEOSEARCH` store 52-bit geohashes as sorted-set scores.',
    '**Yelp**-style business search is the classic quadtree interview example; **PostGIS** powers countless GIS backends with R-trees.',
  ],
  related: ['database-indexes', 'database-sharding', 'database-types', 'consistent-hashing'],
  quiz: [
    { q: 'Why search the 8 neighbouring geohash cells in addition to the user\'s own?', options: ['To increase cache hits', 'Nearby points can fall just across a cell boundary and have different prefixes', 'Geohash is inaccurate', 'To sort results'], answer: 1, explain: 'Prefix similarity implies proximity, but proximity does not imply a shared prefix at boundaries.' },
    { q: 'Why does Uber prefer hexagons (H3) for aggregations like demand per area?', options: ['Hexagons are smaller', 'All 6 neighbours are equidistant, avoiding the edge vs corner asymmetry of squares', 'They compress better', 'They need no ids'], answer: 1, explain: 'Uniform neighbour distance makes k-ring searches and smoothing consistent across directions.' },
    { q: 'Which structure best answers "which delivery zone polygon contains this point?"', options: ['Geohash prefix scan', 'R-tree (e.g. PostGIS GiST)', 'Hash index', 'Bloom filter'], answer: 1, explain: 'R-trees index bounding boxes of shapes and efficiently prune candidates for containment tests.' },
    { q: 'A quadtree splits a cell when it exceeds 100 points. What happens in a dense downtown area?', options: ['Cells stay large', 'The tree goes deeper there, producing many small cells', 'Points are dropped', 'The whole tree rebalances to equal depth'], answer: 1, explain: 'Quadtrees adapt: dense regions subdivide further so each leaf stays small.' },
  ],
  references: [
    { title: 'Uber Engineering — H3: Uber\'s Hexagonal Hierarchical Spatial Index', url: 'https://www.uber.com/blog/h3/' },
    { title: 'S2 Geometry library', url: 'https://s2geometry.io/' },
    { title: 'Geohash (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Geohash' },
    { title: 'Guttman (1984) — R-Trees: A Dynamic Index Structure for Spatial Searching', url: 'https://dl.acm.org/doi/10.1145/602259.602266' },
  ],
});
