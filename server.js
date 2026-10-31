
import express from "express";
import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { parseM3U, writeM3U } from "@iptv/playlist";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "32kb" }));
app.use(express.static("public"));

const VERSION = "1.2.1";

const MAX_PLAYLIST_SIZE = 20 * 1024 * 1024;
const MAX_CHANNELS = 50000;
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 10;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT = 20000;

const cache = new Map();

// ======================================
// VALIDAÇÃO DE ENDEREÇOS IPv4
// ======================================

function ipv4Number(ip) {
    return ip.split(".").reduce(
        (result, part) => (result * 256) + Number(part),
        0
    );
}

function inRange(ip, start, end) {
    const value = ipv4Number(ip);
    return value >= ipv4Number(start) &&
           value <= ipv4Number(end);
}

function isPublicIPv4(ip) {
    if (net.isIP(ip) !== 4) return false;

    const blockedRanges = [
        ["0.0.0.0", "0.255.255.255"],
        ["10.0.0.0", "10.255.255.255"],
        ["100.64.0.0", "100.127.255.255"],
        ["127.0.0.0", "127.255.255.255"],
        ["169.254.0.0", "169.254.255.255"],
        ["172.16.0.0", "172.31.255.255"],
        ["192.0.0.0", "192.0.0.255"],
        ["192.0.2.0", "192.0.2.255"],
        ["192.88.99.0", "192.88.99.255"],
        ["192.168.0.0", "192.168.255.255"],
        ["198.18.0.0", "198.19.255.255"],
        ["198.51.100.0", "198.51.100.255"],
        ["203.0.113.0", "203.0.113.255"],
        ["224.0.0.0", "255.255.255.255"]
    ];

    return !blockedRanges.some(([start, end]) =>
        inRange(ip, start, end)
    );
}

// ======================================
// RESOLUÇÃO E VALIDAÇÃO DNS
// ======================================

async function validateURL(value) {
    let url;

    try {
        url = new URL(value);
    } catch {
        throw new Error("URL inválida.");
    }

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Somente HTTP e HTTPS são permitidos.");
    }

    if (url.username || url.password) {
        throw new Error("URLs com credenciais não são permitidas.");
    }

    if (url.port && !/^\d+$/.test(url.port)) {
        throw new Error("Porta inválida.");
    }

    const hostname = url.hostname
        .replace(/^\[|\]$/g, "")
        .toLowerCase();

    if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local")
    ) {
        throw new Error("Endereço local não permitido.");
    }

    let address;

    if (net.isIP(hostname)) {
        if (!isPublicIPv4(hostname)) {
            throw new Error("Endereço IP não permitido.");
        }

        address = hostname;
    } else {
        let addresses;

        try {
            // Este MVP aceita somente destinos IPv4 públicos.
            addresses = await dns.lookup(hostname, {
                all: true,
                family: 4,
                verbatim: true
            });
        } catch {
            throw new Error("Não foi possível resolver o endereço DNS.");
        }

        if (!addresses.length) {
            throw new Error("Nenhum endereço IPv4 encontrado.");
        }

        if (addresses.some(item => !isPublicIPv4(item.address))) {
            throw new Error("Endereço não permitido.");
        }

        address = addresses[0].address;
    }

    return {
        url,
        address,
        hostname
    };
}

// ======================================
// DOWNLOAD COM IP VALIDADO
// ======================================

function requestPlaylist(url, address, hostname) {
    return new Promise((resolve, reject) => {
        const transport = url.protocol === "https:"
            ? https
            : http;

        const options = {
            protocol: url.protocol,
            hostname,
            port: url.port || undefined,
            path: url.pathname + url.search,
            method: "GET",
            agent: false,
            headers: {
                "User-Agent": "FutIPTV/1.2.1",
                "Accept": "application/x-mpegURL, text/plain, */*"
            },

            // Usa o IP que acabou de ser validado.
            lookup: (_host, _options, callback) => {
                callback(null, address, 4);
            }
        };

        if (url.protocol === "https:" && !net.isIP(hostname)) {
            options.servername = hostname;
        }

        const req = transport.request(options, response => {
            const status = response.statusCode || 0;

            if ([301, 302, 303, 307, 308].includes(status)) {
                const location = response.headers.location;
                response.resume();

                resolve({
                    redirect: location || null
                });

                return;
            }

            if (status < 200 || status >= 300) {
                response.resume();
                reject(new Error(`HTTP ${status}`));
                return;
            }

            const contentLength = Number(
                response.headers["content-length"] || 0
            );

            if (contentLength > MAX_PLAYLIST_SIZE) {
                response.destroy();
                reject(new Error("Playlist excede 20 MB."));
                return;
            }

            const chunks = [];
            let total = 0;

            response.on("data", chunk => {
                total += chunk.length;

                if (total > MAX_PLAYLIST_SIZE) {
                    response.destroy(
                        new Error("Playlist excede 20 MB.")
                    );
                    return;
                }

                chunks.push(chunk);
            });

            response.on("end", () => {
                resolve({
                    content: Buffer.concat(chunks).toString("utf8")
                });
            });

            response.on("error", reject);
        });

        req.setTimeout(REQUEST_TIMEOUT, () => {
            req.destroy(new Error("Tempo limite de conexão excedido."));
        });

        req.on("error", reject);
        req.end();
    });
}

