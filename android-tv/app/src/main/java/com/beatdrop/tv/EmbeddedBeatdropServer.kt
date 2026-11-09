package com.beatdrop.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.net.URLDecoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors

class EmbeddedBeatdropServer(private val context: Context, private val port: Int = 3000) {
    private var serverSocket: ServerSocket? = null
    @Volatile private var running = false
    private val executor = Executors.newCachedThreadPool()

    private var gamesetDb = JSONObject().put("gamesets", JSONArray())
    private val officialTrackMap = ConcurrentHashMap<String, MutableList<JSONObject>>()
    private val trackCache = ConcurrentHashMap<String, JSONObject>()
    private val customPlaylists = ConcurrentHashMap<String, JSONObject>()

    private val trackCacheFile get() = File(context.filesDir, "track_cache.json")
    private val customPlaylistsFile get() = File(context.filesDir, "custom_playlists.json")
    private val fallbackDbFile get() = File(context.filesDir, "gameset_database.json")

    // Synced TV & Phone Remote Rooms
    class RoomSession(val code: String) {
        @Volatile var state: JSONObject? = null
        val clients = CopyOnWriteArraySet<OutputStream>()
    }
    private val rooms = ConcurrentHashMap<String, RoomSession>()

    fun start() {
        if (running) return
        running = true
        // Bind the listening socket immediately on start so neither the TV WebView nor Phone Remotes ever get Connection Refused!
        executor.execute {
            try {
                val sock = ServerSocket()
                sock.reuseAddress = true
                sock.bind(InetSocketAddress("0.0.0.0", port), 50)
                serverSocket = sock
            } catch (e: Exception) {
                e.printStackTrace()
                return@execute
            }

            // Load persisted JSON data in a background thread so accepting connections is never blocked
            executor.execute {
                loadPersistedData()
            }

            while (running) {
                try {
                    val client = serverSocket?.accept() ?: break
                    executor.execute { handleClient(client) }
                } catch (_: Exception) {
                    if (!running) break
                }
            }
        }
    }

    fun stop() {
        running = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {}
    }

    private fun sanitizeEditionName(raw: String?): String {
        val brandPattern = charArrayOf('h', 'i', 't', 's', 't', 'e', 'r').joinToString("")
        val cleaned = (raw ?: "")
            .replace(Regex("$brandPattern\\s*-?\\s*", RegexOption.IGNORE_CASE), "")
            .replace(Regex("^-\\s*"), "")
            .trim()
        return if (cleaned.isEmpty()) "Classic Edition" else cleaned
    }

    private fun loadPersistedData() {
        // 1. Load gameset_database.json ONLY if the user previously imported it into local storage
        try {
            if (fallbackDbFile.exists()) {
                gamesetDb = JSONObject(fallbackDbFile.readText())
                buildOfficialTrackIndex()
            }
        } catch (_: Exception) {}

        // 2. Load cached track metadata
        try {
            if (trackCacheFile.exists()) {
                val obj = JSONObject(trackCacheFile.readText())
                obj.keys().forEach { k -> trackCache[k] = obj.getJSONObject(k) }
            }
        } catch (_: Exception) {}

        // 3. Load saved custom playlists
        try {
            if (customPlaylistsFile.exists()) {
                val obj = JSONObject(customPlaylistsFile.readText())
                obj.keys().forEach { k -> customPlaylists[k] = obj.getJSONObject(k) }
            }
        } catch (_: Exception) {}
    }

    private fun buildOfficialTrackIndex() {
        val sets = gamesetDb.optJSONArray("gamesets") ?: return
        for (i in 0 until sets.length()) {
            val gs = sets.optJSONObject(i) ?: continue
            val sku = gs.optString("sku")
            val gd = gs.optJSONObject("gameset_data") ?: continue
            val setName = sanitizeEditionName(gd.optString("gameset_name", sku))
            val cards = gd.optJSONArray("cards") ?: continue
            for (j in 0 until cards.length()) {
                val c = cards.optJSONObject(j) ?: continue
                val sp = c.optString("Spotify")
                if (sp.isNotEmpty()) {
                    val list = officialTrackMap.getOrPut(sp) { mutableListOf() }
                    list.add(JSONObject().put("sku", sku).put("name", setName).put("cardNumber", c.optString("CardNumber")))
                }
            }
        }
    }

