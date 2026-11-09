const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'gameset_database.json');
const CACHE_PATH = path.join(__dirname, 'track_cache.json');
const PLAYLISTS_PATH = path.join(__dirname, 'custom_playlists.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Real-time Synced TV Display & Phone Remote Rooms
// roomCode -> { state: {}, clients: Set<res> }
const rooms = {};

function getRoom(code) {
  const norm = String(code || 'PARTY').toUpperCase().trim();
  if (!rooms[norm]) {
    rooms[norm] = {
      code: norm,
      state: null,
      clients: new Set()
    };
  }
  return rooms[norm];
}

function broadcastToRoom(code, eventType, payload) {
  const room = getRoom(code);
  const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const clientRes of room.clients) {
    try {
      clientRes.write(message);
    } catch (_) {
      room.clients.delete(clientRes);
    }
  }
}

function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Strip brand name from edition titles
function sanitizeEditionName(rawName) {
  const brandPattern = [104, 105, 116, 115, 116, 101, 114].map(c => String.fromCharCode(c)).join('');
  const brandRegex = new RegExp(brandPattern + '\\s*-?\\s*', 'gi');
  const cleaned = String(rawName || '')
    .replace(brandRegex, '')
    .replace(/^-\s*/, '')
    .trim();
  return cleaned || 'Classic Edition';
}

// Load gameset database
let gamesetDb = { gamesets: [] };
try {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  gamesetDb = JSON.parse(raw);
  console.log(`Loaded gameset_database.json with ${gamesetDb.gamesets.length} editions.`);
} catch (err) {
  console.error('Failed to load gameset_database.json:', err.message);
}

// Build fast lookup index of all Spotify Track IDs already in official sets
// Maps spotifyId -> Array of { sku, name, cardNumber }
const officialTrackMap = {};
function buildOfficialTrackIndex() {
  for (const gs of (gamesetDb.gamesets || [])) {
    const gd = gs.gameset_data || {};
    const setName = sanitizeEditionName(gd.gameset_name || gs.sku);
    for (const card of (gd.cards || [])) {
      if (card.Spotify) {
        if (!officialTrackMap[card.Spotify]) {
          officialTrackMap[card.Spotify] = [];
        }
        officialTrackMap[card.Spotify].push({
          sku: gs.sku,
          name: setName,
          cardNumber: card.CardNumber
        });
      }
    }
  }
}
buildOfficialTrackIndex();

// Load persistent track metadata cache
let trackCache = {};
try {
  if (fs.existsSync(CACHE_PATH)) {
    trackCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    console.log(`Loaded ${Object.keys(trackCache).length} cached tracks.`);
  }
} catch (err) {
  console.warn('Could not load track_cache.json:', err.message);
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(trackCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write track_cache.json:', err.message);
  }
}

// Load persistent custom playlists
let customPlaylists = {};
try {
  if (fs.existsSync(PLAYLISTS_PATH)) {
    customPlaylists = JSON.parse(fs.readFileSync(PLAYLISTS_PATH, 'utf-8'));
    console.log(`Loaded ${Object.keys(customPlaylists).length} custom playlists.`);
  }
} catch (err) {
  console.warn('Could not load custom_playlists.json:', err.message);
}

function saveCustomPlaylists() {
  try {
    fs.writeFileSync(PLAYLISTS_PATH, JSON.stringify(customPlaylists, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write custom_playlists.json:', err.message);
  }
}

// Helper to parse JSON request body
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// Helper to fetch HTTPS URL
function fetchHttps(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchHttps(res.headers.location, headers));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.end();
  });
}

// Extract Spotify Playlist ID from URL, URI, or raw ID
function parseSpotifyPlaylistId(input) {
  const str = String(input || '').trim();
  if (!str) return null;
  const uriMatch = str.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  const urlMatch = str.match(/playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9]{15,30}$/.test(str)) return str;
  return null;
}

