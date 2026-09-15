const video = document.getElementById("videoPlayer");
const channelList = document.getElementById("canais");
const reloadBtn = document.getElementById("refreshBtn");
const nowPlaying = document.getElementById("playerTitle");
const channelCount = document.getElementById("channelCount");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");

let channels = [];
let favorites = JSON.parse(
    localStorage.getItem("futiptv_favorites") || "[]"
);

let currentTab = "all";
let hls = null;


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

        renderChannels();

    } catch (error) {

        console.error(error);

        setStatus(
            "❌ " + error.message
        );

        if (channelList) {

            channelList.innerHTML = `
                <div style="padding:20px;text-align:center">
                    ❌ Erro ao carregar canais.
                    <br><br>
                    <small>${escapeHTML(error.message)}</small>
                </div>
            `;

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

    for (let i = 0; i < lines.length; i++) {

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
                        .substring(comma + 1)
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

                current.url = line;

                result.push(current);

            }

            current = null;

        }

    }

    return result;

}


/* =========================
   RENDERIZAR CANAIS
========================= */

function renderChannels() {

    if (!channelList) {

        console.error(
            "ERRO: #channelList não existe no HTML"
        );

        return;

    }


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


            if (!matchesSearch) {
                return false;
            }


            if (
                currentTab ===
                "favorites"
            ) {

                return favorites.includes(
                    channel.url
                );

            }


            return true;

        });


    console.log(
        "Renderizando:",
        filtered.length,
        "canais"
    );


    channelList.innerHTML = "";


    if (
        filtered.length === 0
    ) {

        channelList.innerHTML = `
            <div style="padding:20px;text-align:center">
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
                            src="${escapeHTML(channel.logo)}"
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
                        ${escapeHTML(channel.name)}
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

        }
    );


    /* Atualiza contador */

    const counter =
        document.querySelector(
            ".channel-count"
        );

    if (counter) {

        counter.textContent =
            filtered.length +
            " canais";

    }

}


/* =========================
   PLAYER
========================= */

function playChannel(channel) {

    if (!video) {
        return;
    }


    if (hls) {

        hls.destroy();

        hls = null;

    }


    if (nowPlaying) {

        nowPlaying.textContent =
            "▶ " + channel.name;

    }


    const url =
        channel.url;


    if (
        window.Hls &&
        Hls.isSupported()
    ) {

        hls =
            new Hls();


        hls.loadSource(
            url
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
            (event, data) => {

                console.log(
                    "Erro HLS:",
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

        video.src =
            url;

        video
            .play()
            .catch(
                () => {}
            );

    }

    else {

        alert(
            "Seu navegador não suporta este stream."
        );

    }

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

    }

    else {

        favorites.push(url);

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
   ABAS
========================= */

document
    .querySelectorAll(".tab")
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