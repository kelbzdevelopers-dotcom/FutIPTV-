
/* =====================================================
   FUTIPTV 1.2.0
   APP.JS
===================================================== */

/* =========================
   ELEMENTOS
========================= */

const video = document.getElementById("videoPlayer");
const channelList = document.getElementById("canais");
const reloadBtn = document.getElementById("refreshBtn");
const nowPlaying = document.getElementById("playerTitle");
const channelCount = document.getElementById("channelCount");
const loading = document.getElementById("loading");
const status = document.getElementById("status");
const searchInput = document.getElementById("searchInput");
const playerSection = document.getElementById("playerSection");
const playerContainer = document.getElementById("playerContainer");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const closePlayer = document.getElementById("closePlayer");
const categories = document.getElementById("categories");

const playlistUrlInput = document.getElementById("playlistUrl");
const importPlaylistBtn = document.getElementById("importPlaylistBtn");
const importStatus = document.getElementById("importStatus");
const emptyState = document.getElementById("emptyState");

/* =========================
   VARIÁVEIS
========================= */

let channels = [];

let favorites = JSON.parse(
    localStorage.getItem("futiptv_favorites") || "[]"
);

let currentCategory = "Todos";
let hls = null;
let dash = null;
let playerTimeout = null;
let importController = null;

const SAVED_PLAYLIST_KEY = "futiptv_playlist_url";

/* =====================================================
   STATUS
===================================================== */

function setStatus(message) {
    if (status) status.textContent = message;
    console.log("FutIPTV:", message);
}

function setImportStatus(message) {
    if (importStatus) {
        importStatus.textContent = message;
    }
}

/* =====================================================
   IMPORTAÇÃO M3U
===================================================== */

async function importPlaylist(url) {

    if (!url) {
        setImportStatus("Informe uma URL M3U.");
        return;
    }

    try {
        new URL(url);

        if (!["http:", "https:"].includes(new URL(url).protocol)) {
            throw new Error("Use uma URL HTTP ou HTTPS.");
        }

    } catch {
        setImportStatus("URL inválida.");
        return;
    }

    if (importController) {
        importController.abort();
    }

    importController = new AbortController();

    if (loading) loading.style.display = "block";

    if (importPlaylistBtn) {
        importPlaylistBtn.disabled = true;
        importPlaylistBtn.textContent = "Importando...";
    }

    setImportStatus("📡 Baixando playlist...");
    setStatus("📥 Importando canais...");

    try {

        const response = await fetch("/api/playlists/import", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url }),
            signal: importController.signal
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Falha na importação.");
        }

        if (!Array.isArray(data.channels)) {
            throw new Error("Resposta de canais inválida.");
        }

        channels = data.channels.map((channel, index) => ({
            ...channel,
            id: channel.id || index + 1,
            name: channel.name || channel.tvgName || "Canal sem nome",
            logo: channel.logo || channel.tvgLogo || "",
            group: channel.category || channel.groupTitle || "Sem categoria",
            url: channel.url
        }));

        if (!channels.length) {
            throw new Error("Nenhum canal encontrado.");
        }

        localStorage.setItem(SAVED_PLAYLIST_KEY, url);

        if (playlistUrlInput) {
            playlistUrlInput.value = url;
        }

        currentCategory = "Todos";

        renderCategories();
        renderChannels();

        setImportStatus(
            `✅ ${data.total || channels.length} canais importados!`
        );

        setStatus(
            `⚽ ${channels.length} canais disponíveis`
        );

    } catch (error) {

        if (error.name === "AbortError") return;

        console.error("Importação:", error);

        setImportStatus("❌ " + error.message);
        setStatus("❌ Falha ao importar playlist.");

    } finally {

        if (loading) loading.style.display = "none";

        if (importPlaylistBtn) {
            importPlaylistBtn.disabled = false;
            importPlaylistBtn.textContent = "Importar";
        }

        importController = null;
    }
}

/* =====================================================
   BOTÃO IMPORTAR
===================================================== */

if (importPlaylistBtn) {
    importPlaylistBtn.addEventListener("click", () => {
        importPlaylist(playlistUrlInput?.value.trim());
    });
}

if (playlistUrlInput) {
    playlistUrlInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            importPlaylist(playlistUrlInput.value.trim());
        }
    });
}

/* =====================================================
   CARREGAR PLAYLIST SALVA
===================================================== */

