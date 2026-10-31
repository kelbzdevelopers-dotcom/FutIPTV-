
import express from "express";
import dns from "node:dns/promises";
import net from "node:net";
import { parseM3U, writeM3U } from "@iptv/playlist";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "32kb" }));
app.use(express.static("public"));

const MAX_PLAYLIST_SIZE = 20 * 1024 * 1024;
const MAX_CHANNELS = 50000;
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 10;

const cache = new Map();

function isPrivateIPv4(ip) {
    const p = ip.split(".").map(Number);

    return (
        p[0] === 0 ||
        p[0] === 10 ||
        p[0] === 127 ||
        p[0] >= 224 ||
        (p[0] === 169 && p[1] === 254) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && p[1] === 168) ||
        (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
    );
}

function isPublicAddress(ip) {
    const type = net.isIP(ip);

    if (type === 4) return !isPrivateIPv4(ip);

    // Por segurança, não aceitamos IPv6 neste MVP.
    return false;
}

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

    const hostname = url.hostname.replace(/^\[|\]$/g, "");

    if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local")
    ) {
        throw new Error("Endereço local não permitido.");
    }

    if (net.isIP(hostname)) {
        if (!isPublicAddress(hostname)) {
            throw new Error("Endereço IP não permitido.");
        }
    } else {
        const addresses = await dns.lookup(hostname, {
            all: true,
            verbatim: true
        });

        if (
            !addresses.length ||
            addresses.some(item => !isPublicAddress(item.address))
        ) {
            throw new Error("Endereço não permitido.");
        }
    }

    return url;
}

async function downloadPlaylist(initialURL) {
    let currentURL = initialURL;

    for (let redirect = 0; redirect <= 3; redirect++) {
        const url = await validateURL(currentURL);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                redirect: "manual",
                headers: {
                    "User-Agent": "FutIPTV/1.2",
                    "Accept": "application/x-mpegURL, text/plain, */*"
                }
            });

            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get("location");

                if (!location || redirect === 3) {
                    throw new Error("Redirecionamento inválido.");
                }

                currentURL = new URL(location, url).href;
                continue;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const contentLength = Number(
                response.headers.get("content-length") || 0
            );

            if (contentLength > MAX_PLAYLIST_SIZE) {
                throw new Error("Playlist excede 20 MB.");
            }

            if (!response.body) {
                throw new Error("Playlist vazia.");
            }

            const reader = response.body.getReader();
            const chunks = [];
            let total = 0;

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                total += value.length;

                if (total > MAX_PLAYLIST_SIZE) {
                    await reader.cancel();
                    throw new Error("Playlist excede 20 MB.");
                }

                chunks.push(value);
            }

            const bytes = new Uint8Array(total);
            let offset = 0;

            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
            }

            const content = new TextDecoder("utf-8").decode(bytes);

            if (!content.trimStart().startsWith("#EXTM3U")) {
                throw new Error("Playlist M3U inválida.");
            }

            return content;

        } finally {
            clearTimeout(timeout);
        }
    }

    throw new Error("Limite de redirecionamentos excedido.");
}

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

        // Guarda os IDs para evitar duplicar todos os objetos no JSON.
        categories[channel.category].push(channel.id);
    }

    const exportPlaylist = {
        headers: parsed.headers || {},
        channels: channels.map(channel => {
            const { id, category, logo, ...original } = channel;
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
        if (oldestKey) cache.delete(oldestKey);
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

// IMPORTAR PLAYLIST
app.post("/api/playlists/import", async (req, res) => {
    try {
        const playlistURL = req.body?.url;

        if (
            typeof playlistURL !== "string" ||
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

// EXPORTAR PLAYLIST M3U
app.get("/api/playlists/export", async (req, res) => {
    try {
        const playlistURL = req.query.url;

        if (
            typeof playlistURL !== "string" ||
            playlistURL.length > 2048
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

app.listen(PORT, () => {
    console.log(`🚀 FutIPTV v1.2.0 na porta ${PORT}`);
});