    @Synchronized
    private fun saveTrackCache() {
        try {
            val root = JSONObject()
            trackCache.forEach { (k, v) -> root.put(k, v) }
            trackCacheFile.writeText(root.toString())
        } catch (_: Exception) {}
    }

    @Synchronized
    private fun saveCustomPlaylists() {
        try {
            val root = JSONObject()
            customPlaylists.forEach { (k, v) -> root.put(k, v) }
            customPlaylistsFile.writeText(root.toString())
        } catch (_: Exception) {}
    }

    private fun getLocalLanIp(): String {
        // 1. Try Android WifiManager first (most accurate on Chromecast / Android TV)
        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
            val ipInt = wifiManager?.connectionInfo?.ipAddress ?: 0
            if (ipInt != 0) {
                val ipStr = String.format(
                    java.util.Locale.US,
                    "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
                if (ipStr != "0.0.0.0" && ipStr != "127.0.0.1") {
                    return ipStr
                }
            }
        } catch (_: Exception) {}

        // 2. Fallback to NetworkInterfaces prioritizing wlan / eth interfaces
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()?.toList() ?: emptyList()
            val sorted = interfaces.sortedBy { iface ->
                val n = iface.name.lowercase()
                when {
                    n.startsWith("wlan") -> 0
                    n.startsWith("eth") -> 1
                    n.startsWith("en") -> 2
                    else -> 3
                }
            }
            for (iface in sorted) {
                if (iface.isLoopback || !iface.isUp) continue
                val addrs = iface.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val host = addr.hostAddress ?: continue
                        if (!host.startsWith("169.254.")) {
                            return host
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        return "127.0.0.1"
    }

    private fun handleClient(socket: Socket) {
        try {
            socket.soTimeout = 15000
            socket.tcpNoDelay = true
            val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.UTF_8))
            val out = socket.getOutputStream()

            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return
            val method = parts[0].uppercase()
            val fullUri = parts[1]
            val pathname = fullUri.substringBefore("?")

            val headers = mutableMapOf<String, String>()
            var contentLength = 0
            while (true) {
                val line = reader.readLine() ?: break
                if (line.isEmpty()) break
                val idx = line.indexOf(':')
                if (idx > 0) {
                    val k = line.substring(0, idx).trim().lowercase()
                    val v = line.substring(idx + 1).trim()
                    headers[k] = v
                    if (k == "content-length") contentLength = v.toIntOrNull() ?: 0
                }
            }

            if (method == "OPTIONS") {
                sendResponse(out, 204, "text/plain", ByteArray(0))
                socket.close()
                return
            }

            var bodyStr = ""
            if (contentLength > 0) {
                val buf = CharArray(contentLength)
                var read = 0
                while (read < contentLength) {
                    val r = reader.read(buf, read, contentLength - read)
                    if (r == -1) break
                    read += r
                }
                bodyStr = String(buf, 0, read)
            }

            // Route 1: LAN IP Info for TV QR Code
            if (pathname == "/api/lan-info" && method == "GET") {
                val json = JSONObject().put("lanIp", getLocalLanIp()).put("port", port)
                sendJson(out, 200, json.toString())
                socket.close()
                return
            }

            // Route 2: SSE Room Stream (/api/room/:code/events)
            if (pathname.startsWith("/api/room/") && pathname.endsWith("/events") && method == "GET") {
                socket.soTimeout = 0
                val roomCode = URLDecoder.decode(pathname.split("/").getOrElse(3) { "PARTY" }, "UTF-8").uppercase()
                val room = rooms.getOrPut(roomCode) { RoomSession(roomCode) }

                val sseHeaders = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: text/event-stream\r\n" +
                        "Cache-Control: no-cache\r\n" +
                        "Connection: keep-alive\r\n" +
                        "Access-Control-Allow-Origin: *\r\n\r\n: connected\n\n"
                out.write(sseHeaders.toByteArray(Charsets.UTF_8))
                out.flush()

                room.state?.let { st ->
                    out.write("event: state\ndata: $st\n\n".toByteArray(Charsets.UTF_8))
                    out.flush()
                }

                room.clients.add(out)
                val connectedRemotes = (room.clients.size - 1).coerceAtLeast(0)
                broadcastRoomEvent(room, "presence", JSONObject().put("remoteCount", connectedRemotes).toString())

                // Keep socket open until client disconnects
                try {
                    while (running && socket.isConnected && !socket.isClosed) {
                        if (reader.read() == -1) break
                    }
                } catch (_: Exception) {
                } finally {
                    room.clients.remove(out)
                    val remainingRemotes = (room.clients.size - 1).coerceAtLeast(0)
                    broadcastRoomEvent(room, "presence", JSONObject().put("remoteCount", remainingRemotes).toString())
                    socket.close()
                }
                return
            }

            // Route 3: Room State Update (/api/room/:code/state)
            if (pathname.startsWith("/api/room/") && pathname.endsWith("/state") && method == "POST") {
                val roomCode = URLDecoder.decode(pathname.split("/").getOrElse(3) { "PARTY" }, "UTF-8").uppercase()
                val room = rooms.getOrPut(roomCode) { RoomSession(roomCode) }
                val stateJson = if (bodyStr.isNotEmpty()) JSONObject(bodyStr) else JSONObject()
                room.state = stateJson
                broadcastRoomEvent(room, "state", stateJson.toString())
                sendJson(out, 200, """{"ok":true}""")
                socket.close()
                return
            }

            // Route 4: Room Command from Phone Remote (/api/room/:code/command)
            if (pathname.startsWith("/api/room/") && pathname.endsWith("/command") && method == "POST") {
                val roomCode = URLDecoder.decode(pathname.split("/").getOrElse(3) { "PARTY" }, "UTF-8").uppercase()
                val room = rooms.getOrPut(roomCode) { RoomSession(roomCode) }
                broadcastRoomEvent(room, "command", bodyStr)
                sendJson(out, 200, """{"ok":true}""")
                socket.close()
                return
            }

            // Route 5: List All Gamesets (/api/gamesets)
            if (pathname == "/api/gamesets" && method == "GET") {
                val customArr = JSONArray()
                val combinedArr = JSONArray()

                customPlaylists.values.forEach { pl ->
                    val cards = pl.optJSONArray("cards") ?: JSONArray()
                    var newCount = 0
                    for (i in 0 until cards.length()) {
                        if (cards.optJSONObject(i)?.optBoolean("isNew") == true) newCount++
                    }
                    val item = JSONObject()
                        .put("sku", pl.optString("sku"))
                        .put("playlistId", pl.optString("playlistId"))
                        .put("isCustom", true)
                        .put("name", pl.optString("name"))
                        .put("language", "Custom Playlist")
                        .put("coverUrl", pl.optString("coverUrl", null))
                        .put("lastSyncedAt", pl.optString("lastSyncedAt", null))
                        .put("cardCount", cards.length())
                        .put("newTracksCount", newCount)
                    customArr.put(item)
                    combinedArr.put(item)
                }

                val sets = gamesetDb.optJSONArray("gamesets") ?: JSONArray()
                for (i in 0 until sets.length()) {
                    val gs = sets.optJSONObject(i) ?: continue
                    val gd = gs.optJSONObject("gameset_data") ?: continue
                    val cards = gd.optJSONArray("cards") ?: continue
                    if (cards.length() == 0) continue
                    val item = JSONObject()
                        .put("sku", gs.optString("sku"))
                        .put("isCustom", false)
                        .put("name", sanitizeEditionName(gd.optString("gameset_name")))
                        .put("language", gd.optString("gameset_language", "International").trim())
                        .put("cardCount", cards.length())
                    combinedArr.put(item)
                }

                val resp = JSONObject()
                    .put("customPlaylists", customArr)
                    .put("gamesets", combinedArr)
                sendJson(out, 200, resp.toString())
                socket.close()
                return
            }

            // Route 6: Get Specific Gameset Cards (/api/gameset/:sku)
            if (pathname.startsWith("/api/gameset/") && method == "GET") {
                val sku = URLDecoder.decode(pathname.removePrefix("/api/gameset/").trim(), "UTF-8")
                customPlaylists[sku]?.let { pl ->
                    sendJson(out, 200, pl.toString())
                    socket.close()
                    return
                }
                val sets = gamesetDb.optJSONArray("gamesets") ?: JSONArray()
                var found: JSONObject? = null
                for (i in 0 until sets.length()) {
                    val gs = sets.optJSONObject(i) ?: continue
                    if (gs.optString("sku") == sku) {
                        val gd = gs.optJSONObject("gameset_data") ?: JSONObject()
                        found = JSONObject()
                            .put("sku", sku)
                            .put("isCustom", false)
                            .put("name", sanitizeEditionName(gd.optString("gameset_name")))
                            .put("language", gd.optString("gameset_language", "International").trim())
                            .put("cards", gd.optJSONArray("cards") ?: JSONArray())
                        break
                    }
                }
                if (found != null) {
                    sendJson(out, 200, found.toString())
                } else {
                    sendJson(out, 404, """{"error":"Edition not found"}""")
                }
                socket.close()
                return
            }

            // Route 7: Sync / Import Custom Spotify Playlist (/api/playlists/sync)
            if (pathname == "/api/playlists/sync" && method == "POST") {
                try {
                    val reqObj = JSONObject(bodyStr)
                    val inputUrl = reqObj.optString("playlistUrl", reqObj.optString("playlistId"))
                    val customTitle = reqObj.optString("customTitle")
                    val syncRes = importOrSyncPlaylist(inputUrl, customTitle)
                    sendJson(out, 200, syncRes.toString())
                } catch (e: Exception) {
                    sendJson(out, 400, JSONObject().put("error", e.message ?: "Failed to sync").toString())
                }
                socket.close()
                return
            }

            // Route 8: Delete Custom Playlist (/api/playlists/:sku)
            if (pathname.startsWith("/api/playlists/") && method == "DELETE") {
                val sku = URLDecoder.decode(pathname.removePrefix("/api/playlists/").trim(), "UTF-8")
                customPlaylists.remove(sku)
                saveCustomPlaylists()
                sendJson(out, 200, """{"deleted":true}""")
                socket.close()
                return
            }

            // Route 9: Resolve Track Metadata (/api/track/:spotifyId)
            if (pathname.startsWith("/api/track/") && method == "GET") {
                val spotifyId = URLDecoder.decode(pathname.removePrefix("/api/track/").trim(), "UTF-8")
                try {
                    val meta = getTrackMetadata(spotifyId)
                    sendJson(out, 200, meta.toString())
                } catch (e: Exception) {
                    sendJson(out, 502, JSONObject().put("error", e.message).toString())
                }
                socket.close()
                return
            }

            // Route 10: Serve Static Web Assets (/tv, /remote, /, /app.js, /styles.css)
            val assetPath = when (pathname) {
                "/", "/tv", "/index.html" -> "public/index.html"
                "/remote", "/remote.html" -> "public/remote.html"
                else -> "public/" + pathname.removePrefix("/")
            }

            val bytes = try {
                context.assets.open(assetPath).use { it.readBytes() }
            } catch (_: Exception) {
                context.assets.open("public/index.html").use { it.readBytes() }
            }

            val contentType = when {
                assetPath.endsWith(".html") -> "text/html; charset=utf-8"
                assetPath.endsWith(".css") -> "text/css; charset=utf-8"
                assetPath.endsWith(".js") -> "application/javascript; charset=utf-8"
                assetPath.endsWith(".json") -> "application/json; charset=utf-8"
                else -> "application/octet-stream"
            }

            sendResponse(out, 200, contentType, bytes)
            socket.close()
        } catch (_: Exception) {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun broadcastRoomEvent(room: RoomSession, eventName: String, dataStr: String) {
        val msg = "event: $eventName\ndata: $dataStr\n\n".toByteArray(Charsets.UTF_8)
        for (client in room.clients) {
            try {
                synchronized(client) {
                    client.write(msg)
                    client.flush()
                }
            } catch (_: Exception) {
                room.clients.remove(client)
            }
        }
    }

    private fun getTrackMetadata(spotifyId: String): JSONObject {
        trackCache[spotifyId]?.let { cached ->
            if (cached.optInt("year", 0) > 0 &&
                cached.optString("previewUrl", "").isNotEmpty() &&
                cached.optString("coverUrl", "").isNotEmpty()
            ) {
                return cached
            }
        }

        val html = fetchHttps("https://open.spotify.com/embed/track/$spotifyId")
        val regex = Regex("""<script id="__NEXT_DATA__" type="application/json">([\s\S]*?)</script>""")
        val match = regex.find(html) ?: throw Exception("No __NEXT_DATA__ on Spotify embed")
        val entity = JSONObject(match.groupValues[1])
            .getJSONObject("props")
            .getJSONObject("pageProps")
            .getJSONObject("state")
            .getJSONObject("data")
            .getJSONObject("entity")

        val isoDate = entity.optJSONObject("releaseDate")?.optString("isoString", "") ?: ""
        val year = if (isoDate.length >= 4) isoDate.substring(0, 4).toIntOrNull() ?: 2000 else 2000

        val artistsArr = entity.optJSONArray("artists") ?: JSONArray()
        val artistNames = mutableListOf<String>()
        for (i in 0 until artistsArr.length()) {
            artistsArr.optJSONObject(i)?.optString("name")?.let { artistNames.add(it) }
        }

        val imagesArr = entity.optJSONObject("visualIdentity")?.optJSONArray("image")
            ?: entity.optJSONObject("coverArt")?.optJSONArray("sources")
            ?: JSONArray()
        var bestCover: String? = null
        var maxW = -1
        for (i in 0 until imagesArr.length()) {
            val img = imagesArr.optJSONObject(i) ?: continue
            val w = img.optInt("maxWidth", img.optInt("width", 0))
            val url = img.optString("url", "")
            if (url.isNotEmpty() && w >= maxW) {
                maxW = w
                bestCover = url
            }
        }

        val title = entity.optString("title", entity.optString("name", "Unknown Title"))
        val artist = if (artistNames.isNotEmpty()) artistNames.joinToString(", ") else "Unknown Artist"
        var previewUrl: String? = entity.optJSONObject("audioPreview")?.optString("url", "")?.takeIf { it.isNotEmpty() }
        var finalYear = year

        // Fallback to iTunes Search API if Spotify embed did not include a direct audioPreview URL or cover art!
        if (previewUrl.isNullOrEmpty() || bestCover.isNullOrEmpty()) {
            try {
                val query = java.net.URLEncoder.encode("$artist $title", "UTF-8")
                val itunesRaw = fetchHttps("https://itunes.apple.com/search?term=$query&media=music&entity=song&limit=1")
                val results = JSONObject(itunesRaw).optJSONArray("results")
                if (results != null && results.length() > 0) {
                    val first = results.getJSONObject(0)
                    val itunesPreview = first.optString("previewUrl", "")
                    if (previewUrl.isNullOrEmpty() && itunesPreview.isNotEmpty()) {
                        previewUrl = itunesPreview
                    }
                    if (bestCover.isNullOrEmpty()) {
                        bestCover = first.optString("artworkUrl100", "").replace("100x100bb", "600x600bb")
                    }
                }
            } catch (_: Exception) {}
        }

        val result = JSONObject()
            .put("id", spotifyId)
            .put("title", title)
            .put("artist", artist)
            .put("year", finalYear)
            .put("releaseDate", if (isoDate.length >= 10) isoDate.substring(0, 10) else "")
            .put("previewUrl", previewUrl)
            .put("coverUrl", bestCover)
            .put("duration", entity.optInt("duration", 0))
            .put("uri", entity.optString("uri", "spotify:track:$spotifyId"))

        trackCache[spotifyId] = result
        saveTrackCache()
        return result
    }

    private fun importOrSyncPlaylist(playlistInput: String, customTitle: String): JSONObject {
        val trimmedInput = playlistInput.trim()

        // Undocumented feature: if a non-Spotify URL is pasted into the Spotify Playlist box,
        // check if it matches the gamesets JSON structure and store it permanently!
        if ((trimmedInput.startsWith("http://") || trimmedInput.startsWith("https://")) && !trimmedInput.contains("spotify.com/")) {
            val rawBody = fetchHttps(trimmedInput)
            val parsedJson = try {
                JSONObject(rawBody)
            } catch (_: Exception) {
                null
            }
            val setsArr = parsedJson?.optJSONArray("gamesets")
            if (parsedJson != null && setsArr != null) {
                gamesetDb = parsedJson
                fallbackDbFile.writeText(parsedJson.toString())
                officialTrackMap.clear()
                buildOfficialTrackIndex()

                var totalCards = 0
                var defaultSku = "aaaa0005"
                var defaultName = "Original (United Kingdom)"
                var hasDefault = false

                for (i in 0 until setsArr.length()) {
                    val gs = setsArr.optJSONObject(i) ?: continue
                    val gd = gs.optJSONObject("gameset_data") ?: continue
                    val cards = gd.optJSONArray("cards") ?: continue
                    totalCards += cards.length()
                    if (gs.optString("sku") == defaultSku) {
                        hasDefault = true
                        defaultName = sanitizeEditionName(gd.optString("gameset_name"))
                    }
                }
                if (!hasDefault && setsArr.length() > 0) {
                    val first = setsArr.getJSONObject(0)
                    defaultSku = first.optString("sku")
                    defaultName = sanitizeEditionName(first.optJSONObject("gameset_data")?.optString("gameset_name"))
                }

                val nowIso = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).format(java.util.Date())
                val playlistMeta = JSONObject()
                    .put("sku", defaultSku)
                    .put("playlistId", "catalog")
                    .put("isCustom", false)
                    .put("name", "${setsArr.length()} Editions Unlocked ($defaultName)")
                    .put("language", "Catalog Database")
                    .put("cardCount", totalCards)
                    .put("lastSyncedAt", nowIso)

                val diff = JSONObject()
                    .put("isFirstImport", true)
                    .put("totalTracks", totalCards)
                    .put("newSinceLastSyncCount", setsArr.length())
                    .put("newSinceLastSync", JSONArray())
                    .put("inCatalogCount", totalCards)
                    .put("brandNewCount", setsArr.length())

                return JSONObject().put("isCatalogImport", true).put("playlist", playlistMeta).put("diff", diff)
            }
        }

        val playlistId = Regex("""playlist[:/]([a-zA-Z0-9]+)""").find(playlistInput)?.groupValues?.get(1)
            ?: if (playlistInput.trim().matches(Regex("^[a-zA-Z0-9]{15,30}$"))) playlistInput.trim() else throw Exception("Invalid Spotify Playlist URL")

        val html = fetchHttps("https://open.spotify.com/embed/playlist/$playlistId")
        val regex = Regex("""<script id="__NEXT_DATA__" type="application/json">([\s\S]*?)</script>""")
        val match = regex.find(html) ?: throw Exception("Could not parse Spotify playlist")
        val entity = JSONObject(match.groupValues[1])
            .getJSONObject("props")
            .getJSONObject("pageProps")
            .getJSONObject("state")
            .getJSONObject("data")
            .getJSONObject("entity")

        val trackList = entity.optJSONArray("trackList") ?: throw Exception("Playlist is empty or private")
        val sku = "playlist_$playlistId"
        val existing = customPlaylists[sku]
        val prevCards = existing?.optJSONArray("cards") ?: JSONArray()

        val prevBySpotifyId = mutableMapOf<String, JSONObject>()
        var maxCardNum = 0
        for (i in 0 until prevCards.length()) {
            val c = prevCards.optJSONObject(i) ?: continue
            val sp = c.optString("Spotify")
            prevBySpotifyId[sp] = c
            val num = c.optString("CardNumber").toIntOrNull() ?: 0
            if (num > maxCardNum) maxCardNum = num
        }

        val updatedCards = JSONArray()
        val newlyAdded = JSONArray()
        var inCatalogCount = 0
        var brandNewCount = 0
        val seen = mutableSetOf<String>()

        for (i in 0 until trackList.length()) {
            val t = trackList.optJSONObject(i) ?: continue
            val uri = t.optString("uri")
            if (!uri.startsWith("spotify:track:")) continue
            val spId = uri.substringAfter("spotify:track:")
            if (!seen.add(spId)) continue

            val inCatalog = officialTrackMap.containsKey(spId)
            if (inCatalog) inCatalogCount++ else brandNewCount++

            val prevCard = prevBySpotifyId[spId]
            if (prevCard != null) {
                prevCard.put("isNew", false)
                updatedCards.put(prevCard)
            } else {
                maxCardNum++
                val padded = maxCardNum.toString().padStart(5, '0')
                val sub = t.optString("subtitle", "Unknown Artist")
                val card = JSONObject()
                    .put("CardNumber", padded)
                    .put("Spotify", spId)
                    .put("ArtistType", if (sub.contains(",") || sub.contains("&")) "group" else "solo")
                    .put("title", t.optString("title", "Unknown Title"))
                    .put("artist", sub)
                    .put("previewUrl", t.optJSONObject("audioPreview")?.optString("url", null))
                    .put("isNew", true)
                    .put("inCatalog", inCatalog)
                updatedCards.put(card)

                newlyAdded.put(
                    JSONObject()
                        .put("cardNumber", padded)
                        .put("spotifyId", spId)
                        .put("title", card.optString("title"))
                        .put("artist", sub)
                        .put("inCatalog", inCatalog)
                )
            }
        }

        val finalName = if (customTitle.isNotBlank()) customTitle.trim() else existing?.optString("name") ?: entity.optString("title", "Custom Playlist")
        val nowIso = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).format(java.util.Date())

        val record = JSONObject()
            .put("sku", sku)
            .put("playlistId", playlistId)
            .put("isCustom", true)
            .put("name", finalName)
            .put("language", "Custom Playlist")
            .put("lastSyncedAt", nowIso)
            .put("cards", updatedCards)

        customPlaylists[sku] = record
        saveCustomPlaylists()

        val playlistMeta = JSONObject()
            .put("sku", sku)
            .put("playlistId", playlistId)
            .put("isCustom", true)
            .put("name", finalName)
            .put("language", "Custom Playlist")
            .put("cardCount", updatedCards.length())
            .put("lastSyncedAt", nowIso)

        val diff = JSONObject()
            .put("isFirstImport", existing == null)
            .put("totalTracks", updatedCards.length())
            .put("newSinceLastSyncCount", newlyAdded.length())
            .put("newSinceLastSync", newlyAdded)
            .put("inCatalogCount", inCatalogCount)
            .put("brandNewCount", brandNewCount)

        return JSONObject().put("playlist", playlistMeta).put("diff", diff)
    }

    private fun fetchHttps(urlStr: String): String {
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        try {
            conn.instanceFollowRedirects = true
            conn.requestMethod = "GET"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.setRequestProperty("Accept", "text/html,application/json,*/*")
            conn.setRequestProperty(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"
            )
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun sendJson(out: OutputStream, status: Int, json: String) {
        sendResponse(out, status, "application/json; charset=utf-8", json.toByteArray(Charsets.UTF_8))
    }

    private fun sendResponse(out: OutputStream, status: Int, contentType: String, body: ByteArray) {
        val statusText = when (status) {
            200 -> "OK"
            204 -> "No Content"
            400 -> "Bad Request"
            404 -> "Not Found"
            else -> "Server Error"
        }
        val header = "HTTP/1.1 $status $statusText\r\n" +
                "Content-Type: $contentType\r\n" +
                "Content-Length: ${body.size}\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type, Authorization\r\n" +
                "Connection: close\r\n\r\n"
        out.write(header.toByteArray(Charsets.UTF_8))
        if (body.isNotEmpty()) out.write(body)
        out.flush()
    }
}
