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


        /*
         * O servidor já entrega
         * somente os canais filtrados.
         *
         * Portanto, o celular não
         * precisa filtrar novamente.
         */

        channels =
            parseM3U(text);


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
                "Nenhum canal esportivo encontrado"
            );

        }


        status.textContent =
            `⚽ ${channels.length} canais esportivos disponíveis`;


        renderChannels();


    }

    catch (error) {

        console.error(
            "Erro ao carregar playlist:",
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
                    Verifique se o servidor está funcionando
                    e se /api/playlist está disponível.
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
         * Informações do canal
         */

        if (
            line.startsWith(
                "#EXTINF:"
            )
        ) {

            const nameMatch =
                line.match(
                    /,(.+)$/
                );


            const logoMatch =
                line.match(
                    /tvg-logo="([^"]*)"/i
                );


            const groupMatch =
                line.match(
                    /group-title="([^"]*)"/i
                );


            current = {

                id:
                    result.length + 1,

                name:
                    nameMatch
                        ? nameMatch[1].trim()
                        : "Canal",

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

        }


        /*
         * URL
         */

        else if (

            line &&
            !line.startsWith("#") &&
            current

        ) {

            current.url =
                line;


            result.push(
                current
            );


            current = null;

        }

    }


    return result;

}


/* =========================================================
   RENDERIZAR CANAIS
   ========================================================= */

function renderChannels() {

    let list =
        [...channels];


    /*
     * FAVORITOS
     */

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


    /*
     * PESQUISA
     */

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


    /*
     * NENHUM RESULTADO
     */

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


    /*
     * AGRUPAR CATEGORIAS
     */

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


    /*
     * CRIAR GRUPOS
     */

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


    /*
     * Abrir canal
     */

    element.addEventListener(
        "click",
        () => {

            playChannel(
                channel
            );

        }
    );


    /*
     * Favorito
     */

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


    /*
     * Esconde placeholder
     */

    playerPlaceholder.style.display =
        "none";


    video.style.display =
        "block";


    /*
     * Nome do canal
     */

    nowPlaying.textContent =
        "▶️ " +
        channel.name;


    /*
     * Destruir HLS anterior
     */

    if (hls) {

        hls.destroy();

        hls = null;

    }


    video.pause();

    video.removeAttribute(
        "src"
    );

    video.load();


    /*
     * HLS.js
     */

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


    /*
     * HLS nativo
     */

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


    /*
     * Atualiza visual da lista
     */

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
   BOTÃO ATUALIZAR
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
   DISPONIBILIZAR PARA BOTÃO "TENTAR NOVAMENTE"
   ========================================================= */

window.loadPlaylist =
    loadPlaylist;


/* =========================================================
   INICIAR
   ========================================================= */

loadPlaylist();