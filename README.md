# Cartograph

**Transform any location into museum-quality cartographic art.**

A web application that generates beautiful, minimalist map posters for any city in the world. Powered by OpenStreetMap data and secured with [x402](https://x402.org) micropayments on Base.

<p align="center">
  <img src="posters/san_francisco_sunset_20260108_184122.png" width="200">
  <img src="posters/venice_blueprint_20260108_165527.png" width="200">
  <img src="posters/tokyo_japanese_ink_20260108_165830.png" width="200">
  <img src="posters/singapore_neon_cyberpunk_20260108_184503.png" width="200">
</p>

<p align="center">
  <a href="https://cartograph.art">Live Demo</a> ·
  <a href="#themes">17 Themes</a> ·
  <a href="#api-reference">API Docs</a>
</p>

---

## Features

- **Any City, Anywhere** — Search for any location worldwide using Photon geocoding
- **17 Curated Themes** — From minimalist Japanese ink to vibrant neon cyberpunk
- **Smart Sizing** — Auto-detects optimal map radius based on city importance
- **High Resolution** — 300 DPI output ready for printing
- **Crypto Payments** — $0.10 USDC via x402 protocol on Base
- **Real-time Progress** — WebSocket updates during generation
- **Community Gallery** — Browse and get inspired by others' creations

## Gallery

| City | Theme | Preview |
|:----:|:-----:|:-------:|
| San Francisco | Sunset | <img src="posters/san_francisco_sunset_20260108_184122.png" width="180"> |
| Barcelona | Warm Beige | <img src="posters/barcelona_warm_beige_20260108_172924.png" width="180"> |
| Venice | Blueprint | <img src="posters/venice_blueprint_20260108_165527.png" width="180"> |
| Tokyo | Japanese Ink | <img src="posters/tokyo_japanese_ink_20260108_165830.png" width="180"> |
| Singapore | Neon Cyberpunk | <img src="posters/singapore_neon_cyberpunk_20260108_184503.png" width="180"> |
| Dubai | Midnight Blue | <img src="posters/dubai_midnight_blue_20260108_174920.png" width="180"> |

## How It Works

1. **Search** — Enter any city name and select from autocomplete suggestions
2. **Customize** — Choose a theme and map scale
3. **Pay** — Connect your wallet and pay $0.10 USDC
4. **Generate** — Watch real-time progress as your poster is rendered
5. **Download** — Get your high-resolution PNG ready for printing

## Tech Stack

- **Frontend**: Vanilla JS, Vite, Web3Modal/Reown AppKit
- **Backend**: Node.js, Express, WebSocket
- **Payments**: [x402 Protocol](https://x402.org) with Coinbase CDP
- **Map Generation**: Python, OSMnx, Matplotlib
- **Data**: OpenStreetMap via Overpass API
- **Geocoding**: Photon (Komoot)

---

## Local Development

### Prerequisites

- Node.js 22+
- Python 3.11+
- A wallet with USDC on Base (for testing payments)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ashe-Oro/cartographART.git
cd cartographART

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
cd server && npm install && cd ..

# Install frontend dependencies (optional, for rebuilding)
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Required for mainnet payments
PAY_TO_ADDRESS=0xYourWalletAddress
CDP_API_KEY_ID=your_cdp_key_id
CDP_API_KEY_SECRET=your_cdp_key_secret

# Optional
MODE=mainnet
POSTER_PRICE=0.10
PORT=8080
```

### Running Locally

```bash
# Start the server
cd server && npm start

# Or with auto-reload
cd server && npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Building Frontend

```bash
npm run build
```

---

## API Reference

### Generate a Poster

```http
POST /api/posters
```

Requires x402 payment header with $0.10 USDC.

**Request Body:**
```json
{
  "city": "San Francisco",
  "state": "California",
  "country": "United States",
  "theme": "sunset",
  "size": "city",
  "showInGallery": true
}
```

**Response:**
```json
{
  "job_id": "abc123",
  "status": "pending",
  "message": "Poster generation started"
}
```

### Check Job Status

```http
GET /api/jobs/:jobId
```

### WebSocket Updates

```
ws://localhost:8080/ws/jobs/:jobId
```

Receive real-time progress updates:
```json
{
  "type": "job_update",
  "status": "processing",
  "progress": 45,
  "message": "Rendering map..."
}
```

### Download Poster

```http
GET /api/posters/:jobId
```

### Other Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/themes` | GET | List available themes |
| `/api/gallery` | GET | Get community gallery |
| `/api/gallery/thumbnail/:jobId` | GET | Get poster thumbnail |
| `/api/gallery/image/:jobId` | GET | Get full poster image |

---

## Themes

17 themes available in the `themes/` directory:

| Theme | Description | Colors |
|-------|-------------|--------|
| `feature_based` | Classic black & white with road hierarchy | Black/White |
| `noir` | Pure black background, crisp white roads | Black/White |
| `midnight_blue` | Navy background with gold accent roads | Navy/Gold |
| `blueprint` | Architectural blueprint aesthetic | Blue/White |
| `neon_cyberpunk` | Dark with electric pink and cyan | Black/Pink/Cyan |
| `warm_beige` | Vintage sepia tones | Cream/Brown |
| `japanese_ink` | Minimalist ink wash style | Cream/Black |
| `pastel_dream` | Soft muted pastels | Pink/Lavender |
| `forest` | Deep greens and sage | Green/Cream |
| `ocean` | Blues and teals for coastal cities | Blue/Teal |
| `terracotta` | Mediterranean warmth | Orange/Brown |
| `sunset` | Warm oranges and pinks | Orange/Pink |
| `autumn` | Seasonal burnt oranges and reds | Orange/Red |
| `copper_patina` | Oxidized copper aesthetic | Teal/Copper |
| `monochrome_blue` | Single blue color family | Blue |
| `gradient_roads` | Smooth gradient shading | Various |
| `contrast_zones` | High contrast urban density | Black/White |

### Creating Custom Themes

Add a JSON file to the `themes/` directory:

```json
{
  "name": "My Theme",
  "description": "Description of the theme",
  "bg": "#FFFFFF",
  "text": "#000000",
  "water": "#C0C0C0",
  "parks": "#F0F0F0",
  "road_motorway": "#0A0A0A",
  "road_primary": "#1A1A1A",
  "road_secondary": "#2A2A2A",
  "road_tertiary": "#3A3A3A",
  "road_residential": "#4A4A4A",
  "road_default": "#3A3A3A"
}
```

---

## Map Size Presets

| Preset | Distance | Best For |
|--------|----------|----------|
| `neighborhood` | 2km | Dense urban cores, specific districts |
| `small` | 4km | Small towns, historic centers |
| `town` | 6km | Towns, focused city areas |
| `city` | 12km | Standard city view (default) |
| `metro` | 20km | Large metropolitan areas |
| `region` | 35km | Wide regional overview |

---

## CLI Usage

Generate posters directly from the command line:

```bash
python create_map_poster.py --city "New York" --country "USA" --theme noir --size city
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--city` | `-c` | City name | required |
| `--country` | `-C` | Country name | required |
| `--state` | `-s` | State/region | optional |
| `--theme` | `-t` | Theme name | feature_based |
| `--size` | | Size preset | auto |
| `--distance` | `-d` | Custom radius in meters | auto |
| `--output` | `-o` | Output file path | auto |
| `--preview` | | Low-res 72 DPI preview | false |
| `--list-themes` | | List all themes | |

---

## Deployment

### Railway

This project is configured for deployment on [Railway](https://railway.app):

1. Connect your GitHub repository
2. Add environment variables in Railway dashboard
3. Attach a volume at `/app/server/data` for persistence
4. Deploy

The included `railway.json` and `Dockerfile` handle the build configuration.

### Environment Variables for Production

```env
MODE=mainnet
PAY_TO_ADDRESS=0xYourAddress
CDP_API_KEY_ID=your_key
CDP_API_KEY_SECRET=your_secret
CDP_WALLET_SECRET=your_wallet_secret
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Search  │  │  Themes  │  │  Wallet  │  │  Progress/Result │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
└───────┼─────────────┼─────────────┼─────────────────┼───────────┘
        │             │             │                 │
        ▼             ▼             ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Node.js Server                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Photon  │  │  Themes  │  │   x402   │  │    WebSocket     │ │
│  │  Proxy   │  │   API    │  │ Payments │  │    Updates       │ │
│  └──────────┘  └──────────┘  └────┬─────┘  └────────┬─────────┘ │
└───────────────────────────────────┼─────────────────┼───────────┘
                                    │                 │
                                    ▼                 │
┌─────────────────────────────────────────────────────┼───────────┐
│                    Python Generator                  │           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │           │
│  │ Nominatim│  │  OSMnx   │  │Matplotlib│──────────┘           │
│  │ Geocode  │  │  Fetch   │  │  Render  │                      │
│  └──────────┘  └──────────┘  └──────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Credits

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Geocoding by [Photon](https://photon.komoot.io/) (Komoot)
- Graph analysis by [OSMnx](https://github.com/gboeing/osmnx)
- Payments via [x402 Protocol](https://x402.org) on [Base](https://base.org)

---

## License

This project is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (Creative Commons Attribution-NonCommercial 4.0 International).

You are free to share and adapt this work for non-commercial purposes with attribution. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Cartograph</strong> — Bespoke City Prints<br>
  <a href="https://cartograph.art">cartograph.art</a>
</p>
