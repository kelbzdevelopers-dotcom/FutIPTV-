
import express from "express";
import dns from "node:dns/promises";
import net from "node:net";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "32kb" }));
app.use(express.static("public"));

const MAX_PLAYLIST_SIZE = 20 * 1024 * 1024;
const MAX_CHANNELS = 50000;
const CACHE_TTL = 5 * 60 * 1000;

const cache = new Map();

function normalize(value = "") {
    return String(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

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

    if (type === 6) {
        const normalized = ip.toLowerCase();

        // Aceita somente IPv6 global unicast.
        return (
            normalized.startsWith("2") ||
            normalized.startsWith("3")
        ) && !normalized.startsWith("2001:db8:");
    }

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
        throw new Error("Somente URLs HTTP e HTTPS são permitidas.");
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
            throw new Error("Endereço IP privado não permitido.");
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
            throw new Error("O endereço resolve para uma rede não permitida.");
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
                    "User-Agent": "FutIPTV/1.1",
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
                throw new Error("O endereço não contém uma playlist M3U válida.");
            }

            return content;

        } finally {
            clearTimeout(timeout);
        }
    }

    throw new Error("Limite de redirecionamentos excedido.");
}

function getAttribute(info, name) {
    const match = info.match(
        new RegExp(`(?:^|\\\\s)${name}="([^"]*)"`, "i")
    );

    return match ? match[1].trim() : "";
}

function parsePlaylist(content) {
    const lines = content.split(/\r?\n/);

    const channels = [];
    let currentInfo = null;
    let currentGroup = "";

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) continue;

        if (line.startsWith("#EXTGRP:")) {
            currentGroup = line.substring(8).trim();
            continue;
        }

        if (line.startsWith("#EXTINF:")) {
            currentInfo = line;
            continue;
        }

        if (
            currentInfo &&
            !line.startsWith("#") &&
            /^https?:\/\//i.test(line)
        ) {
            const name = currentInfo
                .substring(currentInfo.lastIndexOf(",") + 1)
                .trim();

            const category =
                getAttribute(currentInfo, "group-title") ||
                currentGroup ||
                "Sem categoria";

            const logo = getAttribute(currentInfo, "tvg-logo");
            const tvgId = getAttribute(currentInfo, "tvg-id");

            channels.push({
                id: channels.length + 1,
                name: name || "Canal sem nome",
                category,
                logo,
                tvgId,
                url: line
            });

            currentInfo = null;
            currentGroup = "";

            if (channels.length >= MAX_CHANNELS) break;
        }
    }

    const categories = {};

    for (const channel of channels) {
        if (!categories[channel.category]) {
            categories[channel.category] = [];
        }

        categories[channel.category].push(channel);
    }

    return {
        total: channels.length,
        categoryCount: Object.keys(categories).length,
        categories,
        channels
    };
}

app.post("/api/playlists/import", async (req, res) => {
    try {
        const playlistURL = req.body?.url;

        if (
            typeof playlistURL !== "string" ||
            playlistURL.length > 2048
        ) {
            return res.status(400).json({
                success: false,
                error: "Informe uma URL válida."
            });
        }

        const cacheKey = playlistURL.trim();
        const cached = cache.get(cacheKey);

        if (cached && Date.now() - cached.time < CACHE_TTL) {
            return res.json({
                success: true,
                cached: true,
                ...cached.data
            });
        }

        console.log("📡 Importando playlist...");

        const content = await downloadPlaylist(cacheKey);
        const result = parsePlaylist(content);

        if (!result.total) {
            return res.status(422).json({
                success: false,
                error: "Nenhum canal válido foi encontrado."
            });
        }

        cache.set(cacheKey, {
            time: Date.now(),
            data: result
        });

        console.log(`📺 ${result.total} canais`);
        console.log(`📂 ${result.categoryCount} categorias`);

        return res.json({
            success: true,
            cached: false,
            ...result
        });

    } catch (error) {
        console.error("Erro na importação:", error.message);

        return res.status(400).json({
            success: false,
            error: error.message || "Falha ao importar playlist."
        });
    }
});

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        app: "FutIPTV",
        version: "1.1.0",
        status: "online",
        playlistImport: true,
        categories: true,
        maxChannels: MAX_CHANNELS
    });
});

app.listen(PORT, () => {
    console.log(`🚀 FutIPTV v1.1.0 na porta ${PORT}`);
});
