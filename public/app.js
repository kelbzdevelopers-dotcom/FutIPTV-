/* =====================================================
   FUTIPTV
   APP.JS
   ===================================================== */


/* =========================
   ELEMENTOS
========================= */

const video =
    document.getElementById("videoPlayer");

const channelList =
    document.getElementById("canais");

const reloadBtn =
    document.getElementById("refreshBtn");

const nowPlaying =
    document.getElementById("playerTitle");

const channelCount =
    document.getElementById("channelCount");

const loading =
    document.getElementById("loading");

const status =
    document.getElementById("status");

const searchInput =
    document.getElementById("searchInput");

const playerSection =
    document.getElementById("playerSection");

const playerContainer =
    document.getElementById("playerContainer");

const fullscreenBtn =
    document.getElementById("fullscreenBtn");

const closePlayer =
    document.getElementById("closePlayer");

const categories =
    document.getElementById("categories");


/* =========================
   VARIÁVEIS
========================= */

let channels = [];

let favorites = JSON.parse(
    localStorage.getItem(
        "futiptv_favorites"
    ) || "[]"
);

let currentCategory = "Todos";

let currentTab = "all";

let hls = null;

let dash = null;

let playerTimeout = null;


/* =====================================================
   STATUS
===================================================== */

function setStatus(text) {

    if (status) {
        status.textContent = text;
    }

    console.log(
        "FutIPTV:",
        text
    );
}


/* =====================================================
   FULLSCREEN
===================================================== */

async function ativarTelaCheia() {

    if (!video) {
        return;
    }

    try {

        /*
         * Android/WebView
         *
         * Alguns WebViews suportam
         * diretamente o fullscreen nativo
         * do elemento <video>.
         */

        if (
            typeof video.webkitEnterFullscreen ===
            "function"
        ) {

            video.webkitEnterFullscreen();

            return;
        }


        /*
         * Fullscreen API padrão
         */

        if (
            typeof video.requestFullscreen ===
            "function"
        ) {

            await video.requestFullscreen();

            return;
        }


        /*
         * Tenta colocar o container
         * inteiro em fullscreen.
         */

        if (
            playerContainer &&
            typeof playerContainer.requestFullscreen ===
            "function"
        ) {

            await playerContainer.requestFullscreen();

            return;
        }


        /*
         * WebKit
         */

        if (
            typeof video.webkitRequestFullscreen ===
            "function"
        ) {

            video.webkitRequestFullscreen();

            return;
        }


        /*
         * Microsoft antigo
         */

        if (
            typeof video.msRequestFullscreen ===
            "function"
        ) {

            video.msRequestFullscreen();

            return;
        }


        console.warn(
            "Fullscreen não suportado."
        );

    } catch (error) {

        console.error(
            "Erro ao entrar em fullscreen:",
            error
        );

    }
}


/* =========================
   SAIR DO FULLSCREEN
========================= */

async function sairDaTelaCheia() {

    try {

        if (
            document.fullscreenElement
        ) {

            await document.exitFullscreen();

            return;
        }


        if (
            document.webkitFullscreenElement
        ) {

            if (
                document.webkitExitFullscreen
            ) {

                document.webkitExitFullscreen();
            }

            return;
        }

    } catch (error) {

        console.error(
            "Erro ao sair do fullscreen:",
            error
        );
    }
}


/* =========================
   BOTÃO FULLSCREEN
========================= */

if (fullscreenBtn) {

    fullscreenBtn.addEventListener(
        "click",
        async function(event) {

            event.preventDefault();

            event.stopPropagation();

            await ativarTelaCheia();

        }
    );
}


/* =========================
   EVENTOS FULLSCREEN
========================= */

function fullscreenMudou() {

    const ativo =
        document.fullscreenElement ||
        document.webkitFullscreenElement;

    if (fullscreenBtn) {

        fullscreenBtn.textContent =
            ativo
                ? "⛶"
                : "⛶";
    }
}


document.addEventListener(
    "fullscreenchange",
    fullscreenMudou
);


document.addEventListener(
    "webkitfullscreenchange",
    fullscreenMudou
);


/* =====================================================
   PLAYLIST
===================================================== */

