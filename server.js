import express from "express";

const app = express();

const PORT = process.env.PORT || 3000;

/*
 * =========================================================
 * CONFIGURAÇÃO
 * =========================================================
 */

const PLAYLIST_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";


/*
 * =========================================================
 * SITE
 * =========================================================
 */

app.use(
  express.static("public")
);


/*
 * =========================================================
 * API DE STATUS
 * =========================================================
 */

app.get(
  "/api/status",
  (req, res) => {

    res.json({

      success: true,

      app: "FutIPTV",

      version: "1.0.0",

      status: "online",

      playlist:
        "Free-TV/IPTV"

    });

  }
);


/*
 * =========================================================
 * API DA PLAYLIST
 * =========================================================
 */

app.get(
  "/api/playlist",
  async (req, res) => {

    try {

      console.log(
        "Baixando playlist Free-TV..."
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


      const playlist =
        await response.text();


      console.log(
        `Playlist carregada: ${playlist.length} caracteres`
      );


      /*
       * Envia a playlist para o FutIPTV
       */

      res
        .type("text/plain")
        .send(playlist);


    }

    catch (error) {

      console.error(
        "Erro ao carregar playlist:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          "Não foi possível carregar a playlist Free-TV/IPTV"

      });

    }

  }
);


/*
 * =========================================================
 * SERVIDOR
 * =========================================================
 */

app.listen(
  PORT,
  () => {

    console.log(
      `FutIPTV rodando na porta ${PORT}`
    );

  }
);