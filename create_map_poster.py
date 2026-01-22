import osmnx as ox
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
import matplotlib.colors as mcolors
import numpy as np
from geopy.geocoders import Nominatim
from tqdm import tqdm
import time
import json
import os
from datetime import datetime
import argparse

from cache import get_cache_key, load_from_cache, save_to_cache, is_cache_valid, get_cache_path, find_cached_location

THEMES_DIR = "themes"
FONTS_DIR = "fonts"
POSTERS_DIR = "posters"

def get_city_text_layout(city_name, max_width_chars=10):
    """
    Calculate optimal text layout for city name.
    Returns dict with lines, font_size, and y_positions.

    For short names: single line, full size
    For medium names: single line, reduced size
    For long/multi-word names: multiple lines
    """
    # Base font size for short names (≤8 chars)
    base_font_size = 60
    min_font_size = 28

    words = city_name.upper().split()
    total_chars = len(city_name.replace(" ", ""))

    # Single word or short name - use single line with adjusted size
    if len(words) == 1 or total_chars <= 8:
        # Scale font size based on character count
        if total_chars <= 8:
            font_size = base_font_size
        elif total_chars <= 12:
            font_size = int(base_font_size * 8 / total_chars)
        else:
            font_size = max(min_font_size, int(base_font_size * 8 / total_chars))

        spaced_text = "  ".join(list(city_name.upper().replace(" ", "")))
        return {
            'lines': [spaced_text],
            'font_size': font_size,
            'y_positions': [0.14],
            'line_spacing': 0
        }

    # Multi-word name - split into lines
    lines = ["  ".join(list(word)) for word in words]

    # Calculate font size based on longest line
    max_line_chars = max(len(word) for word in words)
    if max_line_chars <= 8:
        font_size = base_font_size
    elif max_line_chars <= 12:
        font_size = int(base_font_size * 8 / max_line_chars)
    else:
        font_size = max(min_font_size, int(base_font_size * 8 / max_line_chars))

    # Calculate y positions (stack lines from bottom)
    line_spacing = font_size * 0.0012  # Proportional spacing
    base_y = 0.14
    y_positions = []
    for i in range(len(lines)):
        y_positions.append(base_y + (len(lines) - 1 - i) * line_spacing)

    return {
        'lines': lines,
        'font_size': font_size,
        'y_positions': y_positions,
        'line_spacing': line_spacing
    }

def load_fonts():
    """
    Load Roboto fonts from the fonts directory.
    Returns dict with font paths for different weights.
    """
    fonts = {
        'bold': os.path.join(FONTS_DIR, 'Roboto-Bold.ttf'),
        'regular': os.path.join(FONTS_DIR, 'Roboto-Regular.ttf'),
        'light': os.path.join(FONTS_DIR, 'Roboto-Light.ttf')
    }
    
    # Verify fonts exist
    for weight, path in fonts.items():
        if not os.path.exists(path):
            print(f"⚠ Font not found: {path}")
            return None
    
    return fonts

FONTS = load_fonts()

def generate_output_filename(city, theme_name, distance):
    """
    Generate unique output filename with city, theme, distance, and datetime.
    """
    if not os.path.exists(POSTERS_DIR):
        os.makedirs(POSTERS_DIR)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    city_slug = city.lower().replace(' ', '_')
    dist_km = f"{distance/1000:.1f}km".replace('.0km', 'km')
    filename = f"{city_slug}_{theme_name}_{dist_km}_{timestamp}.png"
    return os.path.join(POSTERS_DIR, filename)

def get_available_themes():
    """
    Scans the themes directory and returns a list of available theme names.
    """
    if not os.path.exists(THEMES_DIR):
        os.makedirs(THEMES_DIR)
        return []
    
    themes = []
    for file in sorted(os.listdir(THEMES_DIR)):
        if file.endswith('.json'):
            theme_name = file[:-5]  # Remove .json extension
            themes.append(theme_name)
    return themes

def load_theme(theme_name="feature_based"):
    """
    Load theme from JSON file in themes directory.
    """
    theme_file = os.path.join(THEMES_DIR, f"{theme_name}.json")
    
    if not os.path.exists(theme_file):
        print(f"⚠ Theme file '{theme_file}' not found. Using default feature_based theme.")
        # Fallback to embedded default theme
        return {
            "name": "Feature-Based Shading",
            "bg": "#FFFFFF",
            "text": "#000000",
            "gradient_color": "#FFFFFF",
            "water": "#C0C0C0",
            "parks": "#F0F0F0",
            "road_motorway": "#0A0A0A",
            "road_primary": "#1A1A1A",
            "road_secondary": "#2A2A2A",
            "road_tertiary": "#3A3A3A",
            "road_residential": "#4A4A4A",
            "road_default": "#3A3A3A"
        }
    
    with open(theme_file, 'r') as f:
        theme = json.load(f)
        print(f"✓ Loaded theme: {theme.get('name', theme_name)}")
        if 'description' in theme:
            print(f"  {theme['description']}")
        return theme

