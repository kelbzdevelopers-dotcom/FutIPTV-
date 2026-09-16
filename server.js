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

function processPlaylist(text) {
    const lines = text.split(/\r?\n/);

    const brazilChannels = [];
    const internationalChannels = [];

    let currentInfo = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

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

            // Ignora streams claramente inválidos
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
                const channel = {
                    info: currentInfo,
                    url: url
                };

                if (brazilian) {
                    brazilChannels.push(channel);
                } else {
                    internationalChannels.push(channel);
                }
            }

            currentInfo = null;
        }
    }

    const channels = [
        ...brazilChannels,
        ...internationalChannels
    ];

    let output = "#EXTM3U\n";

    for (const channel of channels) {
        let info = channel.info;

        // Marca canais brasileiros como categoria Brasil
        if (isBrazilian(info)) {
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
        total: channels.length,
        brazil: brazilChannels.length,
        international: internationalChannels.length
    };
}

app.get("/api/playlist", async (req, res) => {
    try {
        console.log("📡 Baixando playlist...");

        const response = await fetch(PLAYLIST_URL);

        if (!response.ok) {
            throw new Error(
                `Playlist respondeu ${response.status}`
            );
        }

        const text = await response.text();

        const result = processPlaylist(text);

        console.log(
            `⚽ ${result.total} canais encontrados`
        );

        console.log(
            `🇧🇷 Brasil: ${result.brazil}`
        );

        console.log(
            `🌎 Internacionais: ${result.international}`
        );

        res.type("text/plain").send(result.playlist);

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
        version: "1.0.0",
        status: "online"
    });
});

app.listen(PORT, () => {
    console.log(`🚀 FutIPTV rodando na porta ${PORT}`);
});