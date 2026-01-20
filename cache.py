"""
Cache module for map data.

Caches OSMnx graph and feature data to avoid repeated API calls.
Cache key format: {city}_{country}_{distance}
"""

import os
import pickle
import json
import hashlib
from datetime import datetime, timedelta
from pathlib import Path

CACHE_DIR = Path("cache")
CACHE_EXPIRY_DAYS = 30


def get_cache_key(city: str, country: str, distance: int) -> str:
    """Generate a normalized cache key."""
    city_slug = city.lower().replace(" ", "_").replace(",", "")
    country_slug = country.lower().replace(" ", "_")
    return f"{city_slug}_{country_slug}_{distance}"


def get_cache_path(cache_key: str) -> Path:
    """Get the directory path for a cache entry."""
    return CACHE_DIR / cache_key


def is_cache_valid(cache_key: str) -> bool:
    """Check if cache exists and is not expired."""
    cache_path = get_cache_path(cache_key)
    meta_file = cache_path / "meta.json"

    if not meta_file.exists():
        return False

    try:
        with open(meta_file, "r") as f:
            meta = json.load(f)

        cached_time = datetime.fromisoformat(meta["cached_at"])
        expiry_time = cached_time + timedelta(days=CACHE_EXPIRY_DAYS)

        if datetime.now() > expiry_time:
            print(f"  Cache expired (cached {meta['cached_at']})")
            return False

        # Check that all data files exist
        required_files = ["graph.pkl", "meta.json"]
        for f in required_files:
            if not (cache_path / f).exists():
                return False

        return True
    except Exception as e:
        print(f"  Cache validation error: {e}")
        return False


def load_from_cache(cache_key: str):
    """
    Load cached map data.

    Returns:
        dict with keys: graph, water, parks, coords, city, country, distance
        or None if cache miss
    """
    if not is_cache_valid(cache_key):
        return None

    cache_path = get_cache_path(cache_key)

    try:
        # Load metadata
        with open(cache_path / "meta.json", "r") as f:
            meta = json.load(f)

        # Load graph
        with open(cache_path / "graph.pkl", "rb") as f:
            graph = pickle.load(f)

        # Load water (optional)
        water = None
        water_file = cache_path / "water.pkl"
        if water_file.exists():
            with open(water_file, "rb") as f:
                water = pickle.load(f)

        # Load parks (optional)
        parks = None
        parks_file = cache_path / "parks.pkl"
        if parks_file.exists():
            with open(parks_file, "rb") as f:
                parks = pickle.load(f)

        return {
            "graph": graph,
            "water": water,
            "parks": parks,
            "coords": tuple(meta["coords"]),
            "city": meta["city"],
            "country": meta["country"],
            "distance": meta["distance"],
            "cached_at": meta["cached_at"],
        }
    except Exception as e:
        print(f"  Cache load error: {e}")
        return None


def save_to_cache(cache_key: str, graph, water, parks, coords, city: str, country: str, distance: int):
    """Save map data to cache."""
    cache_path = get_cache_path(cache_key)
    cache_path.mkdir(parents=True, exist_ok=True)

    try:
        # Save graph
        with open(cache_path / "graph.pkl", "wb") as f:
            pickle.dump(graph, f)

        # Save water (if exists)
        if water is not None:
            with open(cache_path / "water.pkl", "wb") as f:
                pickle.dump(water, f)

        # Save parks (if exists)
        if parks is not None:
            with open(cache_path / "parks.pkl", "wb") as f:
                pickle.dump(parks, f)

        # Save metadata
        meta = {
            "city": city,
            "country": country,
            "distance": distance,
            "coords": list(coords),
            "cached_at": datetime.now().isoformat(),
        }
        with open(cache_path / "meta.json", "w") as f:
            json.dump(meta, f, indent=2)

        print(f"✓ Saved to cache: {cache_key}")
        return True
    except Exception as e:
        print(f"  Cache save error: {e}")
        return False


def find_cached_location(city: str, country: str):
    """
    Find any cached data for a city/country pair (any distance).
    Useful for fast retheme operations.

    Returns:
        dict with cache metadata if found, None otherwise
    """
    if not CACHE_DIR.exists():
        return None

    city_slug = city.lower().replace(" ", "_").replace(",", "")
    country_slug = country.lower().replace(" ", "_")
    prefix = f"{city_slug}_{country_slug}_"

    for entry in CACHE_DIR.iterdir():
        if entry.is_dir() and entry.name.startswith(prefix):
            meta_file = entry / "meta.json"
            if meta_file.exists():
                try:
                    with open(meta_file, "r") as f:
                        meta = json.load(f)
                    # Return the first valid cache found
                    meta["cache_key"] = entry.name
                    return meta
                except:
                    continue
    return None


def clear_cache(cache_key: str = None):
    """Clear cache. If cache_key is None, clear all."""
    import shutil

    if cache_key:
        cache_path = get_cache_path(cache_key)
        if cache_path.exists():
            shutil.rmtree(cache_path)
            print(f"✓ Cleared cache: {cache_key}")
    else:
        if CACHE_DIR.exists():
            shutil.rmtree(CACHE_DIR)
            CACHE_DIR.mkdir()
            print("✓ Cleared all cache")


def list_cache():
    """List all cached locations."""
    if not CACHE_DIR.exists():
        print("No cache directory")
        return []

    entries = []
    for entry in CACHE_DIR.iterdir():
        if entry.is_dir():
            meta_file = entry / "meta.json"
            if meta_file.exists():
                with open(meta_file, "r") as f:
                    meta = json.load(f)
                entries.append(meta)

    return entries