async function loadPlaylist() {

    setStatus(
        "📥 Carregando canais..."
    );

    if (loading) {

        loading.style.display =
            "block";
    }


    try {

        const response =
            await fetch(
                "/api/playlist?t=" +
                Date.now()
            );


        if (!response.ok) {

            throw new Error(
                "HTTP " +
                response.status
            );
        }


        const text =
            await response.text();


        if (
            !text.includes(
                "#EXTINF"
            )
        ) {

            throw new Error(
                "Nenhum canal encontrado."
            );
        }


        channels =
            parseM3U(text);


        console.log(
            "Canais encontrados:",
            channels.length
        );


        if (!channels.length) {

            throw new Error(
                "Nenhum canal válido."
            );
        }


        setStatus(
            "⚽ " +
            channels.length +
            " canais"
        );


        renderCategories();

        renderChannels();

    } catch (error) {

        console.error(error);


        setStatus(
            "❌ " +
            error.message
        );


        if (channelList) {

            channelList.innerHTML = `
                <div style="
                    padding:20px;
                    text-align:center;
                ">
                    ❌ Erro ao carregar canais.
                    <br><br>
                    <small>
                        ${escapeHTML(
                            error.message
                        )}
                    </small>
                </div>
            `;
        }

    } finally {

        if (loading) {

            loading.style.display =
                "none";
        }
    }
}


/* =====================================================
   PARSER M3U
===================================================== */

function parseM3U(text) {

    const lines =
        text.split(/\r?\n/);

    const result = [];

    let current = null;


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


        if (
            line
                .toUpperCase()
                .startsWith("#EXTINF")
        ) {

            current = {

                name: "Canal",

                logo: "",

                group: "",

                url: ""
            };


            const comma =
                line.lastIndexOf(",");


            if (comma !== -1) {

                current.name =
                    line
                        .substring(
                            comma + 1
                        )
                        .trim();
            }


            const logo =
                line.match(
                    /tvg-logo=["']([^"']*)["']/i
                );


            if (logo) {

                current.logo =
                    logo[1];
            }


            const group =
                line.match(
                    /group-title=["']([^"']*)["']/i
                );


            if (group) {

                current.group =
                    group[1];
            }


            continue;
        }


        if (
            current &&
            !line.startsWith("#")
        ) {

            if (
                !line.includes(
                    "[NO PUBLIC STREAM]"
                )
            ) {

                current.url =
                    line;

                result.push(
                    current
                );
            }


            current = null;
        }
    }


    return result;
}


/* =====================================================
   CATEGORIAS
===================================================== */

function renderCategories() {

    if (!categories) {
        return;
    }


    const groups = [
        ...new Set(
            channels
                .map(
                    channel =>
                        channel.group
                )
                .filter(Boolean)
        )
    ];


    categories.innerHTML =
        "";


    addCategoryButton(
        "Todos"
    );


    groups.forEach(
        group => {

            addCategoryButton(
                group
            );
        }
    );
}


/* =========================
   BOTÃO DE CATEGORIA
========================= */

function addCategoryButton(
    name
) {

    const button =
        document.createElement(
            "button"
        );


    button.className =
        "category" +
        (
            currentCategory === name
                ? " active"
                : ""
        );


    button.textContent =
        name;


    button.dataset.category =
        name;


    button.type =
        "button";


    button.addEventListener(
        "click",
        () => {

            currentCategory =
                name;

            renderCategories();

            renderChannels();
        }
    );


    categories.appendChild(
        button
    );
}


/* =====================================================
   CANAIS
===================================================== */

