# Cartograph — Bespoke City Map Posters

Transform any location into museum-quality cartographic art.

## What is Cartograph?

Cartograph is a web application that generates beautiful, minimalist map posters for any city in the world. Simply enter a location, choose a theme, and receive a high-resolution 300 DPI image ready for printing.

## Features

- **Any City, Anywhere** — Search for any location worldwide using Photon geocoding
- **17 Curated Themes** — From minimalist Japanese ink to vibrant neon cyberpunk
- **Smart Sizing** — Auto-detects optimal map radius based on city importance
- **High Resolution** — 300 DPI output ready for printing
- **Instant Payment** — $0.10 USDC via x402 protocol on Base
- **Real-time Progress** — WebSocket updates during generation
- **Community Gallery** — Browse and get inspired by others' creations

## How It Works

1. **Search** — Enter any city name and select from autocomplete suggestions
2. **Customize** — Choose a theme and map scale
3. **Pay** — Connect your wallet and pay $0.10 USDC
4. **Generate** — Watch real-time progress as your poster is rendered
5. **Download** — Get your high-resolution PNG ready for printing

## Available Themes

| Theme | Description |
|-------|-------------|
| Feature Based | Classic black & white with road hierarchy |
| Noir | Pure black background, crisp white roads |
| Midnight Blue | Navy background with gold accent roads |
| Blueprint | Architectural blueprint aesthetic |
| Neon Cyberpunk | Dark with electric pink and cyan |
| Warm Beige | Vintage sepia tones |
| Japanese Ink | Minimalist ink wash style |
| Pastel Dream | Soft muted pastels |
| Forest | Deep greens and sage |
| Ocean | Blues and teals for coastal cities |
| Terracotta | Mediterranean warmth |
| Sunset | Warm oranges and pinks |
| Autumn | Seasonal burnt oranges and reds |
| Copper Patina | Oxidized copper aesthetic |
| Monochrome Blue | Single blue color family |
| Gradient Roads | Smooth gradient shading |
| Contrast Zones | High contrast urban density |

## Map Sizes

| Size | Radius | Best For |
|------|--------|----------|
| Neighborhood | 2 km | Dense urban cores, specific districts |
| Small | 4 km | Small towns, historic centers |
| Town | 6 km | Towns, focused city areas |
| City | 12 km | Standard city view (default) |
| Metro | 20 km | Large metropolitan areas |
| Region | 35 km | Wide regional overview |

## Pricing

**$0.10 USDC per poster** — paid via the x402 protocol on Base network.

No accounts, no subscriptions. Just connect your wallet and pay per poster.

## API Access

Cartograph provides a full API for programmatic access:

- **OpenAPI Spec**: [/openapi.json](/openapi.json)
- **Payment Discovery**: [/.well-known/x402](/.well-known/x402)

## Links

- **Website**: https://cartograph.art
- **GitHub**: https://github.com/Ashe-Oro/cartographART
- **x402 Protocol**: https://x402.org

## Tech Stack

- Frontend: Vanilla JS, Vite, Web3Modal
- Backend: Node.js, Express, WebSocket
- Payments: x402 Protocol with Coinbase CDP
- Map Generation: Python, OSMnx, Matplotlib
- Data: OpenStreetMap via Overpass API

---

*Transform your favorite city into art.*
