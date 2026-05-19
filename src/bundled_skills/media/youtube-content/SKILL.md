---
name: youtube-content
description: YouTube Data API — search, video details, channel info, transcripts.
platforms: [linux, macos, windows]
tags: [youtube, video, api, search, transcripts, channel, metadata]
---

# YouTube Content SOP

Search YouTube, fetch video and channel metadata, extract transcripts, and paginate through results via the YouTube Data API v3.

## When to Use

- User wants to search YouTube for videos or channels
- User wants to get video details (duration, view count, tags, description)
- User wants channel statistics or upload history
- User wants to extract a video transcript or subtitles
- User wants to paginate through a large result set

---

## Part 1 — Setup

### 1. Get an API Key

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable **YouTube Data API v3** under APIs & Services → Library
4. Go to APIs & Services → Credentials → Create Credentials → **API key**
5. (Recommended) Restrict the key to YouTube Data API v3 and your IP

### 2. Environment Variable

```bash
export YOUTUBE_API_KEY="AIzaSy..."
```

Or in `~/.cowrangler/credentials.env`:
```
YOUTUBE_API_KEY=AIzaSy...
```

### 3. Shell Helper

```bash
YOUTUBE_API_KEY="${YOUTUBE_API_KEY:-$(grep '^YOUTUBE_API_KEY=' ~/.cowrangler/credentials.env 2>/dev/null | cut -d= -f2 | tr -d '\n\r')}"
YT_BASE="https://www.googleapis.com/youtube/v3"

yt_get() {
  # $1 = endpoint path + params (already URL-encoded)
  curl -s "${YT_BASE}/$1&key=${YOUTUBE_API_KEY}"
}
```

---

## Part 2 — Search

### Search Videos

```bash
QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('python async tutorial'))")

yt_get "search?part=snippet&type=video&q=${QUERY}&maxResults=10&order=relevance" \
| python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('items', []):
    vid_id = item['id']['videoId']
    title  = item['snippet']['title']
    channel = item['snippet']['channelTitle']
    published = item['snippet']['publishedAt'][:10]
    print(f'{vid_id}  [{published}]  {channel:30s}  {title[:60]}')
print()
print('nextPageToken:', data.get('nextPageToken', '(none)'))
"
```

### Search Channels

```bash
QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('machine learning'))")

yt_get "search?part=snippet&type=channel&q=${QUERY}&maxResults=5" \
| python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('items', []):
    ch_id   = item['id']['channelId']
    title   = item['snippet']['channelTitle']
    desc    = item['snippet']['description'][:80]
    print(f'{ch_id}  {title:30s}  {desc}')
"
```

---

## Part 3 — Video Details

### Get Video Metadata

```bash
VIDEO_ID="dQw4w9WgXcQ"

yt_get "videos?part=snippet,contentDetails,statistics&id=${VIDEO_ID}" \
| python3 -c "
import sys, json, re

data = json.load(sys.stdin)
v    = data['items'][0]
snip = v['snippet']
cd   = v['contentDetails']
stat = v['statistics']

# Parse ISO 8601 duration (e.g. PT4M13S → 4m13s)
dur = cd['duration']
m   = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', dur)
h, mi, s = (int(m.group(i) or 0) for i in (1, 2, 3))
duration_str = f'{h}h{mi}m{s}s' if h else f'{mi}m{s}s'

print('Title:      ', snip['title'])
print('Channel:    ', snip['channelTitle'])
print('Published:  ', snip['publishedAt'][:10])
print('Duration:   ', duration_str)
print('Views:      ', int(stat.get('viewCount', 0)):,)
print('Likes:      ', int(stat.get('likeCount', 0)):,)
print('Comments:   ', int(stat.get('commentCount', 0)):,)
print('Tags:       ', ', '.join(snip.get('tags', [])[:8]))
print('Description:', snip['description'][:200])
"
```

### Batch Multiple Videos (up to 50 IDs per request)

```bash
IDS="id1,id2,id3,id4,id5"

yt_get "videos?part=snippet,statistics&id=${IDS}" \
| python3 -c "
import sys, json
data = json.load(sys.stdin)
print('id,title,views,likes')
for v in data['items']:
    stat  = v['statistics']
    title = v['snippet']['title'].replace(',', ' ')
    views = stat.get('viewCount', 0)
    likes = stat.get('likeCount', 0)
    print(f\"{v['id']},{title},{views},{likes}\")
"
```

---

## Part 4 — Channel Info

### Channel Statistics

```bash
CHANNEL_ID="UCBcRF18a7Qf58cCRy5xuWwQ"

yt_get "channels?part=snippet,statistics,contentDetails&id=${CHANNEL_ID}" \
| python3 -c "
import sys, json
ch   = json.load(sys.stdin)['items'][0]
snip = ch['snippet']
stat = ch['statistics']
cd   = ch['contentDetails']

print('Name:        ', snip['title'])
print('Description: ', snip['description'][:150])
print('Subscribers: ', int(stat.get('subscriberCount', 0)):,)
print('Total views: ', int(stat.get('viewCount', 0)):,)
print('Video count: ', stat.get('videoCount', '?'))
print('Uploads playlist:', cd['relatedPlaylists']['uploads'])
"
```