// ======================================
// IMPORTAÇÃO DA PLAYLIST
// ======================================

async function downloadPlaylist(initialURL) {
    let currentURL = initialURL;

    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
        const validated = await validateURL(currentURL);

        const result = await requestPlaylist(
            validated.url,
            validated.address,
            validated.hostname
        );

        if (result.redirect !== undefined) {
            if (!result.redirect || redirect === MAX_REDIRECTS) {
                throw new Error("Redirecionamento inválido.");
            }

            currentURL = new URL(
                result.redirect,
                validated.url
            ).href;

            continue;
        }

        const content = result.content;

        if (
            typeof content !== "string" ||
            !content.trimStart().startsWith("#EXTM3U")
        ) {
            throw new Error("Playlist M3U inválida.");
        }

        return content;
    }

    throw new Error("Limite de redirecionamentos excedido.");
}

// ======================================
// INTERPRETAÇÃO M3U
// ======================================

function parsePlaylist(content) {
    const parsed = parseM3U(content);

    if (!parsed || !Array.isArray(parsed.channels)) {
        throw new Error("Não foi possível interpretar a playlist.");
    }

    const originalChannels = parsed.channels.slice(0, MAX_CHANNELS);

    const channels = originalChannels
        .filter(channel => {
            if (!channel || typeof channel.url !== "string") {
                return false;
            }

            try {
                const url = new URL(channel.url);

                return ["http:", "https:"].includes(url.protocol);
            } catch {
                return false;
            }
        })
        .map((channel, index) => ({
            ...channel,
            id: index + 1,
            name: channel.name || channel.tvgName || "Canal sem nome",
            category: channel.groupTitle || "Sem categoria",
            logo: channel.tvgLogo || "",
            tvgId: channel.tvgId || "",
            url: channel.url
        }));

    const categories = {};

    for (const channel of channels) {
        if (!categories[channel.category]) {
            categories[channel.category] = [];
        }

        categories[channel.category].push(channel.id);
    }

    const exportPlaylist = {
        headers: parsed.headers || {},
        channels: channels.map(channel => {
            const {
                id,
                category,
                logo,
                ...original
            } = channel;

            return original;
        })
    };

    return {
        total: channels.length,
        categoryCount: Object.keys(categories).length,
        categories,
        channels,
        exportPlaylist
    };
}

// ======================================
// CACHE
// ======================================

function getCached(url) {
    const item = cache.get(url);

    if (!item) return null;

    if (Date.now() - item.time > CACHE_TTL) {
        cache.delete(url);
        return null;
    }

    return item.data;
}

function saveCache(url, data) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;

        if (oldestKey) {
            cache.delete(oldestKey);
        }
    }

    cache.set(url, {
        time: Date.now(),
        data
    });
}

async function loadPlaylist(url) {
    const cached = getCached(url);

    if (cached) {
        return {
            data: cached,
            cached: true
        };
    }

    const content = await downloadPlaylist(url);
    const data = parsePlaylist(content);

    if (!data.total) {
        throw new Error("Nenhum canal válido foi encontrado.");
    }

    saveCache(url, data);

    return {
        data,
        cached: false
    };
}

// ======================================
// API: IMPORTAR PLAYLIST
// ======================================

app.post("/api/playlists/import", async (req, res) => {
    try {
        const playlistURL = req.body?.url;

        if (
            typeof playlistURL !== "string" ||
            !playlistURL.trim() ||
            playlistURL.trim().length > 2048
        ) {
            return res.status(400).json({
                success: false,
                error: "Informe uma URL válida."
            });
        }

        console.log("📡 Importando playlist...");

        const result = await loadPlaylist(playlistURL.trim());

        console.log(`📺 ${result.data.total} canais`);
        console.log(`📂 ${result.data.categoryCount} categorias`);

        return res.json({
            success: true,
            cached: result.cached,
            total: result.data.total,
            categoryCount: result.data.categoryCount,
            categories: result.data.categories,
            channels: result.data.channels
        });

    } catch (error) {
        console.error("Erro na importação:", error.message);

        return res.status(400).json({
            success: false,
            error: error.message || "Falha ao importar playlist."
        });
    }
});

// ======================================
// API: EXPORTAR PLAYLIST
// ======================================

app.get("/api/playlists/export", async (req, res) => {
    try {
        const playlistURL = req.query.url;

        if (
            typeof playlistURL !== "string" ||
            !playlistURL.trim() ||
            playlistURL.trim().length > 2048
        ) {
            return res.status(400).send("Informe uma URL válida.");
        }

        const result = await loadPlaylist(playlistURL.trim());

        const m3u = writeM3U(result.data.exportPlaylist);

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="futiptv.m3u"'
        );

        res.type("application/x-mpegURL").send(m3u);

    } catch (error) {
        console.error("Erro na exportação:", error.message);
        res.status(400).send(error.message);
    }
});

// ======================================
// STATUS DO SERVIDOR
// ======================================

app.get("/api/status", (_req, res) => {
    res.json({
        name: "FutIPTV",
        version: VERSION,
        status: "online"
    });
});

// ======================================
// INICIAR SERVIDOR
// ======================================

app.listen(PORT, () => {
    console.log(`🚀 FutIPTV v${VERSION} na porta ${PORT}`);
});
