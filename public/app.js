(function () {
  "use strict";

  var state = {
    products: [],
    category: "Todos",
    marketplace: "Todos",
    query: "",
    visible: 16
  };

  var categoryMeta = {
    "Organização": "▦",
    "Cozinha": "◌",
    "Limpeza": "✦",
    "Banheiro": "♢",
    "Decoração": "♡",
    "Quarto": "▤",
    "Lavanderia": "⌁",
    "Iluminação": "☼",
    "Utilidades": "◇",
    "Jardim": "♧",
    "Móveis": "▥"
  };

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

    return state.products.filter(function (product) {
      var categoryMatch = state.category === "Todos" || product.categoria === state.category;
      var marketplaceMatch = state.marketplace === "Todos" || product.marketplace === state.marketplace;
      var text = normalize([product.nome, product.marca, product.categoria, product.marketplace].join(" "));
      var searchMatch = !q || text.indexOf(q) !== -1;
      return categoryMatch && marketplaceMatch && searchMatch;
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

    var marketplace = product.marketplace || "Mercado Livre";
    var market = document.createElement("span");
    market.className = "market-badge " + (marketplace === "Shopee" ? "market-shopee" : "market-ml");
    market.textContent = marketplace;
    media.appendChild(market);

    var category = document.createElement("span");
    category.className = "category-badge";
    category.textContent = product.categoria || "Casa";
    media.appendChild(category);

    var body = document.createElement("div");
    body.className = "product-body";

    var brand = document.createElement("div");
    brand.className = "product-brand";
    brand.textContent = product.marca || "Achadinho selecionado";

    var title = document.createElement("h3");
    title.className = "product-title";
    title.textContent = cleanTitle(product.nome);

    var meta = document.createElement("div");
    meta.className = "product-meta";

    var code = document.createElement("span");
    code.className = "product-code";
    code.textContent = product.id || marketplace;

    var link = document.createElement("a");
    link.className = "product-link" + (marketplace === "Shopee" ? " shopee-link" : "");
    link.href = product.affiliateUrl;
    link.target = "_blank";
    link.rel = "noopener sponsored";
    link.textContent = "Ver oferta";

    meta.appendChild(code);
    meta.appendChild(link);
    body.appendChild(brand);
    body.appendChild(title);
    body.appendChild(meta);
    article.appendChild(media);
    article.appendChild(body);

    return article;
  }

  function updateActiveUI() {
    document.querySelectorAll("[data-marketplace]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.marketplace === state.marketplace);
    });

    document.querySelectorAll("[data-category]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.category === state.category);
    });

    var title = document.getElementById("catalogTitle");
    title.textContent = state.marketplace === "Todos" ? "Todos os produtos" : state.marketplace;

    var activeCategory = document.getElementById("activeCategoryBtn");
    activeCategory.textContent = state.category === "Todos" ? "Todas as categorias" : state.category;

    document.getElementById("clearFiltersBtn").hidden =
      state.marketplace === "Todos" && state.category === "Todos" && !state.query;
  }

  function renderProducts() {
    var products = filteredProducts();
    var grid = document.getElementById("productGrid");
    var empty = document.getElementById("emptyState");
    var loadMore = document.getElementById("loadMoreBtn");

    grid.innerHTML = "";
    products.slice(0, state.visible).forEach(function (product) {
      grid.appendChild(productCard(product));
    });

    var marketplaceText = state.marketplace === "Todos" ? "" : " · " + state.marketplace;
    document.getElementById("resultLabel").textContent =
      products.length + (products.length === 1 ? " produto" : " produtos") + marketplaceText;

    empty.hidden = products.length !== 0;
    loadMore.hidden = products.length <= state.visible;

    if (!products.length) {
      var p = empty.querySelector("p");
      if (state.marketplace === "Shopee") {
        p.textContent = "Os produtos da Shopee serão adicionados aqui conforme os lotes forem importados.";
      } else {
        p.textContent = "Tente outro termo ou escolha outra categoria.";
      }
    }

    updateActiveUI();
  }

  function setMarketplace(marketplace) {
    state.marketplace = marketplace;
    state.visible = 16;
    renderSidebarCategories();
    renderProducts();

    if (window.innerWidth <= 800) document.body.classList.remove("sidebar-open");
  }

  function setCategory(category) {
    state.category = category;
    state.visible = 16;
    renderProducts();

    if (window.innerWidth <= 800) document.body.classList.remove("sidebar-open");
  }

  function renderSidebarCategories() {
    var wrap = document.getElementById("sidebarCategories");
    wrap.innerHTML = "";

    Object.keys(categoryMeta).forEach(function (category) {
      var count = state.products.filter(function (product) {
        var marketplaceMatch = state.marketplace === "Todos" || product.marketplace === state.marketplace;
        return marketplaceMatch && product.categoria === category;
      }).length;

      if (!count) return;

      var button = document.createElement("button");
      button.type = "button";
      button.className = "nav-item category-nav";
      button.dataset.category = category;
      button.innerHTML =
        '<span class="nav-icon">' + categoryMeta[category] + '</span>' +
        '<span class="nav-text">' + category + '</span>' +
        '<span class="nav-count">' + count + '</span>';
      button.addEventListener("click", function () {
        setCategory(category);
      });
      wrap.appendChild(button);
    });
  }

  function updateCounts() {
    var ml = state.products.filter(function (p) { return p.marketplace === "Mercado Livre"; }).length;
    var shopee = state.products.filter(function (p) { return p.marketplace === "Shopee"; }).length;
    var categories = new Set(state.products.map(function (p) { return p.categoria; }).filter(Boolean));

    document.getElementById("allCount").textContent = state.products.length;
    document.getElementById("mlCount").textContent = ml;
    document.getElementById("shopeeCount").textContent = shopee;
    document.getElementById("heroProductCount").textContent = state.products.length;
    document.getElementById("heroCategoryCount").textContent = categories.size;
  }

  function initEvents() {
    document.querySelectorAll("[data-marketplace]").forEach(function (button) {
      button.addEventListener("click", function () {
        setMarketplace(button.dataset.marketplace);
      });
    });

    document.getElementById("activeCategoryBtn").addEventListener("click", function () {
      setCategory("Todos");
    });

    document.getElementById("clearFiltersBtn").addEventListener("click", function () {
      state.category = "Todos";
      state.marketplace = "Todos";
      state.query = "";
      state.visible = 16;
      document.getElementById("searchInput").value = "";
      renderSidebarCategories();
      renderProducts();
    });

    document.getElementById("searchInput").addEventListener("input", function (event) {
      state.query = event.target.value;
      state.visible = 16;
      renderProducts();
    });

    document.getElementById("loadMoreBtn").addEventListener("click", function () {
      state.visible += 16;
      renderProducts();
    });

    document.getElementById("collapseSidebar").addEventListener("click", function () {
      document.body.classList.toggle("sidebar-collapsed");
      localStorage.setItem("cnc-sidebar-collapsed", document.body.classList.contains("sidebar-collapsed") ? "1" : "0");
    });

    document.getElementById("mobileMenuBtn").addEventListener("click", function () {
      document.body.classList.add("sidebar-open");
    });

    document.getElementById("sidebarOverlay").addEventListener("click", function () {
      document.body.classList.remove("sidebar-open");
    });
  }

  function loadSidebarPreference() {
    if (localStorage.getItem("cnc-sidebar-collapsed") === "1" && window.innerWidth > 800) {
      document.body.classList.add("sidebar-collapsed");
    }
  }

  function showError() {
    document.getElementById("resultLabel").textContent = "Não foi possível carregar o catálogo.";
    var empty = document.getElementById("emptyState");
    empty.hidden = false;
    empty.querySelector("h3").textContent = "Catálogo indisponível";
    empty.querySelector("p").textContent = "Atualize a página em alguns instantes.";
  }

  Promise.all([
    fetch("/data/products.json", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("Falha ao carregar Mercado Livre");
      return response.json();
    }),
    fetch("/data/shopee-products.json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) return { produtos: [] };
        return response.json();
      })
      .catch(function () { return { produtos: [] }; })
  ])
    .then(function (catalogs) {
      var ml = Array.isArray(catalogs[0].produtos) ? catalogs[0].produtos : [];
      var shopee = Array.isArray(catalogs[1].produtos) ? catalogs[1].produtos : [];
      var seen = new Set();

      state.products = ml.concat(shopee)
        .filter(function (product) { return Boolean(product.affiliateUrl); })
        .filter(function (product) {
          var key = (product.marketplace || "Mercado Livre") + ":" + product.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      document.getElementById("year").textContent = new Date().getFullYear();
      updateCounts();
      renderSidebarCategories();
      loadSidebarPreference();
      initEvents();
      renderProducts();
    })
    .catch(function () {
      document.getElementById("year").textContent = new Date().getFullYear();
      initEvents();
      showError();
    });
})();