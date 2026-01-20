# TODO List - City Map Poster Generator

## ✅ Local Caching for Map Data (COMPLETED)

**Status:** Implemented in `cache.py`

### Implementation Details
- **Storage:** Pickle files (not SQLite - simpler, no dependencies)
- **Cache key:** `{city}_{country}_{distance}` (normalized/slugified)
- **Stored data:** street graph, water features, parks (as pickled objects)
- **Metadata:** JSON file with coordinates, timestamp, city/country
- **Cache expiry:** 30 days
- **Location:** `cache/` directory

### Results
- Theme swaps for cached locations: **~0.87 seconds** (down from 2-3 minutes)
- Skips both geocoding and OSM API calls on cache hit
- Add `--no-cache` flag to bypass cache when needed

---

## ✅ Retheme Optimization (COMPLETED)

**Status:** Achieved through caching implementation

### Results
- Previous: 2-3 minutes per retheme (re-fetched all data)
- Now: **< 1 second** for cached locations
- Cached coordinates skip Nominatim geocoding
- Cached map data skips Overpass API calls

---

## Future Ideas

- [ ] Pre-generate popular cities on server startup
- [ ] Add more Overpass API endpoints for better load balancing
- [ ] WebSocket for real-time progress updates instead of polling
- [ ] Queue system for handling multiple concurrent requests
- [ ] Thumbnail previews before full generation
