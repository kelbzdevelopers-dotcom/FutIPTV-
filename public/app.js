/* =========================================================
   FutIPTV v1.0
   Player + Playlist M3U
========================================================= */

const video = document.getElementById("video");
const channelList = document.getElementById("channelList");
const status = document.getElementById("status");
const searchInput = document.getElementById("searchInput");
const reloadBtn = document.getElementById("reloadBtn");
const nowPlaying = document.getElementById("nowPlaying");

let channels = [];
let favorites = JSON.parse(localStorage.getItem("futiptv_favorites") || "[]");
let currentTab = "all";
let hls = null;


/* =========================================================
   STATUS
========================================================= */

function setStatus(text) {
    if (status) {
        status.textContent = text;
    }

    console.log("FutIPTV:", text);
}


/* =========================================================
   CARREGAR PLAYLIST
========================================================= */

async function loadPlaylist() {

    setStatus("📥 Carregando playlist...");

    if (channelList) {
        channelList.innerHTML = `
            <div style="padding:20px;text-align:center">
                📥 Carregando canais...
            </div>
        `;
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

        if (!text || !text.includes("#EXTINF")) {
            throw new Error(
                "A playlist não contém canais."
            );
        }

        setStatus(
            "📥 Playlist recebida: " +
            text.length +
            " caracteres"
        );


        /* =================================================
           PARSER M3U
        ================================================= */

        channels = parseM3U(text);


        console.log(
            "Canais encontrados:",
            channels.length
        );


        if (channels.length === 0) {

            throw new Error(
                "Nenhum canal válido foi encontrado."
            );

        }


        /* Remove duplicados */

        const unique = [];

        const urls = new Set();

        for (const channel of channels) {

            if (!channel.url) continue;

            if (
                channel.url.includes(
                    "[NO PUBLIC STREAM]"
                )
            ) {
                continue;
            }

            if (urls.has(channel.url)) {
                continue;
            }

            urls.add(channel.url);

            unique.push(channel);
        }

        channels = unique;


        setStatus(
            "⚽ " +
            channels.length +
            " canais"
        );


        renderChannels();


    } catch (error) {

        console.error(
            "Erro FutIPTV:",
            error
        );

        setStatus(
            "❌ Erro: " +
            error.message
        );

        if (channelList) {

            channelList.innerHTML = `
                <div style="padding:20px;text-align:center">
                    ❌ Não foi possível carregar os canais.
                    <br><br>
                    <small>${error.message}</small>
                </div>
            `;

        }

    }

}


/* =========================================================
   PARSER M3U
========================================================= */

function parseM3U(text) {

    const lines = text.split(/\r?\n/);

    const result = [];

    let current = null;


    for (let i = 0; i < lines.length; i++) {

        const raw = lines[i];

        const line = raw.trim();


        if (!line) {
            continue;
        }


        /* Encontrou EXTINF */

        if (
            line.toUpperCase().startsWith("#EXTINF")
        ) {

            current = {

                name: "Canal",

                logo: "",

                group: "",

                url: ""

            };


            /* Nome depois da última vírgula */

            const comma =
                line.lastIndexOf(",");

            if (comma !== -1) {

                current.name =
                    line
                        .substring(comma + 1)
                        .trim();

            }


            /* Logo */

            const logoMatch =
                line.match(
                    /tvg-logo=["']([^"']*)["']/i
                );

            if (logoMatch) {

                current.logo =
                    logoMatch[1];

            }


            /* Grupo */

            const groupMatch =
                line.match(
                    /group-title=["']([^"']*)["']/i
                );

            if (groupMatch) {

                current.group =
                    groupMatch[1];

            }


            result.push(current);

            continue;
        }


        /* URL */

        if (
            current &&
            !line.startsWith("#")
        ) {

            current.url = line;

            current = null;

        }

    }


    return result.filter(
        channel =>
            channel.url &&
            !channel.url.includes(
                "[NO PUBLIC STREAM]"
            )
    );

}


/* =========================================================
   RENDERIZAR CANAIS
========================================================= */

