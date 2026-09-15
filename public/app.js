/*
 * =========================================================
 * FUTIPTV v1.0
 * =========================================================
 */


/* =========================================================
   ELEMENTOS
   ========================================================= */

const video =
    document.getElementById("video");

const playerPlaceholder =
    document.getElementById("playerPlaceholder");

const nowPlaying =
    document.getElementById("nowPlaying");

const channelList =
    document.getElementById("channelList");

const searchInput =
    document.getElementById("searchInput");

const status =
    document.getElementById("status");

const reloadBtn =
    document.getElementById("reloadBtn");


/* =========================================================
   ESTADO
   ========================================================= */

let channels = [];

let currentChannel = null;

let currentTab = "all";

let hls = null;


/* =========================================================
   FAVORITOS
   ========================================================= */

let favorites =
    JSON.parse(
        localStorage.getItem(
            "futiptv_favorites"
        ) || "[]"
    );


/* =========================================================
   CARREGAR PLAYLIST
   ========================================================= */

async function loadPlaylist() {

    status.textContent =
        "⏳ Carregando canais...";


    channelList.innerHTML = `
        <div class="loading">
            ⚽ Carregando playlist...
        </div>
    `;


    try {

        const response =
            await fetch(
                "/api/playlist",
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "HTTP " +
                response.status
            );

        }


        const text =
            await response.text();


        console.log(
            "FutIPTV: playlist recebida:",
            text.length,
            "caracteres"
        );


        channels =
            parseM3U(text);


        console.log(
            "FutIPTV: canais encontrados:",
            channels.length
        );


        /*
         * Remove URLs duplicadas.
         */

        const unique =
            new Map();


        channels.forEach(
            channel => {

                if (
                    channel.url &&
                    !unique.has(
                        channel.url
                    )
                ) {

                    unique.set(
                        channel.url,
                        channel
                    );

                }

            }
        );


        channels =
            Array.from(
                unique.values()
            );


        /*
         * Verifica se encontrou canais.
         */

        if (!channels.length) {

            throw new Error(
                "Nenhum canal encontrado na playlist"
            );

        }


        status.textContent =
            `⚽ ${channels.length} canais`;


        renderChannels();

    }


    catch (error) {

        console.error(
            "FutIPTV:",
            error
        );


        status.textContent =
            "❌ Erro ao carregar canais";


        channelList.innerHTML = `

            <div class="error">

                <h3>
                    Não foi possível carregar os canais.
                </h3>

                <p>
                    ${escapeHTML(
                        error.message
                    )}
                </p>

                <button
                    onclick="loadPlaylist()"
                    type="button"
                >
                    ↻ Tentar novamente
                </button>

            </div>

        `;

    }

}


/* =========================================================
   PARSER M3U
   ========================================================= */

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


        /*
         * Detecta qualquer #EXTINF
         */

        if (
            line
                .toUpperCase()
                .startsWith("#EXTINF")
        ) {


            /*
             * Nome depois da última vírgula.
             */

            const comma =
                line.lastIndexOf(",");


            let name =
                "Canal";


            if (
                comma !== -1
            ) {

                name =
                    line
                        .substring(
                            comma + 1
                        )
                        .trim();

            }


            /*
             * Logo
             */

            const logoMatch =
                line.match(
                    /tvg-logo\s*=\s*"([^"]*)"/i
                );


            /*
             * Categoria
             */

            const groupMatch =
                line.match(
                    /group-title\s*=\s*"([^"]*)"/i
                );


            /*
             * Nome oficial do M3U
             */

            const tvgNameMatch =
                line.match(
                    /tvg-name\s*=\s*"([^"]*)"/i
                );


            current = {

                id:
                    result.length + 1,

                name:
                    name || (
                        tvgNameMatch
                            ? tvgNameMatch[1]
                            : "Canal"
                    ),

                logo:
                    logoMatch
                        ? logoMatch[1]
                        : "",

                category:
                    groupMatch
                        ? groupMatch[1]
                        : "Esportes",

                url: ""

            };


            continue;

        }


        /*
         * Encontrou a URL
         */

        if (

            current &&
            line &&
            !line.startsWith("#")

        ) {

            current.url =
                line;


            result.push(
                current
            );


            current = null;

        }

    }


    console.log(
        "FutIPTV parser:",
        result.length,
        "canais"
    );


    return result;

}


/* =========================================================
   RENDERIZAR CANAIS
   ========================================================= */

