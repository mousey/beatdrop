# 🎵 BEATDROP — Interactive Music Card & Timeline Game

**BEATDROP** is an interactive, browser-based and Android TV music party game. Players listen to mystery music clips, guess artists and titles, test their chronological music knowledge by placing songs along a historical timeline, or scan physical cards for instant playback.

It features 3D card physics with spinning vinyl animations, real-time room synchronization for big-screen TVs and phone remotes, zero-dependency Node.js backend, and a standalone Android TV app with an embedded local server.

---

## 🌟 Key Features

### 🎮 Three Distinct Game Modes
1. **⚡ Quickfire Party Mode:**
   - Draw a random mystery track from the active deck.
   - First player or team to shout out the Artist and Song stops the music and flips the card.
   - Award points directly with live score tracking, winner detection, and instant turn progression.
2. **⏳ Chronological Timeline Mode:**
   - Place mystery songs into chronological slots (`≤`, `between`, or `≥` previous releases) on each player's music timeline.
   - Flip the card to reveal the release year and see if your placement is correct.
   - Earn bonus tokens for guessing the artist and song. First to build a timeline of 10 tracks wins!
3. **🔍 Card Number Lookup:**
   - Enter any physical card number from the active music edition or draw randomly.
   - Stream audio previews and reveal the official card details with album art and year.

---

### 📺 Big Screen TV & 📱 Phone Remote Controller Sync
- **Dedicated 10-Foot TV Display (`/tv`):**
  - Optimized for `1920x1080` (and `2x` DPI `960x540`) displays with **zero vertical scrolling**.
  - Cleaned-up TV stage with large 3D vinyl card, D-Pad focus navigation, and hardware media play/pause key support.
  - Displays a high-contrast room QR code and local Wi-Fi URL. When a phone remote connects, the QR box automatically collapses into an unobtrusive bottom status pill (`🟢 REMOTE CONNECTED • ROOM: XXXX`).
- **Mobile Web Remote (`/remote`):**
  - Anyone on the same Wi-Fi network can scan the TV's QR code to open the mobile controller in their browser.
  - Control playback, draw cards, flip/reveal, judge success/failure, assign player points, switch editions, or change game modes directly from any phone without touching the TV remote.
  - Powered by low-latency **Server-Sent Events (SSE)**.

---

### 🎶 Smart Audio Playback Engine
- **Instant Previews:** Zero-latency 30-second audio stream playback using HTML5 Audio.
- **Dual Fallback System:** Parses track release dates, metadata, and audio preview streams directly from Spotify's public embed data. If Spotify does not supply an audio preview, the server seamlessly queries the **iTunes Search API** to fetch a direct audio stream and high-res cover art.
- **Spotify Premium Web Playback SDK:** Optional Spotify OAuth login to play full uninterrupted tracks through Spotify Web API.

---

### 📦 Custom Playlist Studio & Database Support
- **Spotify Playlist Importer:** Paste any public Spotify playlist URL or Playlist ID to generate a playable card deck.
- **Diff & Sync Engine:** Automatically highlights brand-new tracks vs tracks already present in the catalog, allowing you to play the full playlist or "Play ONLY New Tracks".
- **Catalog Database Importer:** Paste an external gameset JSON URL into the playlist box to parse and permanently save game editions locally without needing to commit database files to Git.

---

### 📺 Standalone Android TV APK (`beatdrop-tv.apk`)
- A 100% standalone Android TV app that runs **without any external server or computer**.
- Features an **embedded local HTTP + SSE server** written in Kotlin running on port `3000`.
- Binds to the TV's Wi-Fi LAN IP so phones can connect directly to `http://<TV-IP>:3000/remote`.
- Includes custom TV banner (`tv_banner.png`), splash screen (`tv_splash.png`), and adaptive app icons.

---

## 🚀 Getting Started (Running the Server)

### Prerequisites
- **Node.js** (version 18 or higher recommended).
- **No external npm packages required!** The server is built purely with native Node.js standard libraries (`http`, `https`, `fs`, `path`, `os`, `url`).

### 1. Clone & Run

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/beatdrop.git
cd beatdrop

# Start the web server (listens on port 3000 by default)
npm start

# Or start in development mode with automatic restart on file change
npm run dev
```

### 2. Open in Your Browser
- **Main Desktop Game:** [http://localhost:3000/](http://localhost:3000/)
- **Dedicated TV Display View:** [http://localhost:3000/tv](http://localhost:3000/tv)
- **Phone Remote Controller:** [http://localhost:3000/remote](http://localhost:3000/remote) (or access via your local Wi-Fi IP, e.g. `http://192.168.1.X:3000/remote`)

---

## 📱 Building the Standalone Android TV APK

The repository includes a ready-to-build Android TV project in the `android-tv/` directory.

### Build Script
To compile a release APK:

```bash
# Ensure Android SDK is installed and ANDROID_HOME is set
./build-tv-apk.sh
# or
npm run build:apk
```

This compiles the standalone APK to:
- `beatdrop-tv.apk` (root directory)
- `public/beatdrop-tv.apk` (hosted directly by the web server for easy over-the-air installation via TV browser)

### Installing on Android TV via ADB
```bash
adb connect <YOUR-TV-IP>:5555
adb install -r beatdrop-tv.apk
```

---

## 🗂️ Project Structure

```text
beatdrop/
├── server.js                      # Core Node.js HTTP/SSE server & Spotify/iTunes resolvers
├── package.json                   # Project scripts and metadata (zero external npm dependencies)
├── build-tv-apk.sh                # Automated build script for Android TV APK
├── custom_playlists.json          # Persisted custom playlists (gitignored)
├── track_cache.json               # Cached Spotify/iTunes song metadata & preview URLs
├── gameset_database.json          # Optional local catalog of card editions (gitignored)
├── public/                        # Static web application files
│   ├── index.html                 # Main web application & TV display view (/ & /tv)
│   ├── remote.html                # Mobile phone remote controller interface (/remote)
│   ├── app.js                     # Client logic, 3D card rendering, audio engine, SSE sync
│   ├── remote.js                  # Mobile remote control interactions & state sync
│   ├── styles.css                 # Neon synthwave aesthetics, 3D card tilt & TV responsive layouts
│   └── beatdrop-tv.apk            # Downloadable TV APK hosted directly on local network
└── android-tv/                    # Android TV project
    ├── app/src/main/
    │   ├── java/com/beatdrop/tv/
    │   │   ├── MainActivity.kt               # TV full-screen WebView harness & media keys
    │   │   └── EmbeddedBeatdropServer.kt     # Standalone embedded Kotlin HTTP + SSE server
    │   └── res/                              # Android TV banners, splash screens, and icons
    └── build.gradle.kts                      # Gradle build configuration
```

---

## 🎮 Shortcuts & Controls

| Key / Button | Action |
| :--- | :--- |
| `Space` / `MediaPlayPause` | Play / Pause active track |
| `D-Pad Left / Right` | Select timeline slot in Timeline Mode |
| `Enter` / `D-Pad Center` | Activate focused button (Draw, Flip Card, Judge, Next Turn) |
| `Escape` | Close any active modal |

---

## 📄 License
This project is for personal, educational, and party entertainment use. Music preview audio and metadata are provided via Spotify public embed APIs and the Apple iTunes Search API.