### Get Channel ID from Username / Handle

```bash
HANDLE="mkbhd"
yt_get "search?part=snippet&type=channel&q=${HANDLE}&maxResults=1" \
| python3 -c "
import sys, json
items = json.load(sys.stdin).get('items', [])
if items:
    print('Channel ID:', items[0]['id']['channelId'])
"
```

### List Recent Uploads from a Channel

```bash
# First get the uploads playlist ID (from contentDetails above)
UPLOADS_PLAYLIST="UUBcRF18a7Qf58cCRy5xuWwQ"

yt_get "playlistItems?part=snippet,contentDetails&playlistId=${UPLOADS_PLAYLIST}&maxResults=20" \
| python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data['items']:
    vid_id    = item['contentDetails']['videoId']
    title     = item['snippet']['title']
    published = item['contentDetails']['videoPublishedAt'][:10]
    print(f'{vid_id}  {published}  {title}')
"
```

---

## Part 5 — Pagination

All list endpoints return a `nextPageToken` when more results exist. Use it to walk through all results.

```python
#!/usr/bin/env python3
"""List all videos from an uploads playlist."""
import os, json, urllib.request, urllib.parse

API_KEY     = os.environ["YOUTUBE_API_KEY"]
PLAYLIST_ID = "UUBcRF18a7Qf58cCRy5xuWwQ"
BASE        = "https://www.googleapis.com/youtube/v3"

def fetch_page(playlist_id, page_token=None):
    params = {
        "part": "snippet,contentDetails",
        "playlistId": playlist_id,
        "maxResults": 50,
        "key": API_KEY,
    }
    if page_token:
        params["pageToken"] = page_token
    url = f"{BASE}/playlistItems?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url) as r:
        return json.load(r)

all_videos = []
next_token = None

while True:
    data = fetch_page(PLAYLIST_ID, next_token)
    for item in data["items"]:
        all_videos.append({
            "id":        item["contentDetails"]["videoId"],
            "title":     item["snippet"]["title"],
            "published": item["contentDetails"].get("videoPublishedAt", "")[:10],
        })
    next_token = data.get("nextPageToken")
    if not next_token:
        break

print(f"Total videos fetched: {len(all_videos)}")
for v in all_videos[:10]:
    print(f"  {v['id']}  {v['published']}  {v['title']}")
```

---

## Part 6 — Transcript Extraction

The YouTube Data API does **not** provide transcripts. Use the `youtube-transcript-api` Python library.

### Install

```bash
pip install youtube-transcript-api
```

### Fetch Transcript

```python
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

VIDEO_ID = "dQw4w9WgXcQ"

try:
    # Fetch default transcript
    transcript = YouTubeTranscriptApi.get_transcript(VIDEO_ID)
    full_text = " ".join(entry["text"] for entry in transcript)
    print(full_text[:500])
except TranscriptsDisabled:
    print("Transcripts are disabled for this video.")
except NoTranscriptFound:
    print("No transcript available in any language.")
```

### List Available Transcripts

```python
from youtube_transcript_api import YouTubeTranscriptApi

VIDEO_ID = "dQw4w9WgXcQ"
transcript_list = YouTubeTranscriptApi.list_transcripts(VIDEO_ID)

for t in transcript_list:
    print(f"  lang={t.language_code}  generated={t.is_generated}  translatable={t.is_translatable}")
```

### Fetch in a Specific Language

```python
transcript = YouTubeTranscriptApi.get_transcript(VIDEO_ID, languages=["tr", "en"])
```

### Timed Transcript (for subtitle alignment)

```python
transcript = YouTubeTranscriptApi.get_transcript(VIDEO_ID)
for entry in transcript[:20]:
    start = entry["start"]
    dur   = entry["duration"]
    text  = entry["text"]
    mins, secs = divmod(int(start), 60)
    print(f"[{mins:02d}:{secs:02d}]  {text}")
```

---

## Part 7 — Quota Awareness

YouTube Data API v3 has a **daily quota of 10,000 units** per project (free tier).

| Operation | Cost (units) |
|-----------|-------------|
| `search.list` | 100 |
| `videos.list` | 1 |
| `channels.list` | 1 |
| `playlistItems.list` | 1 |
| `captions.list` | 50 |

**Tips to stay within quota:**
- Prefer `videos.list?id=id1,id2,...` (batch up to 50) over per-video calls.
- Cache results locally; avoid repeated searches for the same query.
- `search.list` is expensive — use playlist crawl instead when you have a channel's upload playlist ID.
- Monitor usage at [https://console.cloud.google.com/apis/dashboard](https://console.cloud.google.com/apis/dashboard).

---

## Checklist

- [ ] YouTube Data API v3 enabled in Google Cloud Console
- [ ] `YOUTUBE_API_KEY` set and restricted to YouTube Data API v3
- [ ] Using batch `videos.list?id=...` for multi-video metadata (not looping single calls)
- [ ] Pagination handled with `nextPageToken` for result sets > `maxResults`
- [ ] Quota usage monitored — `search.list` costs 100 units per call
- [ ] `youtube-transcript-api` installed for transcript extraction (not part of the official API)