async function loadPlaylist() {

    const savedURL = localStorage.getItem(SAVED_PLAYLIST_KEY);

    if (savedURL) {
        if (playlistUrlInput) {
            playlistUrlInput.value = savedURL;
        }

        await importPlaylist(savedURL);
        return;
    }

    if (loading) loading.style.display = "none";

    setStatus("📡 Importe uma playlist para começar.");

    setImportStatus("Nenhuma playlist importada.");

    renderCategories();
    renderChannels();
}

/* =====================================================
   CATEGORIAS
===================================================== */

function renderCategories() {

    if (!categories) return;

    categories.innerHTML = "";

    const groups = [
        ...new Set(
            channels.map(channel => channel.group || "Sem categoria")
        )
    ].sort((a, b) => a.localeCompare(b));

    addCategoryButton("Todos");

    groups.forEach(group => {
        addCategoryButton(group);
    });
}

function addCategoryButton(name) {

    const button = document.createElement("button");

    button.className =
        "category" + (currentCategory === name ? " active" : "");

    button.textContent = name;
    button.dataset.category = name;
    button.type = "button";

    button.addEventListener("click", () => {

        currentCategory = name;

        renderCategories();
        renderChannels();
    });

    categories.appendChild(button);
}

/* =====================================================
   CANAIS
===================================================== */

function renderChannels() {

    if (!channelList) return;

    const search = searchInput
        ? searchInput.value.toLowerCase().trim()
        : "";

    const filtered = channels.filter(channel => {

        const name = String(channel.name || "").toLowerCase();
        const group = String(channel.group || "").toLowerCase();

        const matchesSearch =
            !search ||
            name.includes(search) ||
            group.includes(search);

        const matchesCategory =
            currentCategory === "Todos" ||
            channel.group === currentCategory;

        return matchesSearch && matchesCategory;
    });

    channelList.innerHTML = "";

    if (channelCount) {
        channelCount.textContent =
            `${filtered.length} ${filtered.length === 1 ? "canal" : "canais"}`;
    }

    if (emptyState) {
        emptyState.classList.toggle("hidden", filtered.length > 0);
    }

    if (!filtered.length) {
        return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach(channel => {

        const item = document.createElement("div");
        item.className = "channel";

        const logoContainer = document.createElement("div");
        logoContainer.className = "channel-logo";

        if (channel.logo) {

            const image = document.createElement("img");

            image.src = channel.logo;
            image.alt = channel.name;
            image.loading = "lazy";

            image.onerror = () => {
                image.remove();
                logoContainer.textContent = "⚽";
            };

            logoContainer.appendChild(image);

        } else {
            logoContainer.textContent = "⚽";
        }

        const info = document.createElement("div");
        info.className = "channel-info";

        const name = document.createElement("strong");
        name.textContent = channel.name;

        const group = document.createElement("small");
        group.textContent = channel.group;

        info.append(name, group);

        const favoriteButton = document.createElement("button");
        favoriteButton.className = "favorite";
        favoriteButton.type = "button";
        favoriteButton.textContent =
            favorites.includes(channel.url) ? "⭐" : "☆";

        favoriteButton.setAttribute("aria-label", "Favoritar canal");

        favoriteButton.addEventListener("click", event => {
            event.stopPropagation();
            toggleFavorite(channel.url);
        });

        item.append(logoContainer, info, favoriteButton);

        item.addEventListener("click", () => {
            playChannel(channel);
        });

        fragment.appendChild(item);
    });

    channelList.appendChild(fragment);
}

/* =====================================================
   FAVORITOS
===================================================== */

function toggleFavorite(url) {

    if (favorites.includes(url)) {

        favorites = favorites.filter(item => item !== url);

    } else {

        favorites.push(url);
    }

    localStorage.setItem(
        "futiptv_favorites",
        JSON.stringify(favorites)
    );

    renderChannels();
}

/* =====================================================
   PLAYER
===================================================== */

function playChannel(channel) {

    if (!video || !channel.url) return;

    destroyPlayer();

    if (playerSection) {
        playerSection.classList.remove("hidden");
        playerSection.style.display = "block";
    }

    if (nowPlaying) {
        nowPlaying.textContent = "▶ " + channel.name;
    }

    const url = channel.url.toLowerCase();

    const isDASH =
        url.includes(".mpd") ||
        url.includes("manifest.mpd");

    const isHLS =
        url.includes(".m3u8") ||
        url.includes("hls");

    if (isDASH) {
        playDASH(channel);
    } else if (isHLS) {
        playHLS(channel);
    } else {
        playDirect(channel);
    }
}

/* =====================================================
   HLS
===================================================== */

function playHLS(channel) {

    setStatus("📺 Abrindo HLS...");

    if (window.Hls && Hls.isSupported()) {

        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30
        });

        hls.loadSource(channel.url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {

            clearTimeout(playerTimeout);

            setStatus("▶ " + channel.name);

            video.play().catch(() => {
                setStatus("▶ Toque em Play");
            });
        });

        hls.on(Hls.Events.ERROR, (event, data) => {

            console.error("HLS:", data);

            if (data.fatal) {

                destroyHLS();

                showPlayerError("❌ Falha na transmissão HLS.");
            }
        });

        startTimeout("⏳ O canal HLS demorou demais para responder.");

        return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {

        video.src = channel.url;

        video.play().catch(() => {
            setStatus("▶ Toque em Play");
        });

        startTimeout("⏳ O canal HLS demorou demais para responder.");

        return;
    }

    showPlayerError("❌ HLS não suportado.");
}

