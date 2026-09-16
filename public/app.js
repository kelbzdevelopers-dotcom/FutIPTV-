const video = document.getElementById("videoPlayer");
const channelList = document.getElementById("canais");
const reloadBtn = document.getElementById("refreshBtn");
const nowPlaying = document.getElementById("playerTitle");
const channelCount = document.getElementById("channelCount");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");

const status = document.getElementById("status");
const searchInput = document.getElementById("searchInput");

const playerSection =
    document.getElementById("playerSection");

const closePlayer =
    document.getElementById("closePlayer");

const categories =
    document.getElementById("categories");

let channels = [];
let favorites = JSON.parse(
    localStorage.getItem("futiptv_favorites") || "[]"
);

let currentCategory = "Todos";
let hls = null;
let loadingTimeout = null;


/* =========================
   STATUS
========================= */

function setStatus(text) {
    if (status) {
        status.textContent = text;
    }

    console.log("FutIPTV:", text);
}


/* =========================
   CARREGAR PLAYLIST
========================= */

async function loadPlaylist() {

    setStatus("📥 Carregando playlist...");

    if (loading) {
        loading.style.display = "block";
    }

    try {

        const response = await fetch(
            "/api/playlist?t=" + Date.now()
        );

        if (!response.ok) {
            throw new Error(
                "HTTP " + response.status
            );
        }

        const text = await response.text();

        console.log(
            "Playlist recebida:",
            text.length,
            "caracteres"
        );

        if (!text.includes("#EXTINF")) {
            throw new Error(
                "Nenhum #EXTINF encontrado."
            );
        }

        channels = parseM3U(text);

        console.log(
            "Canais encontrados:",
            channels.length
        );

        if (channels.length === 0) {
            throw new Error(
                "Nenhum canal válido encontrado."
            );
        }

        setStatus(
            "⚽ " + channels.length + " canais"
        );

        renderCategories();
        renderChannels();

    } catch (error) {

        console.error(error);

        setStatus(
            "❌ " + error.message
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
                        ${escapeHTML(error.message)}
                    </small>
                </div>
            `;
        }

    } finally {

        if (loading) {
            loading.style.display = "none";
        }
    }
}


/* =========================
   PARSER M3U
========================= */

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

        if (!line) continue;


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
                        .substring(comma + 1)
                        .trim();
            }


            const logo =
                line.match(
                    /tvg-logo=["']([^"']*)["']/i
                );

            if (logo) {
                current.logo = logo[1];
            }


            const group =
                line.match(
                    /group-title=["']([^"']*)["']/i
                );

            if (group) {
                current.group = group[1];
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

                current.url = line;

                result.push(current);
            }

            current = null;
        }
    }

    return result;
}


/* =========================
   CATEGORIAS
========================= */

function renderCategories() {

    if (!categories) return;

    const groups = [
        ...new Set(
            channels
                .map(c => c.group)
                .filter(Boolean)
        )
    ];

    categories.innerHTML = `
        <button
            class="category ${
                currentCategory === "Todos"
                    ? "active"
                    : ""
            }"
            data-category="Todos"
        >
            Todos
        </button>
    `;


    groups.forEach(group => {

        const button =
            document.createElement("button");

        button.className =
            "category" +
            (
                currentCategory === group
                    ? " active"
                    : ""
            );

        button.dataset.category =
            group;

        button.textContent =
            group;

        button.addEventListener(
            "click",
            () => {

                currentCategory =
                    group;

                renderCategories();
                renderChannels();
            }
        );

        categories.appendChild(button);
    });


    const allButton =
        categories.querySelector(
            '[data-category="Todos"]'
        );

    if (allButton) {

        allButton.addEventListener(
            "click",
            () => {

                currentCategory =
                    "Todos";

                renderCategories();
                renderChannels();
            }
        );
    }
}


/* =========================
   RENDERIZAR CANAIS
========================= */

function renderChannels() {

    if (!channelList) return;


    const search =
        searchInput
            ? searchInput.value
                .toLowerCase()
                .trim()
            : "";


    let filtered =
        channels.filter(channel => {

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
                name.includes(search) ||
                group.includes(search);


            const matchesCategory =
                currentCategory === "Todos" ||
                channel.group ===
                    currentCategory;


            const matchesFavorite =
                currentTab !== "favorites" ||
                favorites.includes(
                    channel.url
                );


            return (
                matchesSearch &&
                matchesCategory &&
                matchesFavorite
            );
        });


    channelList.innerHTML = "";


    if (
        channelCount
    ) {

        channelCount.textContent =
            filtered.length +
            (
                filtered.length === 1
                    ? " canal"
                    : " canais"
            );
    }


    if (
        filtered.length === 0
    ) {

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


    filtered.forEach(channel => {

        const item =
            document.createElement("div");

        item.className =
            "channel";


        const isFavorite =
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
            >
                ${
                    isFavorite
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


        favoriteButton.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                toggleFavorite(
                    channel.url
                );
            }
        );


        channelList.appendChild(
            item
        );
    });
}


/* =========================
   PLAYER
========================= */

function playChannel(channel) {

    if (!video) {
        console.error(
            "Video não encontrado."
        );

        return;
    }


    console.log(
        "Abrindo canal:",
        channel.name
    );

    console.log(
        "URL:",
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
            "▶ " + channel.name;
    }


    /* LIMPAR PLAYER ANTERIOR */

    clearPlayer();


    const url =
        channel.url.toLowerCase();


    /* =========================
       DASH
    ========================= */

    if (
        url.includes(".mpd")
    ) {

        showPlayerMessage(
            "⚠️ Este canal usa DASH (.mpd). O Player HLS não consegue reproduzir este formato."
        );

        return;
    }


    /* =========================
       HLS
    ========================= */

    if (
        window.Hls &&
        Hls.isSupported()
    ) {

        console.log(
            "HLS.js detectado."
        );


        hls =
            new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30
            });


        hls.loadSource(
            channel.url
        );


        hls.attachMedia(
            video
        );


        hls.on(
            Hls.Events.MANIFEST_PARSED,
            () => {

                console.log(
                    "Manifest HLS carregado."
                );

                clearTimeout(
                    loadingTimeout
                );

                video.play()
                    .then(() => {

                        setStatus(
                            "▶ Reproduzindo: " +
                            channel.name
                        );

                    })
                    .catch(error => {

                        console.log(
                            "Autoplay bloqueado:",
                            error
                        );

                        setStatus(
                            "▶ Toque no botão Play"
                        );
                    });
            }
        );


        hls.on(
            Hls.Events.ERROR,
            (
                event,
                data
            ) => {

                console.error(
                    "HLS ERROR:",
                    data
                );


                if (
                    data.fatal
                ) {

                    clearTimeout(
                        loadingTimeout
                    );


                    showPlayerMessage(
                        "❌ Não foi possível reproduzir este canal."
                    );


                    hls.destroy();

                    hls = null;
                }
            }
        );


        /* TIMEOUT */

        loadingTimeout =
            setTimeout(
                () => {

                    if (
                        video.readyState === 0
                    ) {

                        console.log(
                            "Timeout HLS."
                        );

                        showPlayerMessage(
                            "⏳ Este canal demorou demais para responder ou está offline."
                        );
                    }

                },
                15000
            );


        return;
    }


    /* =========================
       SAFARI / HLS NATIVO
    ========================= */

    if (
        video.canPlayType(
            "application/vnd.apple.mpegurl"
        )
    ) {

        video.src =
            channel.url;


        video.addEventListener(
            "loadedmetadata",
            () => {

                video.play()
                    .catch(
                        () => {}
                    );
            },
            {
                once: true
            }
        );


        return;
    }


    showPlayerMessage(
        "❌ Seu navegador não suporta este formato."
    );
}


/* =========================
   LIMPAR PLAYER
========================= */

function clearPlayer() {

    clearTimeout(
        loadingTimeout
    );


    if (hls) {

        try {
            hls.destroy();
        } catch (e) {}

        hls = null;
    }


    video.pause();

    video.removeAttribute(
        "src"
    );

    video.load();
}


/* =========================
   MENSAGEM NO PLAYER
========================= */

function showPlayerMessage(
    message
) {

    setStatus(
        message
    );

    console.log(
        message
    );
}


/* =========================
   FECHAR PLAYER
========================= */

if (closePlayer) {

    closePlayer.addEventListener(
        "click",
        () => {

            clearPlayer();


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
        }
    );
}


/* =========================
   FAVORITOS
========================= */

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


/* =========================
   PESQUISA
========================= */

if (searchInput) {

    searchInput.addEventListener(
        "input",
        renderChannels
    );
}


/* =========================
   RELOAD
========================= */

if (reloadBtn) {

    reloadBtn.addEventListener(
        "click",
        loadPlaylist
    );
}


/* =========================
   SEGURANÇA HTML
========================= */

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


/* =========================
   INICIAR
========================= */

loadPlaylist();