
/* =====================================================
   FUTIPTV 1.3.0
   SMART MULTI-PLAYER ENGINE
   HLS.js | Shaka | DASH.js | mpegts.js
   Video.js | Native HTML5
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
   CONFIGURAÇÕES
========================= */

const SAVED_PLAYLIST_KEY = "futiptv_playlist_url";
const FAVORITES_KEY = "futiptv_favorites";

const PLAYER_TIMEOUT = 20000;

const LIBRARIES = {
    hls: "https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js",
    shaka: "https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.12.18/shaka-player.compiled.js",
    dash: "https://cdn.dashjs.org/latest/dash.all.min.js",
    mpegts: "https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.min.js",
    videojs: "https://vjs.zencdn.net/8.23.4/video.min.js",
    videojsCSS: "https://vjs.zencdn.net/8.23.4/video-js.min.css"
};

let channels = [];

let favorites = [];

try {
    favorites = JSON.parse(
        localStorage.getItem(FAVORITES_KEY) || "[]"
    );

    if (!Array.isArray(favorites)) favorites = [];
} catch {
    favorites = [];
}

let currentCategory = "Todos";

let hls = null;
let dash = null;
let shakaPlayer = null;
let mpegtsPlayer = null;
let videojsPlayer = null;

let playerTimeout = null;
let importController = null;

let currentChannel = null;
let currentAttempts = [];
let currentAttemptIndex = 0;
let currentEngine = null;
let playerSession = 0;

/* =========================
   STATUS
========================= */

function setStatus(message) {
    if (status) status.textContent = message;
    console.log("FutIPTV:", message);
}

function setImportStatus(message) {
    if (importStatus) {
        importStatus.textContent = message;
    }
}

/* =========================
   CARREGAMENTO SOB DEMANDA
========================= */

const loadedScripts = new Map();

function loadScript(url) {
    if (loadedScripts.has(url)) {
        return loadedScripts.get(url);
    }

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src = url;
        script.async = true;

        script.onload = () => resolve();
        script.onerror = () => {
            loadedScripts.delete(url);
            reject(new Error("Não foi possível carregar uma biblioteca."));
        };

        document.head.appendChild(script);
    });

    loadedScripts.set(url, promise);
    return promise;
}

function loadCSS(url) {
    if (document.querySelector(`link[href="${url}"]`)) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement("link");

        link.rel = "stylesheet";
        link.href = url;

        link.onload = resolve;
        link.onerror = reject;

        document.head.appendChild(link);
    });
}

/* =========================
   IMPORTAÇÃO M3U
========================= */