function renderChannels() {

    if (!channelList) {
        return;
    }


    const search =
        searchInput
            ? searchInput.value
                .toLowerCase()
                .trim()
            : "";


    const filtered =
        channels.filter(
            channel => {

                const name =
                    String(
                        channel.name || ""
                    ).toLowerCase();


                const group =
                    String(
                        channel.group || ""
                    ).toLowerCase();


                const matchesSearch =
                    !search ||
                    name.includes(
                        search
                    ) ||
                    group.includes(
                        search
                    );


                const matchesCategory =
                    currentCategory ===
                        "Todos" ||
                    channel.group ===
                        currentCategory;


                const matchesFavorite =
                    currentTab !==
                        "favorites" ||
                    favorites.includes(
                        channel.url
                    );


                return (
                    matchesSearch &&
                    matchesCategory &&
                    matchesFavorite
                );
            }
        );


    channelList.innerHTML =
        "";


    if (channelCount) {

        channelCount.textContent =
            filtered.length +
            (
                filtered.length === 1
                    ? " canal"
                    : " canais"
            );
    }


    if (!filtered.length) {

        channelList.innerHTML = `
            <div style="
                padding:20px;
                text-align:center;
            ">
                ⚠️ Nenhum canal encontrado.
            </div>
        `;

        return;
    }


    filtered.forEach(
        channel => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "channel";


            const favorite =
                favorites.includes(
                    channel.url
                );


            item.innerHTML = `

                <div class="channel-logo">

                    ${
                        channel.logo
                        ?
                        `
                        <img
                            src="${escapeHTML(
                                channel.logo
                            )}"
                            loading="lazy"
                            onerror="
                                this.style.display='none'
                            "
                        >
                        `
                        :
                        "⚽"
                    }

                </div>


                <div class="channel-info">

                    <strong>
                        ${escapeHTML(
                            channel.name
                        )}
                    </strong>

                    <small>
                        ${escapeHTML(
                            channel.group ||
                            "Esportes"
                        )}
                    </small>

                </div>


                <button
                    class="favorite"
                    type="button"
                    aria-label="Favoritar canal"
                >
                    ${
                        favorite
                            ? "⭐"
                            : "☆"
                    }
                </button>

            `;


            item.addEventListener(
                "click",
                () => {

                    playChannel(
                        channel
                    );
                }
            );


            const favoriteButton =
                item.querySelector(
                    ".favorite"
                );


            if (favoriteButton) {

                favoriteButton.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();

                        toggleFavorite(
                            channel.url
                        );
                    }
                );
            }


            channelList.appendChild(
                item
            );
        }
    );
}


/* =====================================================
   PLAYER
===================================================== */

function playChannel(channel) {

    if (!video) {

        console.error(
            "videoPlayer não encontrado."
        );

        return;
    }


    console.log(
        "🎬 Abrindo:",
        channel.name
    );


    console.log(
        "🔗 URL:",
        channel.url
    );


    /* MOSTRAR PLAYER */

    if (playerSection) {

        playerSection.classList.remove(
            "hidden"
        );

        playerSection.style.display =
            "block";
    }


    if (nowPlaying) {

        nowPlaying.textContent =
            "▶ " +
            channel.name;
    }


    /* LIMPAR PLAYER */

    destroyPlayer();


    const url =
        channel.url.toLowerCase();


    /* DETECTAR DASH */

    const isDASH =
        url.includes(".mpd") ||
        url.includes("manifest.mpd") ||
        url.includes("dash");


    /* DETECTAR HLS */

    const isHLS =
        url.includes(".m3u8") ||
        url.includes("playlist") ||
        url.includes("hls");


    console.log(
        "Formato:",
        isDASH
            ? "DASH"
            : isHLS
                ? "HLS"
                : "DESCONHECIDO"
    );


    if (isDASH) {

        playDASH(
            channel
        );

        return;
    }


    if (isHLS) {

        playHLS(
            channel
        );

        return;
    }


    playHLS(
        channel
    );
}


/* =====================================================
   HLS
===================================================== */

function playHLS(channel) {

    const url =
        channel.url;


    setStatus(
        "📺 Abrindo HLS..."
    );


    if (
        window.Hls &&
        Hls.isSupported()
    ) {

        console.log(
            "HLS.js disponível."
        );


        hls =
            new Hls({

                enableWorker: true,

                lowLatencyMode: true,

                backBufferLength: 30
            });


        hls.loadSource(
            url
        );


        hls.attachMedia(
            video
        );


        hls.on(
            Hls.Events.MANIFEST_PARSED,
            () => {

                console.log(
                    "✅ HLS carregado."
                );


                clearTimeout(
                    playerTimeout
                );


                setStatus(
                    "▶ " +
                    channel.name
                );


                video.play()
                    .catch(
                        () => {

                            setStatus(
                                "▶ Toque em Play"
                            );
                        }
                    );
            }
        );


        hls.on(
            Hls.Events.ERROR,
            (
                event,
                data
            ) => {

                console.error(
                    "HLS:",
                    data
                );


                if (
                    data.fatal
                ) {

                    clearTimeout(
                        playerTimeout
                    );


                    showPlayerError(
                        "❌ Este canal HLS não está disponível."
                    );


                    destroyHLS();
                }
            }
        );


        startTimeout(
            "⏳ O canal HLS demorou demais para responder."
        );


        return;
    }


    /* HLS NATIVO */

    if (
        video.canPlayType(
            "application/vnd.apple.mpegurl"
        )
    ) {

        video.src =
            url;


        video.addEventListener(
            "loadedmetadata",
            () => {

                clearTimeout(
                    playerTimeout
                );


                video.play()
                    .catch(
                        () => {}
                    );

            },
            {
                once: true
            }
        );


        startTimeout(
            "⏳ O canal HLS demorou demais para responder."
        );


        return;
    }


    showPlayerError(
        "❌ HLS não é suportado neste navegador."
    );
}


