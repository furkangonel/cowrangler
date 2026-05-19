---
name: spotify
description: Spotify API integration — playback control, playlists, search, recommendations.
platforms: [linux, macos, windows]
tags: [spotify, music, api, playback, playlists, oauth, recommendations]
---

# Spotify API Integration SOP

Control Spotify playback, manage playlists, search tracks, and fetch recommendations via the Spotify Web API.

## When to Use

- User wants to search for tracks, albums, or artists on Spotify
- User wants to control playback (play, pause, skip, seek, volume)
- User wants to create, update, or manage playlists
- User wants to get track recommendations based on seeds
- User wants to fetch audio features (tempo, energy, danceability) for tracks

---

## Part 1 — Auth Setup

Spotify uses OAuth 2.0. For personal/CLI use, **Authorization Code + PKCE** is preferred (no server needed). For server-side scripts, use **Client Credentials** (no user context, limited endpoints).

### 1. Create an App

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create app** → name it → set Redirect URI to `http://localhost:8888/callback`
3. Copy **Client ID** and **Client Secret**

### 2. Environment Variables

```bash
export SPOTIFY_CLIENT_ID="your_client_id"
export SPOTIFY_CLIENT_SECRET="your_client_secret"
export SPOTIFY_REDIRECT_URI="http://localhost:8888/callback"
```

Or in `~/.cowrangler/credentials.env`:
```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback
```

### 3. Client Credentials Token (no user context)

Grants access to public data: search, catalog, audio features. Does **not** allow playback control or playlist writes.

```bash
TOKEN=$(curl -s -X POST "https://accounts.spotify.com/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${SPOTIFY_CLIENT_ID}&client_secret=${SPOTIFY_CLIENT_SECRET}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token: $TOKEN"
```

### 4. Authorization Code Flow (user context — full access)

```python
#!/usr/bin/env python3
"""get_spotify_token.py — run once to obtain a refresh token."""
import os, json, hashlib, base64, secrets, urllib.parse, urllib.request, http.server

CLIENT_ID     = os.environ["SPOTIFY_CLIENT_ID"]
CLIENT_SECRET = os.environ["SPOTIFY_CLIENT_SECRET"]
REDIRECT_URI  = os.environ.get("SPOTIFY_REDIRECT_URI", "http://localhost:8888/callback")
SCOPES        = " ".join([
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "playlist-read-private",
    "playlist-modify-public",
    "playlist-modify-private",
])

# Step 1 — Build auth URL
verifier = secrets.token_urlsafe(64)
challenge = base64.urlsafe_b64encode(
    hashlib.sha256(verifier.encode()).digest()
).rstrip(b"=").decode()

params = urllib.parse.urlencode({
    "client_id": CLIENT_ID, "response_type": "code",
    "redirect_uri": REDIRECT_URI, "scope": SCOPES,
    "code_challenge_method": "S256", "code_challenge": challenge,
})
print(f"Open this URL:\nhttps://accounts.spotify.com/authorize?{params}\n")

# Step 2 — Catch redirect
code = input("Paste the `code` query param from the redirect URL: ").strip()

# Step 3 — Exchange for tokens
body = urllib.parse.urlencode({
    "grant_type": "authorization_code", "code": code,
    "redirect_uri": REDIRECT_URI, "client_id": CLIENT_ID,
    "code_verifier": verifier,
}).encode()
req = urllib.request.Request(
    "https://accounts.spotify.com/api/token", data=body,
    headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST"
)
with urllib.request.urlopen(req) as r:
    tokens = json.load(r)

print("\nAdd to credentials.env:")
print(f"SPOTIFY_ACCESS_TOKEN={tokens['access_token']}")
print(f"SPOTIFY_REFRESH_TOKEN={tokens['refresh_token']}")
```

### 5. Refresh Access Token

Access tokens expire in 3600 seconds. Refresh before each session:

```python
import os, json, urllib.request, urllib.parse

def refresh_spotify_token():
    body = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": os.environ["SPOTIFY_REFRESH_TOKEN"],
        "client_id": os.environ["SPOTIFY_CLIENT_ID"],
        "client_secret": os.environ["SPOTIFY_CLIENT_SECRET"],
    }).encode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token", data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST"
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)["access_token"]

TOKEN = refresh_spotify_token()
```

### Auth Helper (shell)