# Load theme (can be changed via command line or input)
THEME = None  # Will be loaded later

def create_gradient_fade(ax, color, location='bottom', zorder=10):
    """
    Creates a fade effect at the top or bottom of the map.
    """
    vals = np.linspace(0, 1, 256).reshape(-1, 1)
    gradient = np.hstack((vals, vals))
    
    rgb = mcolors.to_rgb(color)
    my_colors = np.zeros((256, 4))
    my_colors[:, 0] = rgb[0]
    my_colors[:, 1] = rgb[1]
    my_colors[:, 2] = rgb[2]
    
    if location == 'bottom':
        my_colors[:, 3] = np.linspace(1, 0, 256)
        extent_y_start = 0
        extent_y_end = 0.25
    else:
        my_colors[:, 3] = np.linspace(0, 1, 256)
        extent_y_start = 0.75
        extent_y_end = 1.0

    custom_cmap = mcolors.ListedColormap(my_colors)
    
    xlim = ax.get_xlim()
    ylim = ax.get_ylim()
    y_range = ylim[1] - ylim[0]
    
    y_bottom = ylim[0] + y_range * extent_y_start
    y_top = ylim[0] + y_range * extent_y_end
    
    ax.imshow(gradient, extent=[xlim[0], xlim[1], y_bottom, y_top], 
              aspect='auto', cmap=custom_cmap, zorder=zorder, origin='lower')

def get_edge_colors_by_type(G):
    """
    Assigns colors to edges based on road type hierarchy.
    Returns a list of colors corresponding to each edge in the graph.
    """
    edge_colors = []
    
    for u, v, data in G.edges(data=True):
        # Get the highway type (can be a list or string)
        highway = data.get('highway', 'unclassified')
        
        # Handle list of highway types (take the first one)
        if isinstance(highway, list):
            highway = highway[0] if highway else 'unclassified'
        
        # Assign color based on road type
        if highway in ['motorway', 'motorway_link']:
            color = THEME['road_motorway']
        elif highway in ['trunk', 'trunk_link', 'primary', 'primary_link']:
            color = THEME['road_primary']
        elif highway in ['secondary', 'secondary_link']:
            color = THEME['road_secondary']
        elif highway in ['tertiary', 'tertiary_link']:
            color = THEME['road_tertiary']
        elif highway in ['residential', 'living_street', 'unclassified']:
            color = THEME['road_residential']
        else:
            color = THEME['road_default']
        
        edge_colors.append(color)
    
    return edge_colors

