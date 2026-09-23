(function () {
  "use strict";

  var state = {
    products: [],
    category: "Todos",
    query: "",
    visible: 12
  };

  var categoryMeta = {
    "Organização": { icon: "▦", label: "Organização" },
    "Cozinha": { icon: "◌", label: "Cozinha" },
    "Limpeza": { icon: "✦", label: "Limpeza" },
    "Banheiro": { icon: "♢", label: "Banheiro" },
    "Decoração": { icon: "♡", label: "Decoração" },
    "Quarto": { icon: "▤", label: "Quarto" },
    "Lavanderia": { icon: "⌁", label: "Lavanderia" },
    "Iluminação": { icon: "☼", label: "Iluminação" },
    "Utilidades": { icon: "◇", label: "Utilidades" },
    "Jardim": { icon: "♧", label: "Jardim" },
    "Móveis": { icon: "▥", label: "Móveis" }
  };

  var featuredIds = [
    "MLB69117085",
    "MLB37018827",
    "MLB30428193",
    "MLB47077308",
    "MLB43838440",
    "MLB34293390",
    "MLB65423753",
    "MLB29761786"
  ];

  function normalize(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function cleanTitle(title) {
    return String(title || "")
      .replace(/\bOrganizador Casa\b/gi, "")
      .replace(/\bUtilidades Cozinha\b/gi, "")
      .replace(/\bLimpeza Casa\b/gi, "")
      .replace(/\bDecoração Casa\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[-–—, ]+|[-–—, ]+$/g, "")
      .trim();
  }

  function filteredProducts() {
    var q = normalize(state.query);

    return state.products
      .filter(function (product) {
        var categoryMatch = state.category === "Todos" || product.categoria === state.category;
        var text = normalize([product.nome, product.marca, product.categoria].join(" "));
        var searchMatch = !q || text.indexOf(q) !== -1;
        return categoryMatch && searchMatch;
      })
      .sort(function (a, b) {
        if (Boolean(a.affiliateUrl) !== Boolean(b.affiliateUrl)) {
          return a.affiliateUrl ? -1 : 1;
        }

        var ai = featuredIds.indexOf(a.id);
        var bi = featuredIds.indexOf(b.id);
        if (ai !== -1 && bi === -1) return -1;
        if (ai === -1 && bi !== -1) return 1;
        if (ai !== -1 && bi !== -1) return ai - bi;
        return cleanTitle(a.nome).localeCompare(cleanTitle(b.nome), "pt-BR");
      });
  }

  function productCard(product) {
    var article = document.createElement("article");
    article.className = "product-card";

    var media = document.createElement("div");
    media.className = "product-media";

    var img = document.createElement("img");
    img.src = product.imagem;
    img.alt = cleanTitle(product.nome);
    img.loading = "lazy";
    img.decoding = "async";
    media.appendChild(img);

    var market = document.createElement("span");
    market.className = "market-badge";
    market.textContent = product.marketplace || "Mercado Livre";
    media.appendChild(market);

    var cat = document.createElement("span");
    cat.className = "category-badge";
    cat.textContent = product.categoria;
    media.appendChild(cat);

    var body = document.createElement("div");
    body.className = "product-body";

    var brand = document.createElement("div");
    brand.className = "product-brand";
    brand.textContent = product.marca || "Achadinho selecionado";
    body.appendChild(brand);

    var title = document.createElement("h3");
    title.className = "product-title";
    title.textContent = cleanTitle(product.nome);
    body.appendChild(title);

    var meta = document.createElement("div");
    meta.className = "product-meta";

    var code = document.createElement("span");
    code.className = "product-code";
    code.textContent = product.id;
    meta.appendChild(code);

    if (product.affiliateUrl) {
      var link = document.createElement("a");
      link.className = "product-link";
      link.href = product.affiliateUrl;
      link.target = "_blank";
      link.rel = "noopener sponsored";
      link.textContent = "Ver oferta";
      meta.appendChild(link);
    } else {
      var disabled = document.createElement("span");
      disabled.className = "product-link-disabled";
      disabled.textContent = "Link em configuração";
      disabled.title = "O link de afiliado ainda será adicionado.";
      meta.appendChild(disabled);
    }

    body.appendChild(meta);
    article.appendChild(media);
    article.appendChild(body);
    return article;
  }

  function renderProducts() {
    var grid = document.getElementById("productGrid");
    var empty = document.getElementById("emptyState");
    var loadMore = document.getElementById("loadMoreBtn");
    var label = document.getElementById("resultLabel");

    var products = filteredProducts();
    var visible = products.slice(0, state.visible);

    grid.innerHTML = "";
    visible.forEach(function (product) {
      grid.appendChild(productCard(product));
    });

    empty.hidden = products.length !== 0;
    loadMore.hidden = products.length <= state.visible;

    var suffix = state.category === "Todos" ? " no catálogo" : " em " + state.category;
    label.textContent = products.length + (products.length === 1 ? " produto" : " produtos") + suffix;
  }

  function setCategory(category) {
    state.category = category;
    state.visible = 12;

    document.querySelectorAll(".filter-chip").forEach(function (button) {
      button.classList.toggle("active", button.dataset.category === category);
    });

    renderProducts();
    document.getElementById("achadinhos").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderFilters() {
    var chips = document.getElementById("filterChips");
    chips.innerHTML = "";

    var available = Object.keys(categoryMeta).filter(function (category) {
      return state.products.some(function (product) {
        return product.categoria === category;
      });
    });

    ["Todos"].concat(available).forEach(function (category) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "filter-chip" + (category === state.category ? " active" : "");
      button.dataset.category = category;
      button.textContent = category;
      button.addEventListener("click", function () {
        setCategory(category);
      });
      chips.appendChild(button);
    });
  }

  function renderCategories() {
    var grid = document.getElementById("categoryCards");
    grid.innerHTML = "";

    Object.keys(categoryMeta).forEach(function (category) {
      var count = state.products.filter(function (product) {
        return product.categoria === category;
      }).length;

      if (!count) return;

      var button = document.createElement("button");
      button.type = "button";
      button.className = "category-card";
      button.setAttribute("aria-label", "Ver " + category);

      var icon = document.createElement("span");
      icon.className = "category-icon";
      icon.textContent = categoryMeta[category].icon;

      var name = document.createElement("strong");
      name.textContent = categoryMeta[category].label;

      var total = document.createElement("small");
      total.textContent = count + " achadinhos";

      button.appendChild(icon);
      button.appendChild(name);
      button.appendChild(total);
      button.addEventListener("click", function () {
        setCategory(category);
      });

      grid.appendChild(button);
    });
  }

  function updatePreviewNotice() {
    var missing = state.products.some(function (product) {
      return !product.affiliateUrl;
    });

    document.getElementById("previewNotice").hidden = !missing;
  }

  function initEvents() {
    document.getElementById("searchInput").addEventListener("input", function (event) {
      state.query = event.target.value;
      state.visible = 12;
      renderProducts();
    });

    document.getElementById("loadMoreBtn").addEventListener("click", function () {
      state.visible += 12;
      renderProducts();
    });
  }

  function showError() {
    document.getElementById("resultLabel").textContent = "Não foi possível carregar o catálogo.";
    document.getElementById("emptyState").hidden = false;
    document.getElementById("emptyState").querySelector("h3").textContent = "Catálogo indisponível";
    document.getElementById("emptyState").querySelector("p").textContent = "Atualize a página em alguns instantes.";
  }

  fetch("/data/products.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("Falha ao carregar catálogo");
      return response.json();
    })
    .then(function (data) {
      var allProducts = Array.isArray(data.produtos) ? data.produtos : [];
      state.products = allProducts.filter(function (product) {
        return Boolean(product.affiliateUrl);
      });
      document.getElementById("heroProductCount").textContent = state.products.length;
      var uniqueCategories = new Set(state.products.map(function (product) {
        return product.categoria;
      }).filter(Boolean));
      document.getElementById("heroCategoryCount").textContent = uniqueCategories.size;
      document.getElementById("year").textContent = new Date().getFullYear();
      renderCategories();
      renderFilters();
      renderProducts();
      updatePreviewNotice();
      initEvents();
    })
    .catch(function () {
      document.getElementById("year").textContent = new Date().getFullYear();
      showError();
    });
})();