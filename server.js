import express from "express";

const app = express();

const PORT = process.env.PORT || 3000;

const PLAYLIST_URL =
    "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";


/* =========================================================
   SITE
========================================================= */

app.use(express.static("public"));


/* =========================================================
   STATUS
========================================================= */

app.get("/api/status", (req, res) => {

    res.json({

        success: true,

        app: "FutIPTV",

        version: "1.0.0",

        status: "online"

    });

});


/* =========================================================
   PLAYLIST
========================================================= */

app.get("/api/playlist", async (req, res) => {

    try {

        console.log("Baixando playlist...");


        const response =
            await fetch(
                PLAYLIST_URL,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 FutIPTV"
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                `Playlist HTTP ${response.status}`
            );

        }


        const text =
            await response.text();


        console.log(
            "Playlist original:",
            text.length,
            "caracteres"
        );


        /*
         * Divide a playlist em blocos.
         */

        const lines =
            text.split(/\r?\n/);


        const blocks = [];

        let block = [];


        for (
            const line of lines
        ) {

            if (
                line.startsWith("#EXTINF:")
            ) {

                if (block.length) {

                    blocks.push(block);

                }

                block = [line];

            }

            else if (
                block.length
            ) {

                block.push(line);

            }

        }


        if (block.length) {

            blocks.push(block);

        }


        console.log(
            "Canais encontrados:",
            blocks.length
        );


        /*
         * Palavras relacionadas a futebol/esportes.
         */

        const keywords = [

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


        /*
         * Filtra os canais.
         */

        const sports =
            blocks.filter(
                block => {

                    const content =
                        block
                            .join(" ")
                            .toLowerCase();


                    return keywords.some(
                        keyword =>
                            content.includes(
                                keyword
                            )
                    );

                }
            );


        console.log(
            "Canais esportivos:",
            sports.length
        );


        /*
         * Monta playlist final.
         */

        const output =
            "#EXTM3U\n" +
            sports
                .map(
                    block =>
                        block.join("\n")
                )
                .join("\n");


        res
            .type("text/plain")
            .send(output);


    }

    catch (error) {

        console.error(
            "Erro na playlist:",
            error
        );


        res.status(500).json({

            success: false,

            error:
                "Não foi possível carregar a playlist."

        });

    }

});


/* =========================================================
   SERVIDOR
========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            `FutIPTV rodando na porta ${PORT}`
        );

    }
);