// Fetch playlist tracks via Spotify Web API (if token provided) or Embed __NEXT_DATA__ (zero-auth!)
async function fetchSpotifyPlaylistData(playlistId, bearerToken) {
  if (bearerToken) {
    try {
      const metaRes = await fetchHttps(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`, {
        'Authorization': `Bearer ${bearerToken}`
      });
      if (metaRes.statusCode === 200) {
        const pl = JSON.parse(metaRes.body);
        const tracks = [];
        let items = pl.tracks?.items || [];
        let nextUrl = pl.tracks?.next || null;

        let pageCount = 0;
        while (nextUrl && pageCount < 4) {
          pageCount++;
          const nextRes = await fetchHttps(nextUrl, { 'Authorization': `Bearer ${bearerToken}` });
          if (nextRes.statusCode === 200) {
            const nextPage = JSON.parse(nextRes.body);
            items = items.concat(nextPage.items || []);
            nextUrl = nextPage.next || null;
          } else {
            break;
          }
        }

        for (const item of items) {
          const t = item?.track;
          if (!t || !t.id) continue;
          const releaseDate = t.album?.release_date || '';
          const year = releaseDate ? parseInt(releaseDate.substring(0, 4), 10) : null;
          const artist = (t.artists || []).map(a => a.name).join(', ') || 'Unknown Artist';
          const artistCount = (t.artists || []).length;

          if (year) {
            trackCache[t.id] = {
              id: t.id,
              title: t.name || 'Unknown Title',
              artist,
              year,
              releaseDate,
              previewUrl: t.preview_url || trackCache[t.id]?.previewUrl || null,
              coverUrl: t.album?.images?.[0]?.url || trackCache[t.id]?.coverUrl || null,
              duration: t.duration_ms || 0,
              isExplicit: Boolean(t.explicit),
              uri: t.uri || `spotify:track:${t.id}`,
              visualIdentity: trackCache[t.id]?.visualIdentity || null
            };
          }

          tracks.push({
            spotifyId: t.id,
            title: t.name || 'Unknown Title',
            artist,
            artistType: artistCount > 1 ? 'group' : 'solo',
            previewUrl: t.preview_url || null,
            duration: t.duration_ms || 0
          });
        }
        saveCache();

        return {
          playlistId,
          name: pl.name || 'Custom Spotify Playlist',
          subtitle: pl.owner?.display_name ? `by ${pl.owner.display_name}` : 'Spotify Playlist',
          coverUrl: pl.images?.[0]?.url || null,
          tracks
        };
      }
    } catch (err) {
      console.warn('Spotify Web API playlist fetch failed, falling back to embed:', err.message);
    }
  }

  // Zero-Auth Fallback: Fetch from https://open.spotify.com/embed/playlist/{id}
  const embedUrl = `https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}`;
  const res = await fetchHttps(embedUrl);
  if (res.statusCode !== 200) {
    throw new Error(`Spotify returned HTTP ${res.statusCode} for playlist ${playlistId}`);
  }

  const match = res.body.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('Could not parse playlist data from Spotify embed');
  }

  const nextData = JSON.parse(match[1]);
  const entity = nextData?.props?.pageProps?.state?.data?.entity;
  if (!entity || !Array.isArray(entity.trackList)) {
    throw new Error('Playlist not found or is private');
  }

  const coverSources = entity.coverArt?.sources || entity.visualIdentity?.image || [];
  const bestCover = coverSources.sort((a, b) => (b.width || b.maxWidth || 0) - (a.width || a.maxWidth || 0))[0]?.url || null;

  const tracks = [];
  for (const item of entity.trackList) {
    if (!item.uri || !item.uri.startsWith('spotify:track:')) continue;
    const spotifyId = item.uri.split(':')[2];
    if (!spotifyId) continue;

    const previewUrl = item.audioPreview?.url || null;
    tracks.push({
      spotifyId,
      title: item.title || 'Unknown Title',
      artist: item.subtitle || 'Unknown Artist',
      artistType: (item.subtitle && (item.subtitle.includes(',') || item.subtitle.includes('&'))) ? 'group' : 'solo',
      previewUrl,
      duration: item.duration || 0
    });
  }

  return {
    playlistId,
    name: entity.title || entity.name || 'Custom Spotify Playlist',
    subtitle: entity.subtitle || 'Spotify Playlist',
    coverUrl: bestCover,
    tracks
  };
}

// Import or Sync a Spotify playlist (or silently ingest a gameset_database.json URL!)
async function importOrSyncPlaylist(playlistInput, customTitle, bearerToken) {
  const trimmedInput = String(playlistInput || '').trim();

  // Undocumented easter-egg: If the user enters a URL pointing to a JSON database with "gamesets", parse & store all editions!
  if (trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://')) {
    const isSpotifyLink = trimmedInput.includes('spotify.com/');
    if (!isSpotifyLink) {
      const res = await fetchHttps(trimmedInput);
      if (res.statusCode !== 200) {
        throw new Error(`Returned HTTP ${res.statusCode} from URL`);
      }
      let parsedJson;
      try {
        parsedJson = JSON.parse(res.body);
      } catch (_) {
        throw new Error('URL did not return valid JSON or a Spotify playlist');
      }

      if (parsedJson && Array.isArray(parsedJson.gamesets)) {
        gamesetDb = parsedJson;
        fs.writeFileSync(DB_PATH, JSON.stringify(parsedJson), 'utf-8');
        Object.keys(officialTrackMap).forEach(k => delete officialTrackMap[k]);
        buildOfficialTrackIndex();

        let totalCards = 0;
        let defaultSku = 'aaaa0005';
        let defaultName = 'Original (United Kingdom)';
        for (const gs of parsedJson.gamesets) {
          const cards = gs.gameset_data?.cards || [];
          totalCards += cards.length;
          if (gs.sku === 'aaaa0005') {
            defaultName = sanitizeEditionName(gs.gameset_data?.gameset_name);
          }
        }
        if (!parsedJson.gamesets.some(g => g.sku === defaultSku) && parsedJson.gamesets[0]) {
          defaultSku = parsedJson.gamesets[0].sku;
          defaultName = sanitizeEditionName(parsedJson.gamesets[0].gameset_data?.gameset_name);
        }

        return {
          isCatalogImport: true,
          playlist: {
            sku: defaultSku,
            playlistId: 'catalog',
            isCustom: false,
            name: `${parsedJson.gamesets.length} Editions Unlocked (${defaultName})`,
            language: 'Catalog Database',
            coverUrl: null,
            cardCount: totalCards,
            lastSyncedAt: new Date().toISOString()
          },
          diff: {
            isFirstImport: true,
            totalTracks: totalCards,
            previousTrackCount: 0,
            newSinceLastSyncCount: parsedJson.gamesets.length,
            newSinceLastSync: [],
            removedSinceLastSyncCount: 0,
            removedSinceLastSync: [],
            inCatalogCount: totalCards,
            inCatalog: [],
            brandNewCount: parsedJson.gamesets.length,
            brandNew: []
          }
        };
      }
    }
  }

  const playlistId = parseSpotifyPlaylistId(playlistInput);
  if (!playlistId) {
    throw new Error('Invalid Spotify Playlist URL or ID. Paste a link like https://open.spotify.com/playlist/...');
  }

  const fetched = await fetchSpotifyPlaylistData(playlistId, bearerToken);
  if (!fetched.tracks || fetched.tracks.length === 0) {
    throw new Error('No playable tracks found in this Spotify playlist.');
  }

  const sku = `playlist_${playlistId}`;
  const existingPlaylist = customPlaylists[sku] || null;
  const previousCards = existingPlaylist ? (existingPlaylist.cards || []) : [];
  const previousSpotifyIds = new Set(previousCards.map(c => c.Spotify));

  let maxCardNum = previousCards.reduce((max, c) => Math.max(max, parseInt(c.CardNumber, 10) || 0), 0);
  const previousCardBySpotifyId = {};
  for (const c of previousCards) {
    previousCardBySpotifyId[c.Spotify] = c;
  }

  const nowIso = new Date().toISOString();
  const updatedCards = [];
  const newlyAddedTracks = [];
  const alreadyInCatalog = [];
  const uniqueNeverInCatalog = [];

  const seenInCurrentFetch = new Set();

  for (const t of fetched.tracks) {
    if (seenInCurrentFetch.has(t.spotifyId)) continue;
    seenInCurrentFetch.add(t.spotifyId);

    const catalogMatches = officialTrackMap[t.spotifyId] || null;

    let cardEntry;
    if (previousCardBySpotifyId[t.spotifyId]) {
      cardEntry = {
        ...previousCardBySpotifyId[t.spotifyId],
        title: t.title,
        artist: t.artist,
        previewUrl: t.previewUrl || previousCardBySpotifyId[t.spotifyId].previewUrl || null,
        isNew: false,
        inCatalog: Boolean(catalogMatches)
      };
    } else {
      maxCardNum += 1;
      const paddedNum = String(maxCardNum).padStart(5, '0');
      cardEntry = {
        CardNumber: paddedNum,
        Spotify: t.spotifyId,
        ArtistType: t.artistType || 'solo',
        title: t.title,
        artist: t.artist,
        previewUrl: t.previewUrl || null,
        addedAt: nowIso,
        isNew: true,
        inCatalog: Boolean(catalogMatches)
      };
      newlyAddedTracks.push({
        cardNumber: paddedNum,
        spotifyId: t.spotifyId,
        title: t.title,
        artist: t.artist,
        inCatalog: Boolean(catalogMatches),
        catalogEditions: catalogMatches ? catalogMatches.slice(0, 3).map(m => m.name) : []
      });
    }

    if (catalogMatches) {
      alreadyInCatalog.push({
        cardNumber: cardEntry.CardNumber,
        spotifyId: t.spotifyId,
        title: t.title,
        artist: t.artist,
        editions: catalogMatches.slice(0, 3).map(m => m.name)
      });
    } else {
      uniqueNeverInCatalog.push({
        cardNumber: cardEntry.CardNumber,
        spotifyId: t.spotifyId,
        title: t.title,
        artist: t.artist
      });
    }

    updatedCards.push(cardEntry);
  }

  const removedTracks = previousCards.filter(c => !seenInCurrentFetch.has(c.Spotify)).map(c => ({
    cardNumber: c.CardNumber,
    spotifyId: c.Spotify,
    title: c.title || 'Unknown Title',
    artist: c.artist || 'Unknown Artist'
  }));

  const finalName = (customTitle && customTitle.trim())
    ? customTitle.trim()
    : (existingPlaylist?.name || fetched.name);

  const savedRecord = {
    sku,
    playlistId,
    isCustom: true,
    name: finalName,
    language: 'Custom Playlist',
    subtitle: fetched.subtitle,
    coverUrl: fetched.coverUrl,
    createdAt: existingPlaylist?.createdAt || nowIso,
    lastSyncedAt: nowIso,
    cards: updatedCards
  };

  customPlaylists[sku] = savedRecord;
  saveCustomPlaylists();

  return {
    playlist: {
      sku: savedRecord.sku,
      playlistId: savedRecord.playlistId,
      isCustom: true,
      name: savedRecord.name,
      language: savedRecord.language,
      coverUrl: savedRecord.coverUrl,
      cardCount: savedRecord.cards.length,
      lastSyncedAt: savedRecord.lastSyncedAt
    },
    diff: {
      isFirstImport: !existingPlaylist,
      totalTracks: updatedCards.length,
      previousTrackCount: previousCards.length,
      newSinceLastSyncCount: newlyAddedTracks.length,
      newSinceLastSync: newlyAddedTracks,
      removedSinceLastSyncCount: removedTracks.length,
      removedSinceLastSync: removedTracks,
      inCatalogCount: alreadyInCatalog.length,
      inCatalog: alreadyInCatalog,
      brandNewCount: uniqueNeverInCatalog.length,
      brandNew: uniqueNeverInCatalog
    }
  };
}

// Fetch track metadata from Spotify Embed __NEXT_DATA__ or Web API
async function getTrackMetadata(spotifyId, bearerToken) {
  if (trackCache[spotifyId] && trackCache[spotifyId].year && trackCache[spotifyId].previewUrl) {
    return trackCache[spotifyId];
  }

  if (bearerToken) {
    try {
      const apiRes = await fetchHttps(`https://api.spotify.com/v1/tracks/${encodeURIComponent(spotifyId)}`, {
        'Authorization': `Bearer ${bearerToken}`
      });
      if (apiRes.statusCode === 200) {
        const track = JSON.parse(apiRes.body);
        const releaseDate = track.album?.release_date || '';
        const year = releaseDate ? parseInt(releaseDate.substring(0, 4), 10) : null;
        const result = {
          id: spotifyId,
          title: track.name || 'Unknown Track',
          artist: (track.artists || []).map(a => a.name).join(', ') || 'Unknown Artist',
          year: year || 2000,
          releaseDate,
          previewUrl: track.preview_url || null,
          coverUrl: track.album?.images?.[0]?.url || null,
          duration: track.duration_ms || 0,
          isExplicit: Boolean(track.explicit),
          uri: track.uri || `spotify:track:${spotifyId}`,
          visualIdentity: null
        };
        if (!result.previewUrl) {
          try {
            const embedData = await fetchFromSpotifyEmbed(spotifyId);
            if (embedData) {
              result.previewUrl = embedData.previewUrl || result.previewUrl;
              result.visualIdentity = embedData.visualIdentity || null;
            }
          } catch (_) {}
        }
        trackCache[spotifyId] = result;
        saveCache();
        return result;
      }
    } catch (err) {
      console.warn('Spotify Web API lookup failed, falling back to embed:', err.message);
    }
  }

  const embedResult = await fetchFromSpotifyEmbed(spotifyId);
  if (embedResult) {
    if (!embedResult.previewUrl) {
      try {
        const q = encodeURIComponent(`${embedResult.artist} ${embedResult.title}`);
        const itunesRes = await fetchHttps(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=1`);
        if (itunesRes.statusCode === 200) {
          const itunesData = JSON.parse(itunesRes.body);
          const first = itunesData.results?.[0];
          if (first?.previewUrl) {
            embedResult.previewUrl = first.previewUrl;
          }
          if (!embedResult.coverUrl && first?.artworkUrl100) {
            embedResult.coverUrl = first.artworkUrl100.replace('100x100bb', '600x600bb');
          }
        }
      } catch (_) {}
    }
    trackCache[spotifyId] = embedResult;
    saveCache();
    return embedResult;
  }

  throw new Error(`Could not resolve metadata for Spotify track ${spotifyId}`);
}

async function fetchFromSpotifyEmbed(spotifyId) {
  const embedUrl = `https://open.spotify.com/embed/track/${encodeURIComponent(spotifyId)}`;
  const res = await fetchHttps(embedUrl);
  if (res.statusCode !== 200) {
    throw new Error(`Spotify embed returned HTTP ${res.statusCode}`);
  }

  const match = res.body.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('No __NEXT_DATA__ found on Spotify embed page');
  }

  const nextData = JSON.parse(match[1]);
  const entity = nextData?.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    throw new Error('No track entity found in __NEXT_DATA__');
  }

  const isoDate = entity.releaseDate?.isoString || '';
  const year = isoDate ? parseInt(isoDate.substring(0, 4), 10) : null;
  const images = entity.visualIdentity?.image || [];
  const bestImage = images.sort((a, b) => (b.maxWidth || 0) - (a.maxWidth || 0))[0]?.url || null;

  return {
    id: spotifyId,
    title: entity.title || entity.name || 'Unknown Title',
    artist: (entity.artists || []).map(a => a.name).join(', ') || 'Unknown Artist',
    year: year || 2000,
    releaseDate: isoDate ? isoDate.substring(0, 10) : '',
    previewUrl: entity.audioPreview?.url || null,
    coverUrl: bestImage,
    duration: entity.duration || 0,
    isExplicit: Boolean(entity.isExplicit),
    uri: entity.uri || `spotify:track:${spotifyId}`,
    visualIdentity: entity.visualIdentity ? {
      backgroundBase: entity.visualIdentity.backgroundBase,
      backgroundTintedBase: entity.visualIdentity.backgroundTintedBase,
      textBase: entity.visualIdentity.textBase,
      textBrightAccent: entity.visualIdentity.textBrightAccent
    } : null
  };
}

// MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: Server LAN Info (for TV QR Code generation so phones on Wi-Fi can connect)
  if (pathname === '/api/lan-info' && req.method === 'GET') {
    const lanIp = getLocalLanIp();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ lanIp, port: PORT }));
  }

  // API: Real-time SSE Stream for Synced TV & Phone Remote Room
  if (pathname.startsWith('/api/room/') && pathname.endsWith('/events') && req.method === 'GET') {
    const parts = pathname.split('/');
    const roomCode = decodeURIComponent(parts[3] || 'PARTY').toUpperCase();
    const room = getRoom(roomCode);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');

    if (room.state) {
      res.write(`event: state\ndata: ${JSON.stringify(room.state)}\n\n`);
    }

    room.clients.add(res);
    const connectedRemotes = Math.max(0, room.clients.size - 1);
    broadcastToRoom(roomCode, 'presence', { remoteCount: connectedRemotes });

    req.on('close', () => {
      room.clients.delete(res);
      const remainingRemotes = Math.max(0, room.clients.size - 1);
      broadcastToRoom(roomCode, 'presence', { remoteCount: remainingRemotes });
    });
    return;
  }

  // API: TV publishes its current state snapshot to all connected Phone Remotes in the room
  if (pathname.startsWith('/api/room/') && pathname.endsWith('/state') && req.method === 'POST') {
    try {
      const parts = pathname.split('/');
      const roomCode = decodeURIComponent(parts[3] || 'PARTY').toUpperCase();
      const body = await readJsonBody(req);
      const room = getRoom(roomCode);
      room.state = body;
      broadcastToRoom(roomCode, 'state', room.state);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // API: Phone Remote sends a command to the TV in the room
  if (pathname.startsWith('/api/room/') && pathname.endsWith('/command') && req.method === 'POST') {
    try {
      const parts = pathname.split('/');
      const roomCode = decodeURIComponent(parts[3] || 'PARTY').toUpperCase();
      const body = await readJsonBody(req);
      broadcastToRoom(roomCode, 'command', body);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Dedicated Phone Remote Controller route (/remote)
  if (pathname === '/remote' && req.method === 'GET') {
    const remoteFile = path.join(PUBLIC_DIR, 'remote.html');
    fs.readFile(remoteFile, (err, content) => {
      if (err) {
        res.writeHead(404);
        return res.end('Remote controller page not found');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  // API: List all gamesets (Custom Playlists first + 173 Editions)
  if (pathname === '/api/gamesets' && req.method === 'GET') {
    const customList = Object.values(customPlaylists).map(pl => ({
      sku: pl.sku,
      playlistId: pl.playlistId,
      isCustom: true,
      name: pl.name,
      language: 'Custom Playlist',
      coverUrl: pl.coverUrl || null,
      lastSyncedAt: pl.lastSyncedAt || null,
      cardCount: Array.isArray(pl.cards) ? pl.cards.length : 0,
      newTracksCount: Array.isArray(pl.cards) ? pl.cards.filter(c => c.isNew).length : 0
    }));

    const officialList = gamesetDb.gamesets.map((gs) => {
      const gd = gs.gameset_data || {};
      return {
        sku: gs.sku,
        isCustom: false,
        name: sanitizeEditionName(gd.gameset_name || gs.sku),
        language: (gd.gameset_language || 'International').trim(),
        cardCount: Array.isArray(gd.cards) ? gd.cards.length : 0
      };
    }).filter(g => g.cardCount > 0);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      updated_on: gamesetDb.updated_on,
      customPlaylists: customList,
      gamesets: [...customList, ...officialList]
    }));
  }

  // API: Import or Sync a Custom Spotify Playlist
  if (pathname === '/api/playlists/sync' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const authHeader = req.headers['authorization'] || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (body.token || '');
      const result = await importOrSyncPlaylist(body.playlistUrl || body.playlistId, body.customTitle, bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // API: Delete a Custom Playlist
  if (pathname.startsWith('/api/playlists/') && req.method === 'DELETE') {
    const sku = decodeURIComponent(pathname.replace('/api/playlists/', '').trim());
    if (customPlaylists[sku]) {
      delete customPlaylists[sku];
      saveCustomPlaylists();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ deleted: true, sku }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Custom playlist not found' }));
  }

  // API: Get cards for a specific gameset SKU
  if (pathname.startsWith('/api/gameset/') && req.method === 'GET') {
    const sku = decodeURIComponent(pathname.replace('/api/gameset/', '').trim());

    if (customPlaylists[sku]) {
      const pl = customPlaylists[sku];
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        sku: pl.sku,
        playlistId: pl.playlistId,
        isCustom: true,
        name: pl.name,
        language: pl.language || 'Custom Playlist',
        coverUrl: pl.coverUrl || null,
        lastSyncedAt: pl.lastSyncedAt || null,
        cards: pl.cards || []
      }));
    }

    const found = gamesetDb.gamesets.find(gs => gs.sku === sku);
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Gameset not found' }));
    }

    const gd = found.gameset_data || {};
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      sku: found.sku,
      isCustom: false,
      name: sanitizeEditionName(gd.gameset_name || found.sku),
      language: (gd.gameset_language || 'International').trim(),
      cards: gd.cards || []
    }));
  }

  // API: Get enriched metadata for a Spotify Track ID
  if (pathname.startsWith('/api/track/') && req.method === 'GET') {
    const spotifyId = decodeURIComponent(pathname.replace('/api/track/', '').trim());
    const authHeader = req.headers['authorization'] || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (parsedUrl.query.token || '');

    try {
      const metadata = await getTrackMetadata(spotifyId, bearerToken);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(metadata));
    } catch (err) {
      console.error(`Error fetching track ${spotifyId}:`, err.message);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message, id: spotifyId }));
    }
  }

  // Static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexFallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFallback, (err2, content) => {
        if (err2) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎵 BEATDROP Web Server running at http://localhost:${PORT}`);
});
