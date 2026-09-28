# Google Maps Platform Setup

Gravel Rush uses the supported Google Maps Platform **Map Tiles API** path for Photorealistic 3D Tiles.

## Required Google Cloud setup

1. Create or select a Google Cloud project.
2. Attach a billing account.
3. Enable **Map Tiles API**.
4. Create an API key.
5. Apply application restrictions appropriate to where the game is hosted.
6. Apply API restrictions so the key can call only the required Maps API where practical.
7. Load the game and paste the key into the startup panel.

The browser build intentionally does not contain a committed key.

## How the Phoenix world works

The game starts at approximately downtown Phoenix and uses WGS84 latitude/longitude coordinates. The Google root 3D tileset is global; Cesium requests only the tiles needed for the player's current view. Therefore Phoenix is streamed progressively rather than downloaded as a giant city asset.

The renderer enables `showCreditsOnScreen: true` so tile-specific data attribution remains visible.

## Important content rule

Do not add code that bulk-downloads, caches for offline reuse, rehosts, traces, digitizes, or converts Google Maps content into a separate game-owned dataset.

If the game needs durable road graphs, lane data, mission metadata or collision proxies, use a separately licensed/open source or author those gameplay layers independently. Keep the Google tiles as the licensed streamed visual layer.

## Production recommendation

A production release should:

- use an API key restricted to the production domains/app
- set billing budgets and usage alerts
- monitor Map Tiles API usage
- test tile coverage in all intended Phoenix neighborhoods
- preserve all Google and third-party attribution returned by the service
- review current Google Maps Platform terms before release