def get_edge_widths_by_type(G):
    """
    Assigns line widths to edges based on road type.
    Major roads get thicker lines.
    """
    edge_widths = []
    
    for u, v, data in G.edges(data=True):
        highway = data.get('highway', 'unclassified')
        
        if isinstance(highway, list):
            highway = highway[0] if highway else 'unclassified'
        
        # Assign width based on road importance
        if highway in ['motorway', 'motorway_link']:
            width = 1.2
        elif highway in ['trunk', 'trunk_link', 'primary', 'primary_link']:
            width = 1.0
        elif highway in ['secondary', 'secondary_link']:
            width = 0.8
        elif highway in ['tertiary', 'tertiary_link']:
            width = 0.6
        else:
            width = 0.4
        
        edge_widths.append(width)
    
    return edge_widths

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two lat/lon points."""
    from math import radians, sin, cos, sqrt, atan2
    R = 6371000  # Earth's radius in meters

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c

# Place type to distance mapping (in meters)
PLACE_TYPE_DISTANCES = {
    # Small areas
    'neighbourhood': 2000,
    'neighborhood': 2000,
    'suburb': 3000,
    'quarter': 3000,
    'hamlet': 2500,
    'isolated_dwelling': 1500,
    'farm': 1500,
    'allotments': 2000,
    # Medium areas
    'village': 4000,
    'borough': 5000,
    'town': 6000,
    'municipality': 8000,
    # Larger areas
    'city': 12000,
    # Large areas (skip 'administrative' - use importance instead)
    'county': 25000,
    'district': 20000,
    'region': 35000,
    'state': 50000,
}

def get_distance_from_importance(importance):
    """
    Map Nominatim importance score to appropriate map distance.
    Importance ranges roughly 0-1, with major cities near 0.8-0.9.
    """
    if importance < 0.40:
        return 3000   # Small neighborhood/area
    elif importance < 0.55:
        return 6000   # Town/small city
    elif importance < 0.70:
        return 12000  # Medium city
    elif importance < 0.85:
        return 18000  # Large city
    else:
        return 25000  # Major metro

def get_coordinates(city, country):
    """
    Fetches coordinates for a given city and country using geopy.
    Returns (lat, lon) tuple and suggested distance based on place type and importance.
    Includes rate limiting to be respectful to the geocoding service.
    """
    print("Looking up coordinates...")
    geolocator = Nominatim(user_agent="city_map_poster", timeout=10)

    # Add a small delay to respect Nominatim's usage policy
    time.sleep(1)

    location = geolocator.geocode(f"{city}, {country}", timeout=10)

    if location:
        print(f"✓ Found: {location.address}")
        print(f"✓ Coordinates: {location.latitude}, {location.longitude}")

        suggested_dist = None

        if hasattr(location, 'raw'):
            place_type = location.raw.get('type', '')
            place_class = location.raw.get('class', '')
            importance = location.raw.get('importance', 0.5)
            print(f"✓ Place type: {place_type} (class: {place_class}, importance: {importance:.2f})")

            # First, check if we have a specific mapping for this place type
            if place_type in PLACE_TYPE_DISTANCES:
                suggested_dist = PLACE_TYPE_DISTANCES[place_type]
                print(f"✓ Suggested distance: {suggested_dist}m (based on place type '{place_type}')")
            # For generic 'administrative' type, use importance score
            elif place_type == 'administrative':
                suggested_dist = get_distance_from_importance(importance)
                print(f"✓ Suggested distance: {suggested_dist}m (based on importance score)")

        # Fallback to bounding box if no distance determined yet
        if suggested_dist is None and hasattr(location, 'raw') and 'boundingbox' in location.raw:
            bbox = location.raw['boundingbox']
            south, north, west, east = map(float, bbox)

            # Calculate diagonal distance of bounding box
            diagonal = haversine_distance(south, west, north, east)

            # Use half the diagonal as radius, with some padding
            suggested_dist = int(diagonal / 2 * 1.2)

            # Clamp to reasonable bounds
            suggested_dist = max(1500, min(suggested_dist, 50000))

            print(f"✓ Suggested distance: {suggested_dist}m (based on bounding box)")

        return (location.latitude, location.longitude), suggested_dist
    else:
        raise ValueError(f"Could not find coordinates for {city}, {country}")

# Size presets (in meters)
SIZE_PRESETS = {
    'neighborhood': 2000,
    'small': 4000,
    'town': 6000,
    'city': 12000,
    'metro': 20000,
    'region': 35000
}

def get_cached_coords(city, country, dist):
    """
    Check if we have cached data for this location and return cached coordinates.
    This allows skipping geocoding for cached locations.

    Returns:
        tuple (lat, lon) if cached, None otherwise
    """
    cache_key = get_cache_key(city, country, dist)
    cache_path = get_cache_path(cache_key)
    meta_file = cache_path / "meta.json"

    if not meta_file.exists():
        return None

    try:
        import json
        with open(meta_file, "r") as f:
            meta = json.load(f)
        return tuple(meta["coords"])
    except:
        return None


def fetch_map_data(city, country, point, dist, use_cache=True):
    """
    Fetch map data from cache or OSM API.

    Returns:
        dict with keys: graph, water, parks
    """
    cache_key = get_cache_key(city, country, dist)

    # Try cache first
    if use_cache:
        print(f"Checking cache for {cache_key}...")
        cached = load_from_cache(cache_key)
        if cached:
            print(f"✓ Cache hit! Using cached data from {cached['cached_at']}")
            return {
                "graph": cached["graph"],
                "water": cached["water"],
                "parks": cached["parks"],
                "from_cache": True,
            }
        print("  Cache miss, fetching from API...")

    # Fetch from API
    with tqdm(total=3, desc="Fetching map data", unit="step", bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt}') as pbar:
        # 1. Fetch Street Network
        pbar.set_description("Downloading street network")
        G = ox.graph_from_point(point, dist=dist, dist_type='bbox', network_type='all')
        pbar.update(1)
        time.sleep(0.5)  # Rate limit between requests

        # 2. Fetch Water Features
        pbar.set_description("Downloading water features")
        try:
            water = ox.features_from_point(point, tags={'natural': 'water', 'waterway': 'riverbank'}, dist=dist)
        except:
            water = None
        pbar.update(1)
        time.sleep(0.3)

        # 3. Fetch Parks
        pbar.set_description("Downloading parks/green spaces")
        try:
            parks = ox.features_from_point(point, tags={'leisure': 'park', 'landuse': 'grass'}, dist=dist)
        except:
            parks = None
        pbar.update(1)

    print("✓ All data downloaded successfully!")

    # Save to cache
    if use_cache:
        save_to_cache(cache_key, G, water, parks, point, city, country, dist)

    return {
        "graph": G,
        "water": water,
        "parks": parks,
        "from_cache": False,
    }


def create_poster(city, country, point, dist, output_file, preview=False, use_cache=True, map_data=None):
    print(f"\nGenerating map for {city}, {country}...")
    if preview:
        print("  (Preview mode: 72 DPI)")

    # Fetch data if not provided
    if map_data is None:
        map_data = fetch_map_data(city, country, point, dist, use_cache=use_cache)

    G = map_data["graph"]
    water = map_data["water"]
    parks = map_data["parks"]

    if map_data.get("from_cache"):
        print("✓ Using cached map data")
    
    # 2. Setup Plot
    print("Rendering map...")
    fig, ax = plt.subplots(figsize=(12, 16), facecolor=THEME['bg'])
    ax.set_facecolor(THEME['bg'])
    ax.set_position([0, 0, 1, 1])
    
    # 3. Plot Layers
    # Layer 1: Polygons (filter out Point geometries to avoid default markers)
    if water is not None and not water.empty:
        water_polys = water[water.geometry.type.isin(['Polygon', 'MultiPolygon'])]
        if not water_polys.empty:
            water_polys.plot(ax=ax, facecolor=THEME['water'], edgecolor='none', zorder=1)
    if parks is not None and not parks.empty:
        park_polys = parks[parks.geometry.type.isin(['Polygon', 'MultiPolygon'])]
        if not park_polys.empty:
            park_polys.plot(ax=ax, facecolor=THEME['parks'], edgecolor='none', zorder=2)
    
    # Layer 2: Roads with hierarchy coloring
    print("Applying road hierarchy colors...")
    edge_colors = get_edge_colors_by_type(G)
    edge_widths = get_edge_widths_by_type(G)
    
    ox.plot_graph(
        G, ax=ax, bgcolor=THEME['bg'],
        node_size=0,
        edge_color=edge_colors,
        edge_linewidth=edge_widths,
        show=False, close=False
    )
    
    # Layer 3: Gradients (Top and Bottom)
    create_gradient_fade(ax, THEME['gradient_color'], location='bottom', zorder=10)
    create_gradient_fade(ax, THEME['gradient_color'], location='top', zorder=10)
    
    # 4. Typography using Roboto font
    # Get optimal layout for city name
    city_layout = get_city_text_layout(city)
    city_font_size = city_layout['font_size']

    if FONTS:
        font_main = FontProperties(fname=FONTS['bold'], size=city_font_size)
        font_sub = FontProperties(fname=FONTS['light'], size=22)
        font_coords = FontProperties(fname=FONTS['regular'], size=14)
    else:
        # Fallback to system fonts
        font_main = FontProperties(family='monospace', weight='bold', size=city_font_size)
        font_sub = FontProperties(family='monospace', weight='normal', size=22)
        font_coords = FontProperties(family='monospace', size=14)

    # --- BOTTOM TEXT ---
    # Render city name (may be multiple lines)
    num_lines = len(city_layout['lines'])
    for i, (line, y_pos) in enumerate(zip(city_layout['lines'], city_layout['y_positions'])):
        ax.text(0.5, y_pos, line, transform=ax.transAxes,
                color=THEME['text'], ha='center', fontproperties=font_main, zorder=11)

    # Adjust country and coords position based on number of city lines
    top_city_y = max(city_layout['y_positions'])
    line_height = city_layout['line_spacing'] if city_layout['line_spacing'] > 0 else 0.04
    country_y = min(city_layout['y_positions']) - 0.04
    coords_y = country_y - 0.03
    line_y = country_y + 0.025

    ax.text(0.5, country_y, country.upper(), transform=ax.transAxes,
            color=THEME['text'], ha='center', fontproperties=font_sub, zorder=11)

    lat, lon = point
    coords = f"{lat:.4f}° N / {lon:.4f}° E" if lat >= 0 else f"{abs(lat):.4f}° S / {lon:.4f}° E"
    if lon < 0:
        coords = coords.replace("E", "W")

    ax.text(0.5, coords_y, coords, transform=ax.transAxes,
            color=THEME['text'], alpha=0.7, ha='center', fontproperties=font_coords, zorder=11)

    ax.plot([0.4, 0.6], [line_y, line_y], transform=ax.transAxes,
            color=THEME['text'], linewidth=1, zorder=11)

    # --- ATTRIBUTION (bottom right) ---
    if FONTS:
        font_attr = FontProperties(fname=FONTS['light'], size=8)
    else:
        font_attr = FontProperties(family='monospace', size=8)
    
    ax.text(0.98, 0.02, "© OpenStreetMap contributors", transform=ax.transAxes,
            color=THEME['text'], alpha=0.5, ha='right', va='bottom', 
            fontproperties=font_attr, zorder=11)

    # 5. Save
    dpi = 72 if preview else 300
    print(f"Saving to {output_file}...")
    plt.savefig(output_file, dpi=dpi, facecolor=THEME['bg'])
    plt.close()
    print(f"✓ Done! Poster saved as {output_file}")

def print_examples():
    """Print usage examples."""
    print("""
