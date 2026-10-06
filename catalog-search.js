(() => {
  const affiliateTag = "sarapessopani-20";
  const searchInputSelector = "#book-search";
  const amazonCoverByIsbn = {
    "9786555656121": "https://m.media-amazon.com/images/I/81SLY5aW9vL.jpg",
  };
  let books = [];
  let searchSequence = 0;

  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

  const cleanIsbn = (value) => String(value || "").replace(/[^0-9x]/gi, "").toUpperCase();

  function isbn13To10(value) {
    const isbn = cleanIsbn(value);
    if (!/^978\d{10}$/.test(isbn)) return "";

    const checksum13 = [...isbn.slice(0, 12)].reduce(
      (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    if ((10 - checksum13 % 10) % 10 !== Number(isbn[12])) return "";

    const base = isbn.slice(3, 12);
    const checksum10 = [...base].reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0);
    const remainder = (11 - checksum10 % 11) % 11;
    return base + (remainder === 10 ? "X" : String(remainder));
  }

  function amazonUrl(book) {
    const isbn = cleanIsbn(book.isbn13 || book.isbn);
    const isbn10 = isbn.length === 13 ? isbn13To10(isbn) : isbn.length === 10 ? isbn : "";
    if (isbn10) return `https://www.amazon.com.br/dp/${isbn10}?tag=${affiliateTag}`;

    const query = [book.title, book.author].filter(Boolean).join(" ") || isbn;
    return `https://www.amazon.com.br/s?${new URLSearchParams({ k: query, i: "books", s: "price-asc-rank", tag: affiliateTag })}`;
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function secureCover(value) {
    const cover = String(value || "").replace(/^http:/i, "https:").replace(/&amp;/g, "&");
    return /^https:\/\//i.test(cover) ? cover : "";
  }

  function fallbackAmazonCover(isbn) {
    return amazonCoverByIsbn[cleanIsbn(isbn)] || "";
  }

  function bookFromGoogle(item) {
    const info = item?.volumeInfo;
    if (!info?.title) return null;
    const identifiers = info.industryIdentifiers || [];
    const isbn13 = identifiers.find((entry) => entry.type === "ISBN_13")?.identifier || "";
    const isbn10 = identifiers.find((entry) => entry.type === "ISBN_10")?.identifier || "";
    const images = info.imageLinks || {};
    return {
      title: info.title,
      subtitle: info.subtitle || "",
      author: (info.authors || []).join(", "),
      publisher: info.publisher || "Editora não informada",
      year: info.publishedDate || "",
      pageCount: info.pageCount || "",
      isbn: isbn13 || isbn10,
      synopsis: info.description || "Sinopse não disponível.",
      cover: secureCover(images.extraLarge || images.large || images.medium || images.thumbnail),
      source: "Google Books",
    };
  }

  async function searchExternal(query, isbn) {
    let brasilBook = null;
    if (isbn.length === 13) {
      const brasilApi = await fetchJson(`https://brasilapi.com.br/api/isbn/v1/${encodeURIComponent(isbn)}`);
      if (brasilApi?.title) {
        brasilBook = {
          title: brasilApi.title,
          subtitle: brasilApi.subtitle || "",
          author: Array.isArray(brasilApi.authors) ? brasilApi.authors.join(", ") : brasilApi.authors || "",
          publisher: brasilApi.publisher || "Editora não informada",
          year: brasilApi.year || "",
          pageCount: brasilApi.page_count || "",
          isbn: brasilApi.isbn || isbn,
          synopsis: brasilApi.synopsis || "Sinopse não disponível.",
          cover: secureCover(brasilApi.cover_url) || fallbackAmazonCover(isbn),
          source: "BrasilAPI",
        };
        if (brasilBook.cover) return brasilBook;
      }
    }

    const googleQuery = isbn ? `isbn:${isbn}` : query;
    const googleUrl = `https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({ q: googleQuery, maxResults: "1", printType: "books" })}`;
    const google = await fetchJson(googleUrl);
    const googleBook = bookFromGoogle(google?.items?.[0]);
    if (googleBook) {
      if (!brasilBook) return googleBook;
      return {
        ...googleBook,
        ...brasilBook,
        cover: secureCover(brasilBook.cover) || googleBook.cover || fallbackAmazonCover(isbn),
        synopsis: brasilBook.synopsis !== "Sinopse não disponível." ? brasilBook.synopsis : googleBook.synopsis,
      };
    }

    if (isbn) {
      const openLibraryUrl = `https://openlibrary.org/api/books?${new URLSearchParams({ bibkeys: `ISBN:${isbn}`, format: "json", jscmd: "data" })}`;
      const openLibrary = await fetchJson(openLibraryUrl);
      const record = openLibrary?.[`ISBN:${isbn}`];
      if (record?.title) {
        return {
          title: record.title,
          subtitle: "",
          author: (record.authors || []).map((author) => author.name).join(", "),
          publisher: (record.publishers || []).map((publisher) => publisher.name).join(", ") || "Editora não informada",
          year: record.publish_date || "",
          pageCount: record.number_of_pages || "",
          isbn,
          synopsis: typeof record.notes === "string" ? record.notes : "Sinopse não disponível.",
          cover: secureCover(record.cover?.large || record.cover?.medium),
          source: "Open Library",
        };
      }
    }

    if (brasilBook && !brasilBook.cover) {
      brasilBook.cover = fallbackAmazonCover(isbn);
    }
    return brasilBook;
  }

  function findCatalogBook(title, author) {
    const matchingTitle = books.filter((book) => normalize(book.title) === normalize(title));
    return matchingTitle.find((book) => normalize(book.author) === normalize(author)) || matchingTitle[0] || null;
  }

  function createSearchIcon(root) {
    const existingIcon = root.querySelector(".search-top svg, .search-field > svg");
    if (existingIcon) return existingIcon.cloneNode(true);

    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "18");
    icon.setAttribute("height", "18");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");

    const lens = document.createElementNS(namespace, "circle");
    lens.setAttribute("cx", "11");
    lens.setAttribute("cy", "11");
    lens.setAttribute("r", "7");
    const handle = document.createElementNS(namespace, "path");
    handle.setAttribute("d", "m20 20-4-4");
    icon.append(lens, handle);
    return icon;
  }

  function addAmazonButton(modal) {
    const title = modal.querySelector("#book-detail-title")?.textContent?.trim();
    if (!title) return;
    const author = modal.querySelector(".book-detail-author")?.textContent?.trim() || "";
    const book = findCatalogBook(title, author);
    if (!book) return;

    const key = `${book.id || book.title}|${book.author || ""}`;
    let panel = modal.querySelector(".catalog-buy-panel");
    if (panel?.dataset.bookKey === key) return;
    if (panel) panel.remove();

    panel = document.createElement("section");
    panel.className = "catalog-buy-panel";
    panel.dataset.bookKey = key;

    const label = document.createElement("p");
    label.textContent = "Disponível para compra";

    const link = document.createElement("a");
    link.href = amazonUrl(book);
    link.target = "_blank";
    link.rel = "noopener sponsored";
    link.textContent = "Adquira este livro";
    link.setAttribute("aria-label", `Adquira ${book.title} na Amazon`);

    panel.append(label, link);
    modal.append(panel);
  }

  function showExternalResult(book, query, message = "") {
    document.querySelector(".catalog-isbn-result-backdrop")?.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "catalog-isbn-result-backdrop";
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) backdrop.remove();
    });

    const modal = document.createElement("section");
    modal.className = "book-detail-modal catalog-isbn-result-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "catalog-isbn-result-title");

    const header = document.createElement("header");
    header.className = "book-detail-header catalog-isbn-result-header";
    const heading = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "catalog-isbn-eyebrow";
    eyebrow.textContent = book?.source || "Busca de livros";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "catalog-isbn-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Fechar resultado da busca");
    close.addEventListener("click", () => backdrop.remove());
    heading.append(eyebrow);
    header.append(heading, close);
    modal.append(header);

    if (book) {
      const content = document.createElement("div");
      content.className = "book-detail-content catalog-isbn-result-content";
      const coverWrap = document.createElement("div");
      coverWrap.className = "book-detail-cover-wrap catalog-isbn-cover-wrap";
      const cover = document.createElement("img");
      const safeCover = secureCover(book.cover);
      if (safeCover) cover.src = safeCover;
      cover.className = "catalog-isbn-cover";
      cover.alt = `Capa de ${book.title}`;
      cover.loading = "lazy";
      if (!safeCover) {
        coverWrap.classList.add("has-no-cover");
        coverWrap.setAttribute("role", "img");
        coverWrap.setAttribute("aria-label", `Capa de ${book.title} indisponível`);
        const placeholder = document.createElement("span");
        placeholder.className = "catalog-isbn-cover-placeholder";
        placeholder.textContent = "Capa indisponível";
        coverWrap.append(placeholder);
      } else {
        cover.addEventListener("error", () => {
          cover.remove();
          coverWrap.classList.add("has-no-cover");
          coverWrap.setAttribute("role", "img");
          coverWrap.setAttribute("aria-label", `Capa de ${book.title} indisponível`);
          const placeholder = document.createElement("span");
          placeholder.className = "catalog-isbn-cover-placeholder";
          placeholder.textContent = "Capa indisponível";
          coverWrap.append(placeholder);
        }, { once: true });
        coverWrap.append(cover);
      }

      const details = document.createElement("div");
      details.className = "book-detail-main catalog-isbn-result-main";
      const title = document.createElement("h2");
      title.id = "catalog-isbn-result-title";
      title.textContent = book.title;
      const subtitle = document.createElement("p");
      subtitle.className = "catalog-isbn-subtitle";
      subtitle.textContent = book.subtitle || "";
      subtitle.hidden = !book.subtitle;
      const author = document.createElement("p");
      author.className = "book-detail-author";
      author.textContent = book.author || "Autor não informado";

      const facts = document.createElement("dl");
      facts.className = "book-detail-facts catalog-isbn-facts";
      const factValues = [
        ["Editora", book.publisher],
        ["Ano", book.year],
        ["Páginas", book.pageCount ? `${book.pageCount} páginas` : ""],
      ];
      for (const [label, value] of factValues) {
        if (!value) continue;
        const item = document.createElement("div");
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = value;
        item.append(term, description);
        facts.append(item);
      }

      details.append(title, subtitle, author, facts);
      content.append(coverWrap, details);

      const synopsisSection = document.createElement("section");
      synopsisSection.className = "book-detail-comment catalog-isbn-synopsis";
      const synopsisTitle = document.createElement("h3");
      synopsisTitle.textContent = "Sinopse";
      const synopsis = document.createElement("p");
      synopsis.textContent = book.synopsis || "Sinopse não disponível.";
      synopsisSection.append(synopsisTitle, synopsis);
      modal.append(content, synopsisSection);

      const buyPanel = document.createElement("section");
      buyPanel.className = "catalog-buy-panel catalog-isbn-buy-panel";
      const buyLabel = document.createElement("p");
      buyLabel.textContent = "Disponível para compra";
      const buy = document.createElement("a");
      buy.className = "catalog-isbn-buy";
      buy.href = amazonUrl(book);
      buy.target = "_blank";
      buy.rel = "noopener sponsored";
      buy.textContent = "Adquira este livro";
      buyPanel.append(buyLabel, buy);
      modal.append(buyPanel);
    } else {
      const title = document.createElement("h2");
      title.id = "catalog-isbn-result-title";
      title.className = "catalog-isbn-empty-title";
      title.textContent = message.startsWith("Consultando") ? "Consultando catálogos…" : "Livro não encontrado";
      header.querySelector("div").append(title);
      const empty = document.createElement("p");
      empty.className = "catalog-isbn-empty";
      empty.textContent = message || `Não encontrei “${query}” no acervo nem nos catálogos consultados.`;
      modal.append(empty);
    }

    backdrop.append(modal);
    document.body.append(backdrop);
    close.focus();
  }

  async function searchFromCatalog(input) {
    const query = input.value.trim();
    if (!query) return;
    const currentSearch = ++searchSequence;

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const firstLocalResult = document.querySelector(".book-grid .book-card .book-title-link");
    if (firstLocalResult) {
      firstLocalResult.click();
      return;
    }

    const isbn = cleanIsbn(query);
    const isIsbn = /^(?:\d{9}[\dX]|\d{13})$/.test(isbn);
    showExternalResult(null, query, "Consultando catálogos de livros...");
    const result = await searchExternal(query, isIsbn ? isbn : "");
    if (currentSearch !== searchSequence) return;
    showExternalResult(result, query);
  }

  function installSearch(root) {
    const input = root.querySelector(searchInputSelector);
    const tools = input?.closest(".catalog-tools");
    if (!input || !tools) return;

    if (input.dataset.catalogSearchReady !== "true") {
      input.dataset.catalogSearchReady = "true";
      input.placeholder = "Buscar no acervo ou consultar ISBN/título…";
      input.setAttribute("aria-label", "Buscar livro no acervo ou nos catálogos externos");
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        tools.querySelector(".catalog-search-action")?.click();
      });
    }

    let button = tools.querySelector(".catalog-search-action");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "icon-button catalog-search-action";
      button.setAttribute("aria-label", "Pesquisar");
      button.title = "Pesquisar";
      button.append(createSearchIcon(root));
      button.addEventListener("click", () => searchFromCatalog(input));
    }

    const filterButton = tools.querySelector(".filter-trigger");
    if (filterButton && button.previousElementSibling !== filterButton) {
      filterButton.insertAdjacentElement("afterend", button);
    } else if (!filterButton && button.parentElement !== tools) {
      tools.append(button);
    }
  }

  async function loadBooks() {
    try {
      const response = await fetch("./api.php", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      books = Array.isArray(data.books) ? data.books : [];
    } catch {
      books = [];
    }
  }

  function start() {
    const root = document.querySelector("#root");
    if (!root) return;

    const enhance = () => {
      installSearch(root);
      const modal = root.querySelector(".book-detail-modal");
      if (modal) addAmazonButton(modal);
    };

    const observer = new MutationObserver(enhance);
    observer.observe(root, { childList: true, subtree: true });
    enhance();
    loadBooks().then(enhance);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") document.querySelector(".catalog-isbn-result-backdrop")?.remove();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();