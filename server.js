import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 3000;

const PLAYLIST_URL =
    "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";


app.use(cors());

app.use(express.static("public"));


/* =========================
   PALAVRAS ESPORTIVAS
========================= */

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
    "la liga",
    "laliga",
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


/* =========================
   TERMOS BRASILEIROS
========================= */

const BRAZIL_KEYWORDS = [
    "brasil",
    "brazil",
    "brasileira",
    "brasileiro",
    "brasileirão",
    "globo",
    "globo esporte",
    "sportv",
    "band",
    "band sports",
    "band esporte",
    "record",
    "sbt",
    "rede tv",
    "redetv",
    "cultura",
    "gazeta",
    "tv brasil",
    "tv brasil central",
    "tvc",
    "tv esporte",
    "nsports",
    "canal uol",
    "tnt sports brasil"
];


/* =========================
   NORMALIZAR TEXTO
========================= */

function normalize(text) {

    return String(text || "")
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase();
}


/* =========================
   É BRASIL?
========================= */

function isBrazilian(line) {

    const text =
        normalize(line);

    return BRAZIL_KEYWORDS.some(
        keyword =>
            text.includes(
                normalize(keyword)
            )
    );
}


/* =========================
   É ESPORTE?
========================= */

function isSports(line) {

    const text =
        normalize(line);

    return SPORTS_KEYWORDS.some(
        keyword =>
            text.includes(
                normalize(keyword)
            )
    );
}


/* =========================
   É STREAM VÁLIDO?
========================= */

function isValidStream(url) {

    if (!url) return false;

    if (
        url.includes(
            "[NO PUBLIC STREAM]"
        )
    ) {
        return false;
    }

    if (
        url.startsWith("#")
    ) {
        return false;
    }

    return (
        url.startsWith(
            "http://"
        ) ||
        url.startsWith(
            "https://"
        )
    );
}


/* =========================
   PROCESSAR PLAYLIST
========================= */

function processPlaylist(text) {

    const lines =
        text.split(/\r?\n/);

    const brazil = [];
    const international = [];

    let currentInfo = null;


    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const line =
            lines[i].trim();


        if (!line) {
            continue;
        }


        /*
         * Encontrou informações do canal
         */

        if (
            line
                .toUpperCase()
                .startsWith("#EXTINF")
        ) {

            currentInfo =
                line;

            continue;
        }


        /*
         * Encontrou URL
         */

        if (
            currentInfo &&
            !line.startsWith("#")
        ) {

            const url =
                line;


            if (
                isValidStream(url)
            ) {

                /*
                 * Só queremos canais
                 * esportivos ou brasileiros.
                 */

                const relevant =
                    isSports(
                        currentInfo
                    ) ||
                    isBrazilian(
                        currentInfo
                    );


                if (relevant) {

                    /*
                     * BRASIL
                     */

                    if (
                        isBrazilian(
                            currentInfo
                        )
                    ) {

                        brazil.push({
                            info:
                                currentInfo,
                            url
                        });

                    }

                    /*
                     * INTERNACIONAL
                     */

                    else {

                        international.push({
                            info:
                                currentInfo,
                            url
                        });
                    }
                }
            }


            currentInfo = null;
        }
    }


    /*
     * Brasil primeiro
     */

    const result = [
        ...brazil,
        ...international
    ];


    /*
     * Reconstruir M3U
     */

    let output =
        "#EXTM3U\n";


    for (
        const channel of result
    ) {

        let info =
            channel.info;


        /*
         * Adiciona grupo Brasil
         * quando identificamos um canal
         * brasileiro.
         */

        if (
            isBrazilian(
                channel.info
            )
        ) {

            info =
                info.replace(
                    /group-title="[^"]*"/i,
                    'group-title="Brasil"'
                );
        }


        output +=
            info +
            "\n" +
            channel.url +
            "\n";
    }


    return {
        output,
        brazilCount:
            brazil.length,
        internationalCount:
            international.length,
        total:
            result.length
    };
}


/* =========================
   API PLAYLIST
========================= */

app.get(
    "/api/playlist",
    async (
        req,
        res
    ) => {

        try {

            console.log(
                "📥 Baixando playlist..."
            );


            const response =
                await fetch(
                    PLAYLIST_URL
                );


            if (
                !response.ok
            ) {

                throw new Error(
                    "Playlist HTTP " +
                    response.status
                );
            }


            const text =
                await response.text();


            console.log(
                "📦 Playlist recebida:",
                text.length,
                "caracteres"
            );


            const result =
                processPlaylist(
                    text
                );


            console.log(
                "🇧🇷 Brasil:",
                result.brazilCount
            );

            console.log(
                "🌎 Internacional:",
                result.internationalCount
            );

            console.log(
                "⚽ Total:",
                result.total
            );


            res
                .type(
                    "text/plain"
                )
                .send(
                    result.output
                );


        } catch (error) {

            console.error(
                "❌ Erro:",
                error
            );


            res
                .status(500)
                .type(
                    "text/plain"
                )
                .send(
                    "#EXTM3U\n"
                );
        }
    }
);


/* =========================
   STATUS
========================= */

app.get(
    "/api/status",
    (req, res) => {

        res.json({
            success: true,
            app: "FutIPTV",
            version: "1.1.0",
            status: "online",
            playlist:
                "Free-TV/IPTV",
            features: [
                "Brasil primeiro",
                "Canais esportivos",
                "Canais internacionais",
                "Filtro de streams inválidos"
            ]
        });
    }
);


/* =========================
   SERVIDOR
========================= */

app.listen(
    PORT,
    () => {

        console.log(
            "⚽ FutIPTV online na porta",
            PORT
        );

        console.log(
            "🇧🇷 Modo: Brasil primeiro"
        );
    }
);