```bash
SPOTIFY_TOKEN="${SPOTIFY_ACCESS_TOKEN}"

spotify_get() {
  curl -s "https://api.spotify.com/v1/$1" \
    -H "Authorization: Bearer $SPOTIFY_TOKEN"
}

spotify_post() {
  curl -s -X POST "https://api.spotify.com/v1/$1" \
    -H "Authorization: Bearer $SPOTIFY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$2"
}

spotify_put() {
  curl -s -X PUT "https://api.spotify.com/v1/$1" \
    -H "Authorization: Bearer $SPOTIFY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "${2:-{}}"
}

spotify_delete() {
  curl -s -X DELETE "https://api.spotify.com/v1/$1" \
    -H "Authorization: Bearer $SPOTIFY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$2"
}
```

---

## Part 2 — Search

### Search for Tracks

```bash
QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('Radiohead Creep'))")
spotify_get "search?q=${QUERY}&type=track&limit=5" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['tracks']['items']:
    artists = ', '.join(a['name'] for a in t['artists'])
    print(f\"{t['id']}  {t['name']} — {artists}  [{t['album']['name']}]\")
"
```

### Search for Artists

```bash
QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('Tame Impala'))")
spotify_get "search?q=${QUERY}&type=artist&limit=3" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data['artists']['items']:
    genres = ', '.join(a['genres'][:3])
    print(f\"{a['id']}  {a['name']}  followers={a['followers']['total']:,}  genres={genres}\")
"
```

---

## Part 3 — Playback Control

These endpoints require a Spotify Premium account and an active device.

### Get Current Playback State

```bash
spotify_get "me/player" | python3 -c "
import sys, json
p = json.load(sys.stdin)
if not p:
    print('Nothing playing.')
else:
    item = p.get('item', {})
    artists = ', '.join(a['name'] for a in item.get('artists', []))
    print(f\"Playing: {item.get('name')} — {artists}\")
    print(f\"Device:  {p['device']['name']} ({p['device']['type']})\")
    progress_ms = p['progress_ms']
    duration_ms = item.get('duration_ms', 1)
    print(f\"Progress: {progress_ms//1000}s / {duration_ms//1000}s\")
    print(f\"Shuffle: {p['shuffle_state']}  Repeat: {p['repeat_state']}\")
"
```

### Play / Pause / Skip

```bash
# Resume playback
spotify_put "me/player/play"

# Pause
spotify_put "me/player/pause"

# Next track
spotify_post "me/player/next" "{}"

# Previous track
spotify_post "me/player/previous" "{}"

# Set volume (0–100)
curl -s -X PUT "https://api.spotify.com/v1/me/player/volume?volume_percent=60" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN"
```

### Play a Specific Track or Context

```bash
# Play a single track by URI
spotify_put "me/player/play" '{"uris": ["spotify:track:TRACK_ID"]}'

# Play an album or playlist from the beginning
spotify_put "me/player/play" '{"context_uri": "spotify:playlist:PLAYLIST_ID"}'

# Play album starting from track 3 (0-indexed)
spotify_put "me/player/play" '{
  "context_uri": "spotify:album:ALBUM_ID",
  "offset": {"position": 2}
}'
```

### Transfer Playback to a Device

```bash
# List available devices
spotify_get "me/player/devices" | python3 -c "
import sys, json
for d in json.load(sys.stdin)['devices']:
    print(f\"{d['id']}  {d['name']} ({d['type']}) active={d['is_active']}\")
"

# Transfer to device
spotify_put "me/player" '{"device_ids": ["DEVICE_ID"], "play": true}'
```

---

## Part 4 — Playlist Management

### List Your Playlists

```bash
spotify_get "me/playlists?limit=50" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data['items']:
    print(f\"{p['id']}  {p['name']}  ({p['tracks']['total']} tracks)\")
"
```

### Create a Playlist

```bash
USER_ID=$(spotify_get "me" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

spotify_post "users/${USER_ID}/playlists" '{
  "name": "My New Playlist",
  "description": "Created via API",
  "public": false
}' | python3 -c "import sys,json; p=json.load(sys.stdin); print(p['id'], p['external_urls']['spotify'])"
```

### Add Tracks to a Playlist

```bash
PLAYLIST_ID="your_playlist_id"

# Add up to 100 tracks per request
spotify_post "playlists/${PLAYLIST_ID}/tracks" '{
  "uris": [
    "spotify:track:TRACK_ID_1",
    "spotify:track:TRACK_ID_2",
    "spotify:track:TRACK_ID_3"
  ],
  "position": 0
}'
```

