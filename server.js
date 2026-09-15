import express from "express";

const app = express();

const PORT = process.env.PORT || 3000;

const PLAYLIST_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";


/*
 * Site
 */

app.use(
  express.static("public")
);


/*
 * Status
 */

app.get(
  "/api/status",
  (req, res) => {

    res.json({

      success: true,

      app: "FutIPTV",

      version: "1.0.0",

      status: "online",

      playlist: "Free-TV/IPTV"

    });

  }
);


/*
 * Playlist filtrada
 */

app.get(
  "/api/playlist",
  async (req, res) => {

    try {

      console.log(
        "Baixando playlist..."
      );


      const response =
        await fetch(
          PLAYLIST_URL
        );


      if (!response.ok) {

        throw new Error(
          `HTTP ${response.status}`
        );

      }


      const text =
        await response.text();


      console.log(
        "Playlist baixada."
      );


      /*
       * Palavras relacionadas
       * a futebol e esportes.
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
       * Divide a playlist
       */

      const lines =
        text.split(/\r?\n/);


      const result = [];


      let currentBlock = [];


      /*
       * Processa cada canal
       */

      for (
        const line of lines
      ) {

        /*
         * Começo de um canal
         */

        if (
          line.startsWith(
            "#EXTINF:"
          )
        ) {

          /*
           * Se já havia um canal
           * armazenado, verifica ele.
           */

          if (
            currentBlock.length
          ) {

            const blockText =
              currentBlock
                .join("\n")
                .toLowerCase();


            const isSport =
              keywords.some(
                keyword =>
                  blockText.includes(
                    keyword
                  )
              );


            if (isSport) {

              result.push(
                ...currentBlock
              );

            }

          }


          /*
           * Começa novo canal
           */

          currentBlock = [
            line
          ];

        }

        else {

          /*
           * Continua o canal atual
           */

          if (
            currentBlock.length
          ) {

            currentBlock.push(
              line
            );

          }

        }

      }


      /*
       * Processa último canal
       */

      if (
        currentBlock.length
      ) {

        const blockText =
          currentBlock
            .join("\n")
            .toLowerCase();


        const isSport =
          keywords.some(
            keyword =>
              blockText.includes(
                keyword
              )
          );


        if (isSport) {

          result.push(
            ...currentBlock
          );

        }

      }


      /*
       * Monta playlist final
       */

      const filteredPlaylist =
        "#EXTM3U\n" +
        result.join("\n");


      console.log(
        `Playlist filtrada: ${result.length} linhas`
      );


      /*
       * Envia somente os canais
       * esportivos.
       */

      res
        .type("text/plain")
        .send(
          filteredPlaylist
        );

    }


    catch (error) {

      console.error(
        "Erro:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          "Não foi possível carregar a playlist"

      });

    }

  }
);


/*
 * Servidor
 */

app.listen(
  PORT,
  () => {

    console.log(
      `FutIPTV rodando na porta ${PORT}`
    );

  }
);