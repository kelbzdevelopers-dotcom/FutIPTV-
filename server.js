import express from "express";

const app = express();

const PORT = process.env.PORT || 3000;

const PLAYLIST_URL =
    "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

app.use(express.static("public"));

const SPORTS_KEYWORDS = [
    "sport",
    "sports",
    "esporte",
    "esportes",
    "futebol",
    "football",
    "soccer",
    "fifa",
    "uefa",
    "champions",
    "premier league",
    "laliga",
    "la liga",
    "bundesliga",
    "serie a",
    "serie b",
    "copa",
    "espn",
    "fox sports",
    "bein sports",
    "sportv",
    "tnt sports",
    "red bull tv"
];

const BRAZIL_KEYWORDS = [
    "brasil",
    "brazil",
    "brasileira",
    "brasileiro",
    "brasileirao",
    "globo",
    "sportv",
    "band",
    "record",
    "sbt",
    "rede tv",
    "redetv",
    "cultura",
    "gazeta",
    "tv brasil",
    "nsports",
    "tnt sports brasil"
];

function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function isBrazilian(text) {
    const value = normalize(text);

    return BRAZIL_KEYWORDS.some(keyword =>
        value.includes(normalize(keyword))
    );
}

function isSports(text) {
    const value = normalize(text);

    return SPORTS_KEYWORDS.some(keyword =>
        value.includes(normalize(keyword))
    );
}

/*
 * Verifica se o stream responde.
 * Não baixa o vídeo inteiro.
 */
async function streamWorks(url) {
    try {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 5000);

        const response = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            signal: controller.signal
        });

        clearTimeout(timeout);

        return response.ok;
    } catch {
        return false;
    }
}

/*
 * Alguns servidores IPTV não aceitam HEAD.
 * Nesse caso fazemos uma pequena requisição GET.
 */
async function streamWorksFallback(url) {
    try {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 5000);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Range: "bytes=0-1024"
            },
            redirect: "follow",
            signal: controller.signal
        });

        clearTimeout(timeout);

        return response.ok || response.status === 206;
    } catch {
        return false;
    }
}

async function checkStream(url) {
    const headWorks = await streamWorks(url);

    if (headWorks) {
        return true;
    }

    return await streamWorksFallback(url);
}

function parsePlaylist(text) {
    const lines = text.split(/\r?\n/);

    const channels = [];

    let currentInfo = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (line.startsWith("#EXTINF:")) {
            currentInfo = line;
            continue;
        }

        if (
            currentInfo &&
            line &&
            !line.startsWith("#")
        ) {
            const url = line;

            if (
                url.includes("[NO PUBLIC STREAM]") ||
                url.includes("example.com")
            ) {
                currentInfo = null;
                continue;
            }

            const brazilian = isBrazilian(currentInfo);
            const sports = isSports(currentInfo);

            if (brazilian || sports) {
                channels.push({
                    info: currentInfo,
                    url,
                    brazilian
                });
            }

            currentInfo = null;
        }
    }

    return channels;
}

async function filterWorkingChannels(channels) {
    const working = [];

    /*
     * Testa em grupos de 5 para não sobrecarregar
     * o servidor gratuito do Render.
     */
    const batchSize = 5;

    for (let i = 0; i < channels.length; i += batchSize) {
        const batch = channels.slice(i, i + batchSize);

        const results = await Promise.all(
            batch.map(async channel => ({
                channel,
                works: await checkStream(channel.url)
            }))
        );

        for (const result of results) {
            if (result.works) {
                working.push(result.channel);
            } else {
                console.log(
                    `❌ Stream quebrado: ${result.channel.url}`
                );
            }
        }
    }

    return working;
}

function createPlaylist(channels) {
    const brazil = channels.filter(channel =>
        channel.brazilian
    );

    const international = channels.filter(channel =>
        !channel.brazilian
    );

    const ordered = [
        ...brazil,
        ...international
    ];

    let output = "#EXTM3U\n";

    for (const channel of ordered) {
        let info = channel.info;

        if (channel.brazilian) {
            if (/group-title="[^"]*"/i.test(info)) {
                info = info.replace(
                    /group-title="[^"]*"/i,
                    'group-title="Brasil"'
                );
            } else {
                info = info.replace(
                    "#EXTINF:-1",
                    '#EXTINF:-1 group-title="Brasil"'
                );
            }
        }

        output += info + "\n";
        output += channel.url + "\n";
    }

    return {
        playlist: output,
        total: ordered.length,
        brazil: brazil.length,
        international: international.length
    };
}

app.get("/api/playlist", async (req, res) => {
    try {
        console.log("📡 Baixando playlist original...");

        const response = await fetch(PLAYLIST_URL);

        if (!response.ok) {
            throw new Error(
                `Playlist respondeu ${response.status}`
            );
        }

        const text = await response.text();

        const channels = parsePlaylist(text);

        console.log(
            `📺 ${channels.length} streams encontrados para teste`
        );

        console.log("🔎 Testando streams...");

        const workingChannels =
            await filterWorkingChannels(channels);

        const result =
            createPlaylist(workingChannels);

        console.log(
            `✅ ${result.total} canais funcionando`
        );

        console.log(
            `🇧🇷 Brasil: ${result.brazil}`
        );

        console.log(
            `🌎 Internacionais: ${result.international}`
        );

        res.type("text/plain").send(
            result.playlist
        );

    } catch (error) {
        console.error("❌ Erro:", error);

        res.status(500).send(
            "#EXTM3U\n"
        );
    }
});

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        app: "FutIPTV",
        version: "1.0.1",
        status: "online",
        filter: "automatic-stream-check"
    });
});

app.listen(PORT, () => {
    console.log(
        `🚀 FutIPTV v1.0.1 rodando na porta ${PORT}`
    );
});