async function importPlaylist(url) {
    if (!url) {
        setImportStatus("Informe uma URL M3U.");
        return;
    }

    try {
        const parsedURL = new URL(url);

        if (!["http:", "https:"].includes(parsedURL.protocol)) {
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

        setStatus(`⚽ ${channels.length} canais disponíveis`);
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

/* =========================
   CARREGAR PLAYLIST SALVA
========================= */

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

/* =========================
   CATEGORIAS
========================= */

function renderCategories() {
    if (!categories) return;

    categories.innerHTML = "";

    const groups = [
        ...new Set(
            channels.map(channel => channel.group || "Sem categoria")
        )
    ].sort((a, b) => a.localeCompare(b));

    addCategoryButton("Todos");

    groups.forEach(addCategoryButton);
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

/* =========================
   CANAIS
========================= */

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

/* =========================
   FAVORITOS
========================= */

function toggleFavorite(url) {
    if (favorites.includes(url)) {
        favorites = favorites.filter(item => item !== url);
    } else {
        favorites.push(url);
    }

    localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(favorites)
    );

    renderChannels();
}

/* =========================
   IDENTIFICAR FORMATO
========================= */

function detectFormat(url, channel = {}) {
    const value = String(url || "").toLowerCase();
    const name = String(channel.name || "").toLowerCase();

    if (
        /\.m3u8(?:$|[?#])/i.test(value) ||
        value.includes("m3u8") ||
        value.includes("format=hls")
    ) {
        return "hls";
    }

    if (
        /\.mpd(?:$|[?#])/i.test(value) ||
        value.includes("manifest.mpd")
    ) {
        return "dash";
    }

    if (
        /\.ts(?:$|[?#])/i.test(value) ||
        value.includes("mpegts")
    ) {
        return "mpegts";
    }

    if (
        /\.flv(?:$|[?#])/i.test(value)
    ) {
        return "flv";
    }

    return "direct";
}

/* =========================
   INICIAR CANAL
========================= */

function playChannel(channel) {
    if (!video || !channel.url) return;

    destroyPlayer();

    playerSession++;
    const session = playerSession;

    currentChannel = channel;

    if (playerSection) {
        playerSection.classList.remove("hidden");
        playerSection.style.display = "block";
    }

    if (nowPlaying) {
        nowPlaying.textContent = "▶ " + channel.name;
    }

    const format = detectFormat(channel.url, channel);

    const plans = {
        hls: ["hls", "native"],
        dash: ["shaka", "dash"],
        mpegts: ["mpegts", "native"],
        flv: ["mpegts"],
        direct: ["native", "videojs"]
    };

    currentAttempts = plans[format] || plans.direct;
    currentAttemptIndex = 0;

    setStatus(`🔎 Formato detectado: ${format.toUpperCase()}`);

    tryNextPlayer(session);
}

/* =========================
   FALLBACK INTELIGENTE
========================= */

async function tryNextPlayer(session) {
    if (session !== playerSession) return;

    clearTimeout(playerTimeout);

    if (currentAttemptIndex >= currentAttempts.length) {
        showPlayerError(
            "❌ Não foi possível reproduzir este canal. O endereço pode estar indisponível ou ser incompatível."
        );
        return;
    }

    const engine = currentAttempts[currentAttemptIndex++];

    currentEngine = engine;

    destroyEngines();

    video.pause();
    video.removeAttribute("src");
    video.load();

    setStatus(`⚙️ Tentando player: ${engine.toUpperCase()}...`);

    try {
        switch (engine) {
            case "hls":
                await playHLS(currentChannel, session);
                break;

            case "shaka":
                await playShaka(currentChannel, session);
                break;

            case "dash":
                await playDASH(currentChannel, session);
                break;

            case "mpegts":
                await playMPEGTS(currentChannel, session);
                break;

            case "native":
                await playNative(currentChannel, session);
                break;

            case "videojs":
                await playVideoJS(currentChannel, session);
                break;

            default:
                throw new Error("Player desconhecido.");
        }
    } catch (error) {
        console.error(`${engine}:`, error);

        if (session === playerSession) {
            tryNextPlayer(session);
        }
    }
}

/* =========================
   EVENTOS DE REPRODUÇÃO
========================= */

function setupVideoEvents(engine, session) {
    video.onplaying = () => {
        if (session !== playerSession) return;

        clearTimeout(playerTimeout);

        setStatus(`▶ ${currentChannel.name} · ${engine}`);
    };

    video.onerror = () => {
        if (session !== playerSession) return;

        console.warn("Erro HTML5:", video.error);

        tryNextPlayer(session);
    };

    playerTimeout = setTimeout(() => {
        if (
            session === playerSession &&
            video.readyState < 2
        ) {
            console.warn("Timeout:", engine);
            tryNextPlayer(session);
        }
    }, PLAYER_TIMEOUT);
}

function requestPlayback(session) {
    if (session !== playerSession) return;

    video.play().catch(() => {
        setStatus("▶ Toque em Play para iniciar.");
    });
}

/* =========================
   HLS.JS + HLS NATIVO
========================= */

async function playHLS(channel, session) {
    await loadScript(LIBRARIES.hls);

    if (session !== playerSession) return;

    if (!window.Hls || !Hls.isSupported()) {
        throw new Error("HLS.js incompatível.");
    }

    hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 20
    });

    setupVideoEvents("HLS.js", session);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
        requestPlayback(session);
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
        if (session !== playerSession || !data.fatal) return;

        console.error("HLS fatal:", data);
        tryNextPlayer(session);
    });

    hls.loadSource(channel.url);
    hls.attachMedia(video);
}

async function playNative(channel, session) {
    if (
        !video.canPlayType("application/vnd.apple.mpegurl") &&
        detectFormat(channel.url) === "hls"
    ) {
        throw new Error("HLS nativo não suportado.");
    }

    setupVideoEvents("HTML5", session);

    video.src = channel.url;
    video.load();

    requestPlayback(session);
}

/* =========================
   SHAKA PLAYER
========================= */

async function playShaka(channel, session) {
    await loadScript(LIBRARIES.shaka);

    if (session !== playerSession) return;

    if (!window.shaka) {
        throw new Error("Shaka não carregado.");
    }

    shaka.polyfill.installAll();

    if (!shaka.Player.isBrowserSupported()) {
        throw new Error("Shaka não suportado neste navegador.");
    }

    shakaPlayer = new shaka.Player(video);

    setupVideoEvents("Shaka", session);

    shakaPlayer.addEventListener("error", event => {
        if (session !== playerSession) return;

        console.error("Shaka:", event.detail);
        tryNextPlayer(session);
    });

    await shakaPlayer.load(channel.url);

    if (session === playerSession) {
        requestPlayback(session);
    }
}

/* =========================
   DASH.JS
========================= */

async function playDASH(channel, session) {
    await loadScript(LIBRARIES.dash);

    if (session !== playerSession) return;

    if (!window.dashjs) {
        throw new Error("DASH.js não carregado.");
    }

    dash = dashjs.MediaPlayer().create();

    setupVideoEvents("DASH.js", session);

    dash.on(dashjs.MediaPlayer.events.ERROR, error => {
        if (session !== playerSession) return;

        console.error("DASH:", error);
        tryNextPlayer(session);
    });

    dash.initialize(video, channel.url, false);

    requestPlayback(session);
}

/* =========================
   MPEG-TS / FLV
========================= */

async function playMPEGTS(channel, session) {
    await loadScript(LIBRARIES.mpegts);

    if (session !== playerSession) return;

    if (
        !window.mpegts ||
        !mpegts.isSupported()
    ) {
        throw new Error("MPEG-TS não suportado.");
    }

    const format = detectFormat(channel.url);

    const type = format === "flv" ? "flv" : "mpegts";

    mpegtsPlayer = mpegts.createPlayer({
        type,
        isLive: true,
        url: channel.url
    }, {
        enableWorker: false,
        lazyLoad: true,
        liveBufferLatencyChasing: true
    });

    setupVideoEvents("mpegts.js", session);

    mpegtsPlayer.on(
        mpegts.Events.ERROR,
        (type, detail, info) => {
            if (session !== playerSession) return;

            console.error("mpegts.js:", type, detail, info);
            tryNextPlayer(session);
        }
    );

    mpegtsPlayer.attachMediaElement(video);
    mpegtsPlayer.load();
    mpegtsPlayer.play().catch(() => {
        setStatus("▶ Toque em Play para iniciar.");
    });
}

/* =========================
   VIDEO.JS
========================= */

async function playVideoJS(channel, session) {
    await Promise.all([
        loadCSS(LIBRARIES.videojsCSS),
        loadScript(LIBRARIES.videojs)
    ]);

    if (session !== playerSession) return;

    if (!window.videojs) {
        throw new Error("Video.js não carregado.");
    }

    videojsPlayer = videojs(video, {
        controls: true,
        autoplay: false,
        preload: "metadata",
        fluid: true,
        liveui: true,
        controlBar: {
            pictureInPictureToggle: true
        }
    });

    videojsPlayer.src({
        src: channel.url,
        type: "video/mp4"
    });

    videojsPlayer.on("error", () => {
        if (session !== playerSession) return;

        console.error("Video.js:", videojsPlayer.error());
        tryNextPlayer(session);
    });

    videojsPlayer.on("playing", () => {
        if (session !== playerSession) return;

        clearTimeout(playerTimeout);
        setStatus(`▶ ${channel.name} · Video.js`);
    });

    playerTimeout = setTimeout(() => {
        if (
            session === playerSession &&
            video.readyState < 2
        ) {
            tryNextPlayer(session);
        }
    }, PLAYER_TIMEOUT);

    videojsPlayer.play().catch(() => {
        setStatus("▶ Toque em Play para iniciar.");
    });
}

/* =========================
   DESTRUIR MOTORES
========================= */

function destroyEngines() {
    if (hls) {
        try {
            hls.destroy();
        } catch (error) {
            console.warn(error);
        }
        hls = null;
    }

    if (dash) {
        try {
            dash.reset();
        } catch (error) {
            console.warn(error);
        }
        dash = null;
    }

    if (shakaPlayer) {
        try {
            shakaPlayer.destroy();
        } catch (error) {
            console.warn(error);
        }
        shakaPlayer = null;
    }

    if (mpegtsPlayer) {
        try {
            mpegtsPlayer.pause();
            mpegtsPlayer.unload();
            mpegtsPlayer.detachMediaElement();
            mpegtsPlayer.destroy();
        } catch (error) {
            console.warn(error);
        }
        mpegtsPlayer = null;
    }

    if (videojsPlayer) {
        try {
            videojsPlayer.dispose();
        } catch (error) {
            console.warn(error);
        }
        videojsPlayer = null;
    }

    if (video) {
        video.onerror = null;
        video.onplaying = null;
    }
}

function destroyPlayer() {
    clearTimeout(playerTimeout);

    playerSession++;

    destroyEngines();

    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
    }

    currentChannel = null;
    currentAttempts = [];
    currentAttemptIndex = 0;
    currentEngine = null;
}

/* =========================
   ERRO
========================= */

function showPlayerError(message) {
    clearTimeout(playerTimeout);

    console.error(message);
    setStatus(message);
}

/* =========================
   FULLSCREEN
========================= */

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
        fullscreenBtn.textContent =
            document.fullscreenElement ? "⛶" : "⛶ Tela cheia";
    }
});

/* =========================
   FECHAR PLAYER
========================= */

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

/* =========================
   PESQUISA
========================= */

if (searchInput) {
    searchInput.addEventListener("input", renderChannels);
}

/* =========================
   ATUALIZAR
========================= */

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

/* =========================
   INICIAR
========================= */

loadPlaylist();