City Map Poster Generator
=========================

Usage:
  python create_map_poster.py --city <city> --country <country> [options]

Examples:
  # Iconic grid patterns
  python create_map_poster.py -c "New York" -C "USA" -t noir -d 12000           # Manhattan grid
  python create_map_poster.py -c "Barcelona" -C "Spain" -t warm_beige -d 8000   # Eixample district grid
  
  # Waterfront & canals
  python create_map_poster.py -c "Venice" -C "Italy" -t blueprint -d 4000       # Canal network
  python create_map_poster.py -c "Amsterdam" -C "Netherlands" -t ocean -d 6000  # Concentric canals
  python create_map_poster.py -c "Dubai" -C "UAE" -t midnight_blue -d 15000     # Palm & coastline
  
  # Radial patterns
  python create_map_poster.py -c "Paris" -C "France" -t pastel_dream -d 10000   # Haussmann boulevards
  python create_map_poster.py -c "Moscow" -C "Russia" -t noir -d 12000          # Ring roads
  
  # Organic old cities
  python create_map_poster.py -c "Tokyo" -C "Japan" -t japanese_ink -d 15000    # Dense organic streets
  python create_map_poster.py -c "Marrakech" -C "Morocco" -t terracotta -d 5000 # Medina maze
  python create_map_poster.py -c "Rome" -C "Italy" -t warm_beige -d 8000        # Ancient street layout
  
  # Coastal cities
  python create_map_poster.py -c "San Francisco" -C "USA" -t sunset -d 10000    # Peninsula grid
  python create_map_poster.py -c "Sydney" -C "Australia" -t ocean -d 12000      # Harbor city
  python create_map_poster.py -c "Mumbai" -C "India" -t contrast_zones -d 18000 # Coastal peninsula
  
  # River cities
  python create_map_poster.py -c "London" -C "UK" -t noir -d 15000              # Thames curves
  python create_map_poster.py -c "Budapest" -C "Hungary" -t copper_patina -d 8000  # Danube split
  
  # List themes
  python create_map_poster.py --list-themes