### Remove Tracks from a Playlist

```bash
spotify_delete "playlists/${PLAYLIST_ID}/tracks" '{
  "tracks": [
    {"uri": "spotify:track:TRACK_ID_1"},
    {"uri": "spotify:track:TRACK_ID_2"}
  ]
}'
```

### Get Playlist Tracks

```bash
spotify_get "playlists/${PLAYLIST_ID}/tracks?limit=50&fields=items(track(id,name,artists(name),duration_ms))" \
| python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data['items']:
    t = item['track']
    if not t: continue
    artists = ', '.join(a['name'] for a in t['artists'])
    mins, secs = divmod(t['duration_ms'] // 1000, 60)
    print(f\"{t['id']}  {t['name']} — {artists}  {mins}:{secs:02d}\")
"
```

---

## Part 5 — Recommendations

Recommendations require 1–5 seed items total (tracks + artists + genres combined).

```bash
# Get available genre seeds
spotify_get "recommendations/available-genre-seeds" | python3 -c "
import sys, json; print('\n'.join(json.load(sys.stdin)['genres']))
"

# Recommendations by seed tracks
spotify_get "recommendations?seed_tracks=TRACK_ID_1,TRACK_ID_2&limit=10" \
| python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['tracks']:
    artists = ', '.join(a['name'] for a in t['artists'])
    print(f\"{t['id']}  {t['name']} — {artists}\")
"

# Recommendations with audio feature targets
spotify_get "recommendations?seed_genres=indie&target_energy=0.8&target_tempo=130&min_danceability=0.6&limit=10" \
| python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['tracks']:
    artists = ', '.join(a['name'] for a in t['artists'])
    print(f\"{t['id']}  {t['name']} — {artists}\")
"
```

---

## Part 6 — Audio Features

```bash
# Single track features
TRACK_ID="11dFghVXANMlKmJXsNCbNl"
spotify_get "audio-features/${TRACK_ID}" | python3 -c "
import sys, json
f = json.load(sys.stdin)
keys = ['danceability','energy','key','loudness','mode','speechiness',
        'acousticness','instrumentalness','liveness','valence','tempo','duration_ms']
for k in keys:
    print(f'{k:20s}: {f[k]}')
"

# Batch: up to 100 tracks at once
TRACK_IDS="id1,id2,id3"
spotify_get "audio-features?ids=${TRACK_IDS}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('id,energy,tempo,danceability,valence')
for f in data['audio_features']:
    if f:
        print(f\"{f['id']},{f['energy']},{f['tempo']:.1f},{f['danceability']},{f['valence']}\")
"
```

---

## Audio Feature Reference

| Feature | Range | Meaning |
|---------|-------|---------|
| `danceability` | 0.0–1.0 | How suitable for dancing |
| `energy` | 0.0–1.0 | Intensity and activity |
| `valence` | 0.0–1.0 | Musical positiveness (happy vs sad) |
| `tempo` | BPM | Estimated beats per minute |
| `acousticness` | 0.0–1.0 | Confidence of acoustic sound |
| `instrumentalness` | 0.0–1.0 | Predicts no vocals |
| `liveness` | 0.0–1.0 | Detects live audience presence |
| `speechiness` | 0.0–1.0 | Detects spoken words |
| `loudness` | dB | Average loudness (typically -60 to 0) |
| `key` | 0–11 | Pitch class (0=C, 2=D, ...) |
| `mode` | 0 or 1 | Minor (0) or Major (1) |

---

## Rate Limits

- Spotify enforces per-endpoint rate limits; HTTP 429 means you are rate-limited.
- Respect the `Retry-After` header on 429 responses.
- Recommendation endpoint: treat as ~30 req/min safe limit for personal use.
- Batch endpoints (`audio-features?ids=...`) are far more efficient than looping single requests.

---

## Checklist

- [ ] Spotify Developer app created and Redirect URI configured
- [ ] `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` set in environment
- [ ] For user-context endpoints: Authorization Code flow completed, refresh token stored
- [ ] Active Spotify device present before calling playback endpoints
- [ ] Premium account available for playback control endpoints
- [ ] Total recommendation seeds ≤ 5 (tracks + artists + genres combined)