function renderChannels() {

    let list =
        [...channels];


    if (
        currentTab ===
        "favorites"
    ) {

        list =
            list.filter(
                channel =>
                    favorites.includes(
                        channel.id
                    )
            );

    }


    const search =
        searchInput.value
            .toLowerCase()
            .trim();


    if (search) {

        list =
            list.filter(
                channel => {

                    const text = (

                        channel.name +
                        " " +
                        channel.category

                    ).toLowerCase();


                    return text.includes(
                        search
                    );

                }
            );

    }


    if (!list.length) {

        channelList.innerHTML = `

            <div class="empty">

                ${
                    currentTab ===
                    "favorites"

                        ? "⭐ Nenhum favorito."

                        : "Nenhum canal encontrado."

                }

            </div>

        `;

        return;

    }


    const groups = {};


    list.forEach(
        channel => {

            const category =
                channel.category ||
                "Esportes";


            if (
                !groups[category]
            ) {

                groups[category] =
                    [];

            }


            groups[category].push(
                channel
            );

        }
    );


    channelList.innerHTML =
        "";


    Object
        .keys(groups)
        .sort()
        .forEach(
            category => {

                const title =
                    document.createElement(
                        "div"
                    );


                title.className =
                    "category-title";


                title.textContent =
                    category;


                channelList.appendChild(
                    title
                );


                groups[category]
                    .forEach(
                        channel => {

                            createChannelElement(
                                channel
                            );

                        }
                    );

            }
        );

}


/* =========================================================
   ELEMENTO DO CANAL
   ========================================================= */

function createChannelElement(
    channel
) {

    const element =
        document.createElement(
            "div"
        );


    element.className =
        "channel";


    if (

        currentChannel &&
        currentChannel.id ===
        channel.id

    ) {

        element.classList.add(
            "active"
        );

    }


    const favorite =
        favorites.includes(
            channel.id
        );


    element.innerHTML = `

        <div class="channel-logo">

            ${
                channel.logo

                    ? `
                        <img
                            src="${escapeHTML(channel.logo)}"
                            alt=""
                            loading="lazy"
                            onerror="
                                this.style.display='none';
                                this.parentElement.textContent='📺';
                            "
                        >
                      `

                    : "📺"
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
                    channel.category
                )}
            </small>

        </div>


        <button
            class="favorite"
            type="button"
            aria-label="Favoritar"
        >

            ${
                favorite
                    ? "★"
                    : "☆"
            }

        </button>

    `;


    element.addEventListener(
        "click",
        () => {

            playChannel(
                channel
            );

        }
    );


    const favoriteButton =
        element.querySelector(
            ".favorite"
        );


    favoriteButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            toggleFavorite(
                channel.id
            );

        }
    );


    channelList.appendChild(
        element
    );

}


/* =========================================================
   FAVORITOS
   ========================================================= */

function toggleFavorite(id) {

    if (
        favorites.includes(id)
    ) {

        favorites =
            favorites.filter(
                favorite =>
                    favorite !== id
            );

    }

    else {

        favorites.push(id);

    }


    localStorage.setItem(
        "futiptv_favorites",
        JSON.stringify(
            favorites
        )
    );


    renderChannels();

}


/* =========================================================
   PLAYER
   ========================================================= */

function playChannel(channel) {

    if (
        !channel ||
        !channel.url
    ) {

        alert(
            "Este canal não possui um link válido."
        );

        return;

    }


    currentChannel =
        channel;


    playerPlaceholder.style.display =
        "none";


    video.style.display =
        "block";


    nowPlaying.textContent =
        "▶️ " +
        channel.name;


    if (hls) {

        hls.destroy();

        hls = null;

    }


    video.pause();

    video.removeAttribute(
        "src"
    );

    video.load();


    if (
        typeof Hls !== "undefined" &&
        Hls.isSupported()
    ) {

        hls =
            new Hls({

                enableWorker:
                    true,

                lowLatencyMode:
                    true,

                backBufferLength:
                    30

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

                video
                    .play()
                    .catch(
                        () => {}
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

                    nowPlaying.textContent =
                        "❌ Canal indisponível";

                }

            }
        );

    }


    else if (

        video.canPlayType(
            "application/vnd.apple.mpegurl"
        )

    ) {

        video.src =
            channel.url;


        video
            .play()
            .catch(
                () => {}
            );

    }


    else {

        nowPlaying.textContent =
            "❌ HLS não suportado";

    }


    renderChannels();

}


/* =========================================================
   ESCAPAR HTML
   ========================================================= */

function escapeHTML(text) {

    return String(
        text || ""
    )

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


/* =========================================================
   PESQUISA
   ========================================================= */

searchInput.addEventListener(
    "input",
    renderChannels
);


/* =========================================================
   ATUALIZAR
   ========================================================= */

reloadBtn.addEventListener(
    "click",
    loadPlaylist
);


/* =========================================================
   ABAS
   ========================================================= */

document
    .querySelectorAll(".tab")
    .forEach(
        tab => {

            tab.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".tab"
                        )
                        .forEach(
                            button =>
                                button.classList.remove(
                                    "active"
                                )
                        );


                    tab.classList.add(
                        "active"
                    );


                    currentTab =
                        tab.dataset.tab;


                    renderChannels();

                }
            );

        }
    );


/* =========================================================
   TENTAR NOVAMENTE
   ========================================================= */

window.loadPlaylist =
    loadPlaylist;


/* =========================================================
   INICIAR
   ========================================================= */

loadPlaylist();