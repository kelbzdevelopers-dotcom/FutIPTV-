import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Site
app.use(express.static(path.join(__dirname, "public")));

// API de status
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "FutIPTV",
    version: "1.0.0",
    status: "online"
  });
});

// API da playlist
app.get("/api/playlist", async (req, res) => {
  try {
    const playlistPath = path.join(__dirname, "sports.m3u");

    const playlist = await fs.readFile(
      playlistPath,
      "utf8"
    );

    res.type("text/plain").send(playlist);

  } catch (error) {

    res.status(500).json({
      success: false,
      error: "Não foi possível carregar sports.m3u"
    });

  }
});

app.listen(PORT, () => {
  console.log(`FutIPTV rodando na porta ${PORT}`);
});