function renderChannels() {

    if (!channelList) return;


    const search =
        searchInput
            ? searchInput.value
                .toLowerCase()
                .trim()
            : "";


    let filtered = channels.filter(
        channel => {

            const name =
                channel.name.toLowerCase();

            const group =
                channel.group.toLowerCase();

            const matchesSearch =
                !search ||
                name.includes(search) ||
                group.includes(search);


            if (!matchesSearch) {
                return false;
            }


            if (
                currentTab === "favorites"
            ) {

                return favorites.includes(
                    channel.url
                );

            }


            return true;

        }
    );


    if (filtered.length === 0) {

        channelList.innerHTML = `
            <div style="padding:20px;text-align:center">
                Nenhum canal encontrado.
            </div>
        `;

        return;
    }


    channelList.innerHTML = "";


    filtered.forEach(
        (channel, index) => {

            const item =
                document.createElement("div");

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
                        `<img
                            src="${channel.logo}"
                            loading="lazy"
                            onerror="this.style.display='none'"
                        >`
                        :
                        "⚽"
                    }

                </div>


                <div class="channel-info">

                    <strong>
                        ${escapeHTML(channel.name)}
                    </strong>

                    <small>
                        ${escapeHTML(channel.group)}
                    </small>

                </div>


                <button
                    class="favorite"
                    data-url="${encodeURIComponent(channel.url)}"
                >
                    ${favorite ? "⭐" : "☆"}
                </button>

            `;


            item.addEventListener(
                "click",
                function(event) {

                    if (
                        event.target.closest(
                            ".favorite"
                        )
                    ) {
                        return;
                    }

                    playChannel(channel);

                }
            );


            const favoriteButton =
                item.querySelector(
                    ".favorite"
                );


            favoriteButton.addEventListener(
                "click",
                function(event) {

                    event.stopPropagation();

                    toggleFavorite(
                        channel.url
                    );

                }
            );


            channelList.appendChild(item);

        }
    );

}


/* =========================================================
   PLAYER
========================================================= */

function playChannel(channel) {

    if (!video) return;


    if (hls) {

        hls.destroy();

        hls = null;

    }


    if (nowPlaying) {

        nowPlaying.textContent =
            "▶ " + channel.name;

    }


    const url = channel.url;


    if (
        window.Hls &&
        Hls.isSupported()
    ) {

        hls = new Hls();

        hls.loadSource(url);

        hls.attachMedia(video);

        hls.on(
            Hls.Events.MANIFEST_PARSED,
            function() {

                video.play()
                    .catch(() => {});

            }
        );


        hls.on(
            Hls.Events.ERROR,
            function(
                event,
                data
            ) {

                console.log(
                    "HLS:",
                    data
                );

            }
        );

    }

    else if (
        video.canPlayType(
            "application/vnd.apple.mpegurl"
        )
    ) {

        video.src = url;

        video.play()
            .catch(() => {});

    }

    else {

        alert(
            "Seu navegador não suporta este formato."
        );

    }

}


/* =========================================================
   FAVORITOS
========================================================= */

function toggleFavorite(url) {

    if (
        favorites.includes(url)
    ) {

        favorites =
            favorites.filter(
                item => item !== url
            );

    }

    else {

        favorites.push(url);

    }


    localStorage.setItem(
        "futiptv_favorites",
        JSON.stringify(favorites)
    );


    renderChannels();

}


/* =========================================================
   BUSCA
========================================================= */

if (searchInput) {

    searchInput.addEventListener(
        "input",
        renderChannels
    );

}


/* =========================================================
   ABAS
========================================================= */

document.querySelectorAll(".tab")
    .forEach(tab => {

        tab.addEventListener(
            "click",
            function() {

                document
                    .querySelectorAll(".tab")
                    .forEach(
                        t =>
                            t.classList.remove(
                                "active"
                            )
                    );


                this.classList.add(
                    "active"
                );


                currentTab =
                    this.dataset.tab ||
                    "all";


                renderChannels();

            }
        );

    });


/* =========================================================
   RECARREGAR
========================================================= */

if (reloadBtn) {

    reloadBtn.addEventListener(
        "click",
        loadPlaylist
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

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


/* =========================================================
   INICIAR
========================================================= */

loadPlaylist();