/* =====================================================
   DASH
===================================================== */

function playDASH(channel) {

    const url =
        channel.url;


    setStatus(
        "📺 Abrindo DASH..."
    );


    if (
        !window.dashjs
    ) {

        showPlayerError(
            "❌ Player DASH não carregado."
        );

        return;
    }


    console.log(
        "DASH.js disponível."
    );


    dash =
        dashjs.MediaPlayer()
            .create();


    dash.initialize(
        video,
        url,
        true
    );


    dash.on(
        dashjs.MediaPlayer.events
            .STREAM_INITIALIZED,
        () => {

            console.log(
                "✅ DASH carregado."
            );


            clearTimeout(
                playerTimeout
            );


            setStatus(
                "▶ " +
                channel.name
            );
        }
    );


    dash.on(
        dashjs.MediaPlayer.events
            .ERROR,
        error => {

            console.error(
                "DASH:",
                error
            );


            clearTimeout(
                playerTimeout
            );


            showPlayerError(
                "❌ Este canal DASH não está disponível."
            );
        }
    );


    startTimeout(
        "⏳ O canal DASH demorou demais para responder."
    );
}


/* =====================================================
   TIMEOUT
===================================================== */

function startTimeout(message) {

    clearTimeout(
        playerTimeout
    );


    playerTimeout =
        setTimeout(
            () => {

                if (
                    video &&
                    video.readyState === 0
                ) {

                    showPlayerError(
                        message
                    );
                }

            },
            15000
        );
}


/* =====================================================
   DESTRUIR PLAYER
===================================================== */

function destroyPlayer() {

    clearTimeout(
        playerTimeout
    );


    destroyHLS();


    if (dash) {

        try {

            dash.reset();

        } catch (e) {}

        dash = null;
    }


    if (video) {

        try {

            video.pause();

        } catch (e) {}


        video.removeAttribute(
            "src"
        );


        video.load();
    }
}


/* =====================================================
   DESTRUIR HLS
===================================================== */

function destroyHLS() {

    if (hls) {

        try {

            hls.destroy();

        } catch (e) {}

        hls = null;
    }
}


/* =====================================================
   ERRO
===================================================== */

function showPlayerError(message) {

    console.error(
        message
    );


    setStatus(
        message
    );
}


/* =====================================================
   FECHAR PLAYER
===================================================== */

if (closePlayer) {

    closePlayer.addEventListener(
        "click",
        async () => {

            await sairDaTelaCheia();


            destroyPlayer();


            if (playerSection) {

                playerSection.classList.add(
                    "hidden"
                );

                playerSection.style.display =
                    "none";
            }


            if (nowPlaying) {

                nowPlaying.textContent =
                    "Nenhum canal";
            }


            setStatus(
                "⚽ " +
                channels.length +
                " canais"
            );
        }
    );
}


/* =====================================================
   FAVORITOS
===================================================== */

function toggleFavorite(url) {

    if (
        favorites.includes(url)
    ) {

        favorites =
            favorites.filter(
                item =>
                    item !== url
            );

    } else {

        favorites.push(
            url
        );
    }


    localStorage.setItem(
        "futiptv_favorites",
        JSON.stringify(
            favorites
        )
    );


    renderChannels();
}


/* =====================================================
   PESQUISA
===================================================== */

if (searchInput) {

    searchInput.addEventListener(
        "input",
        renderChannels
    );
}


/* =====================================================
   RECARREGAR
===================================================== */

if (reloadBtn) {

    reloadBtn.addEventListener(
        "click",
        () => {

            destroyPlayer();

            loadPlaylist();
        }
    );
}


/* =====================================================
   SEGURANÇA
===================================================== */

function escapeHTML(text) {

    return String(text)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );
}


/* =====================================================
   INICIAR
===================================================== */

loadPlaylist();