Options:
  --city, -c        City name (required)
  --country, -C     Country name (required)
  --theme, -t       Theme name (default: feature_based)
  --distance, -d    Map radius in meters (default: 29000)
  --list-themes     List all available themes

Distance guide:
  4000-6000m   Small/dense cities (Venice, Amsterdam old center)
  8000-12000m  Medium cities, focused downtown (Paris, Barcelona)
  15000-20000m Large metros, full city view (Tokyo, Mumbai)

Available themes can be found in the 'themes/' directory.
Generated posters are saved to 'posters/' directory.
""")

def list_themes():
    """List all available themes with descriptions."""
    available_themes = get_available_themes()
    if not available_themes:
        print("No themes found in 'themes/' directory.")
        return
    
    print("\nAvailable Themes:")
    print("-" * 60)
    for theme_name in available_themes:
        theme_path = os.path.join(THEMES_DIR, f"{theme_name}.json")
        try:
            with open(theme_path, 'r') as f:
                theme_data = json.load(f)
                display_name = theme_data.get('name', theme_name)
                description = theme_data.get('description', '')
        except:
            display_name = theme_name
            description = ''
        print(f"  {theme_name}")
        print(f"    {display_name}")
        if description:
            print(f"    {description}")
        print()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate beautiful map posters for any city",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python create_map_poster.py --city "New York" --country "USA"
  python create_map_poster.py --city Tokyo --country Japan --theme midnight_blue
  python create_map_poster.py --city Paris --country France --theme noir --distance 15000
  python create_map_poster.py --list-themes
        """
    )
    
    parser.add_argument('--city', '-c', type=str, help='City name')
    parser.add_argument('--state', '-S', type=str, help='State/province name (optional, improves geocoding)')
    parser.add_argument('--country', '-C', type=str, help='Country name')
    parser.add_argument('--output', '-o', type=str, help='Output file path (default: auto-generated in posters/)')
    parser.add_argument('--theme', '-t', type=str, default='feature_based', help='Theme name (default: feature_based)')
    parser.add_argument('--distance', '-d', type=int, default=None, help='Map radius in meters (default: auto)')
    parser.add_argument('--auto', '-a', action='store_true', help='Auto-calculate distance from area size (default if no distance specified)')
    parser.add_argument('--size', '-s', type=str, choices=['neighborhood', 'small', 'town', 'city', 'metro', 'region'],
                        help='Size preset: neighborhood (2km), small (4km), town (6km), city (12km), metro (20km), region (35km)')
    parser.add_argument('--preview', '-p', action='store_true', help='Generate low-res preview (72 DPI instead of 300)')
    parser.add_argument('--no-cache', action='store_true', help='Bypass cache and fetch fresh data from API')
    parser.add_argument('--list-themes', action='store_true', help='List all available themes')
    
    args = parser.parse_args()
    
    # If no arguments provided, show examples
    if len(os.sys.argv) == 1:
        print_examples()
        os.sys.exit(0)
    
    # List themes if requested
    if args.list_themes:
        list_themes()
        os.sys.exit(0)
    
    # Validate required arguments
    if not args.city or not args.country:
        print("Error: --city and --country are required.\n")
        print_examples()
        os.sys.exit(1)
    
    # Validate theme exists
    available_themes = get_available_themes()
    if args.theme not in available_themes:
        print(f"Error: Theme '{args.theme}' not found.")
        print(f"Available themes: {', '.join(available_themes)}")
        os.sys.exit(1)
    
    print("=" * 50)
    print("City Map Poster Generator")
    print("=" * 50)
    
    # Load theme
    THEME = load_theme(args.theme)
    
    # Get coordinates and generate poster
    try:
        use_cache = not args.no_cache
        coords = None
        dist = None

        # Fast path: check if we have cached data for this location (skip geocoding)
        if use_cache and not args.distance and not args.size:
            city_for_cache = f"{args.city}, {args.state}" if args.state else args.city
            cached_meta = find_cached_location(city_for_cache, args.country)
            if cached_meta:
                coords = tuple(cached_meta["coords"])
                dist = cached_meta["distance"]
                print(f"✓ Found cached location: {args.city}, {args.country}")
                print(f"✓ Using cached coordinates: {coords[0]:.4f}, {coords[1]:.4f}")
                print(f"✓ Using cached distance: {dist}m")

        # If no cache hit, do geocoding
        if coords is None:
            # Include state in city name for better geocoding if provided
            city_query = f"{args.city}, {args.state}" if args.state else args.city
            coords, suggested_dist = get_coordinates(city_query, args.country)

            # Determine distance to use (priority: --distance > --size > auto/suggested)
            if args.distance is not None:
                dist = args.distance
                print(f"✓ Using specified distance: {dist}m")
            elif args.size:
                dist = SIZE_PRESETS[args.size]
                print(f"✓ Using size preset '{args.size}': {dist}m")
            elif suggested_dist:
                dist = suggested_dist
                print(f"✓ Using auto-calculated distance: {dist}m")
            else:
                dist = 12000  # Default fallback
                print(f"✓ Using default distance: {dist}m")

        # Use custom output path if provided, otherwise auto-generate
        if args.output:
            output_file = args.output
        else:
            output_file = generate_output_filename(args.city, args.theme, dist)
        create_poster(args.city, args.country, coords, dist, output_file, preview=args.preview, use_cache=use_cache)
        
        print("\n" + "=" * 50)
        print("✓ Poster generation complete!")
        print("=" * 50)
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        os.sys.exit(1)