/* =====================================================
   DASH
===================================================== */

function playDASH(channel) {

    if (!window.dashjs) {
        showPlayerError("❌ DASH.js não carregado.");
        return;
    }

    setStatus("📺 Abrindo DASH...");

    dash = dashjs.MediaPlayer().create();

    dash.initialize(video, channel.url, true);

    dash.on(
        dashjs.MediaPlayer.events.STREAM_INITIALIZED,
        () => {
            clearTimeout(playerTimeout);
            setStatus("▶ " + channel.name);
        }
    );

    dash.on(
        dashjs.MediaPlayer.events.ERROR,
        error => {
            console.error("DASH:", error);
            showPlayerError("❌ Falha na transmissão DASH.");
        }
    );

    startTimeout("⏳ O canal DASH demorou demais para responder.");
}

/* =====================================================
   TRANSMISSÃO DIRETA
===================================================== */

function playDirect(channel) {

    setStatus("📺 Abrindo transmissão direta...");

    video.src = channel.url;

    video.play().catch(() => {
        setStatus("▶ Toque em Play");
    });

    startTimeout("⏳ A transmissão demorou demais para responder.");
}

/* =====================================================
   TIMEOUT
===================================================== */

function startTimeout(message) {

    clearTimeout(playerTimeout);

    playerTimeout = setTimeout(() => {

        if (video && video.readyState === 0) {
            showPlayerError(message);
        }

    }, 15000);
}

/* =====================================================
   DESTRUIR PLAYER
===================================================== */

function destroyHLS() {

    if (hls) {
        hls.destroy();
        hls = null;
    }
}

function destroyPlayer() {

    clearTimeout(playerTimeout);

    destroyHLS();

    if (dash) {
        try {
            dash.reset();
        } catch (error) {
            console.error(error);
        }

        dash = null;
    }

    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
    }
}

/* =====================================================
   ERRO
===================================================== */

function showPlayerError(message) {
    console.error(message);
    setStatus(message);
}

/* =====================================================
   FULLSCREEN
===================================================== */

async function ativarTelaCheia() {

    if (!video) return;

    try {

        if (typeof video.webkitEnterFullscreen === "function") {
            video.webkitEnterFullscreen();
            return;
        }

        if (playerContainer?.requestFullscreen) {
            await playerContainer.requestFullscreen();
            return;
        }

        if (video.requestFullscreen) {
            await video.requestFullscreen();
        }

    } catch (error) {
        console.error("Fullscreen:", error);
    }
}

async function sairDaTelaCheia() {

    try {

        if (document.fullscreenElement) {
            await document.exitFullscreen();
        }

    } catch (error) {
        console.error(error);
    }
}

if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", ativarTelaCheia);
}

document.addEventListener("fullscreenchange", () => {

    if (fullscreenBtn) {
        fullscreenBtn.textContent = "⛶";
    }
});

/* =====================================================
   FECHAR PLAYER
===================================================== */

if (closePlayer) {

    closePlayer.addEventListener("click", async () => {

        await sairDaTelaCheia();

        destroyPlayer();

        if (playerSection) {
            playerSection.classList.add("hidden");
            playerSection.style.display = "none";
        }

        if (nowPlaying) {
            nowPlaying.textContent = "Nenhum canal";
        }

        setStatus(`⚽ ${channels.length} canais`);
    });
}

/* =====================================================
   PESQUISA
===================================================== */

if (searchInput) {
    searchInput.addEventListener("input", renderChannels);
}

/* =====================================================
   ATUALIZAR
===================================================== */

if (reloadBtn) {

    reloadBtn.addEventListener("click", () => {

        const savedURL = localStorage.getItem(SAVED_PLAYLIST_KEY);

        if (savedURL) {
            importPlaylist(savedURL);
        } else {
            loadPlaylist();
        }
    });
}

/* =====================================================
   INICIAR
===================================================== */

loadPlaylist();
