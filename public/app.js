const statusElement = document.getElementById("status");
const channelsContainer = document.getElementById("canais");
const loadingElement = document.getElementById("loading");
const emptyElement = document.getElementById("emptyState");
const countElement = document.getElementById("channelCount");

const searchInput = document.getElementById("searchInput");
const categoriesElement = document.getElementById("categories");

const playerSection = document.getElementById("playerSection");
const videoPlayer = document.getElementById("videoPlayer");
const playerTitle = document.getElementById("playerTitle");
const closePlayer = document.getElementById("closePlayer");

const refreshButton = document.getElementById("refreshBtn");

let channels = [];
let currentCategory = "Todos";


/* =========================
   CARREGAR PLAYLIST
========================= */

async function carregarPlaylist() {

  loadingElement.classList.remove("hidden");
  emptyElement.classList.add("hidden");

  try {

    statusElement.textContent =
      "Conectando à API...";

    const response = await fetch("/api/playlist");

    if (!response.ok) {
      throw new Error("Falha na API");
    }

    const playlist = await response.text();

    channels = analisarM3U(playlist);

    statusElement.textContent =
      "🟢 Playlist carregada";

    criarCategorias();

    mostrarCanais();

  } catch (error) {

    console.error(error);

    statusElement.textContent =
      "🔴 Erro ao carregar playlist";

    channels = [];

    mostrarCanais();

  } finally {

    loadingElement.classList.add("hidden");

  }

}


/* =========================
   LER M3U
========================= */

function analisarM3U(texto) {

  const linhas = texto
    .split(/\r?\n/)
    .map(linha => linha.trim())
    .filter(Boolean);

  const resultado = [];

  for (let i = 0; i < linhas.length; i++) {

    const linha = linhas[i];

    if (!linha.startsWith("#EXTINF")) {
      continue;
    }

    const url = linhas[i + 1];

    if (!url || url.startsWith("#")) {
      continue;
    }

    const nomeParte =
      linha.substring(linha.lastIndexOf(",") + 1);

    const grupoMatch =
      linha.match(/group-title="([^"]*)"/i);

    const categoria =
      grupoMatch
        ? grupoMatch[1]
        : "Outros";

    resultado.push({
      name: nomeParte || "Canal",
      category: categoria,
      url: url
    });

  }

  return resultado;

}


/* =========================
   CATEGORIAS
========================= */

function criarCategorias() {

  const categorias = [
    "Todos",
    ...new Set(
      channels.map(canal => canal.category)
    )
  ];

  categoriesElement.innerHTML = "";

  categorias.forEach(categoria => {

    const button =
      document.createElement("button");

    button.className = "category";

    if (categoria === currentCategory) {
      button.classList.add("active");
    }

    button.textContent = categoria;

    button.dataset.category = categoria;

    button.addEventListener(
      "click",
      () => {

        currentCategory = categoria;

        document
          .querySelectorAll(".category")
          .forEach(btn =>
            btn.classList.remove("active")
          );

        button.classList.add("active");

        mostrarCanais();

      }
    );

    categoriesElement.appendChild(button);

  });

}


/* =========================
   MOSTRAR CANAIS
========================= */

function mostrarCanais() {

  const pesquisa =
    searchInput.value
      .toLowerCase()
      .trim();

  let filtrados = channels.filter(canal => {

    const categoriaOK =
      currentCategory === "Todos" ||
      canal.category === currentCategory;

    const pesquisaOK =
      canal.name
        .toLowerCase()
        .includes(pesquisa);

    return categoriaOK && pesquisaOK;

  });

  channelsContainer.innerHTML = "";

  countElement.textContent =
    `${filtrados.length} canal${filtrados.length === 1 ? "" : "is"}`;

  if (filtrados.length === 0) {

    emptyElement.classList.remove("hidden");

    return;

  }

  emptyElement.classList.add("hidden");

  filtrados.forEach(canal => {

    const card =
      document.createElement("button");

    card.className = "channel-card";

    card.innerHTML = `

      <div class="channel-logo">
        ⚽
      </div>

      <div>

        <div class="channel-name">
          ${escaparHTML(canal.name)}
        </div>

        <div class="channel-category">
          ${escaparHTML(canal.category)}
        </div>

      </div>

    `;

    card.addEventListener(
      "click",
      () => abrirPlayer(canal)
    );

    channelsContainer.appendChild(card);

  });

}


/* =========================
   PLAYER
========================= */

function abrirPlayer(canal) {

  playerSection.classList.remove("hidden");

  playerTitle.textContent =
    canal.name;

  videoPlayer.src =
    canal.url;

  videoPlayer.play().catch(() => {});

  playerSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =========================
   FECHAR PLAYER
========================= */

closePlayer.addEventListener(
  "click",
  () => {

    videoPlayer.pause();

    videoPlayer.removeAttribute("src");

    videoPlayer.load();

    playerSection.classList.add("hidden");

  }
);


/* =========================
   PESQUISA
========================= */

searchInput.addEventListener(
  "input",
  () => {

    mostrarCanais();

  }
);


/* =========================
   ATUALIZAR
========================= */

refreshButton.addEventListener(
  "click",
  async () => {

    refreshButton.style.transform =
      "rotate(360deg)";

    await carregarPlaylist();

    setTimeout(() => {

      refreshButton.style.transform =
        "";

    }, 300);

  }
);


/* =========================
   SEGURANÇA HTML
========================= */

function escaparHTML(texto) {

  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================
   INICIAR
========================= */

carregarPlaylist();