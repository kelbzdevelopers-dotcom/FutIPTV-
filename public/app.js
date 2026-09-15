async function iniciar() {

  const status = document.getElementById("status");
  const canais = document.getElementById("canais");

  try {

    const resposta = await fetch("/api/playlist");

    if (!resposta.ok) {
      throw new Error("Erro na API");
    }

    const texto = await resposta.text();

    status.textContent = "✅ Playlist carregada!";

    console.log(texto);

    const linhas = texto.split("\n");

    let quantidade = 0;

    for (const linha of linhas) {

      if (linha.startsWith("#EXTINF")) {
        quantidade++;
      }

    }

    canais.innerHTML = `
      <p>📺 ${quantidade} canais encontrados.</p>
    `;

  } catch (erro) {

    console.error(erro);

    status.textContent =
      "❌ Erro ao carregar playlist.";

  }

}

iniciar();