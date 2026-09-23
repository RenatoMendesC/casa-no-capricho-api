(function () {
  "use strict";

  var ML_PRICE_API = "https://casa-no-capricho.onrender.com/api/catalogo/precos";

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

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") return "";
    var number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function chunkArray(items, size) {
    var chunks = [];
    for (var i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  async function hydrateMercadoLivrePrices(targetProducts) {
    var source = Array.isArray(targetProducts) ? targetProducts : [];
    var missing = source.filter(function (product) {
      return product.marketplace === "Mercado Livre" &&
        (product.preco === null || product.preco === undefined) &&
        !product.precoCarregando &&
        !product.precoConsultado;
    });

    if (!missing.length) return;

    missing.forEach(function (product) {
      product.precoCarregando = true;
    });

    var byId = new Map(state.products.map(function (product) {
      return [product.id, product];
    }));

    var chunks = chunkArray(missing.map(function (product) { return product.id; }), 10);

    for (var i = 0; i < chunks.length; i++) {
      try {
        var response = await fetch(
          ML_PRICE_API + "?ids=" + encodeURIComponent(chunks[i].join(",")),
          { cache: "no-store" }
        );

        if (!response.ok) {
          chunks[i].forEach(function (id) {
            var failed = byId.get(id);
            if (failed) {
              failed.precoCarregando = false;
              failed.precoConsultado = true;
            }
          });
          continue;
        }

        var data = await response.json();
        (data.produtos || []).forEach(function (priceData) {
          var product = byId.get(priceData.id);
          if (!product) return;

          product.precoCarregando = false;
          product.precoConsultado = true;

          if (priceData.preco !== null && priceData.preco !== undefined) {
            product.preco = Number(priceData.preco);
            product.moeda = priceData.moeda || "BRL";
            product.itemId = priceData.itemId || product.itemId || null;
          }
        });

        renderProducts(false);
      } catch (error) {
        chunks[i].forEach(function (id) {
          var failed = byId.get(id);
          if (failed) {
            failed.precoCarregando = false;
            failed.precoConsultado = true;
          }
        });
      }
    }

    renderProducts(false);
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
    article.tabIndex = 0;
    article.setAttribute("role", "link");
    article.setAttribute("aria-label", "Abrir oferta: " + cleanTitle(product.nome));

    function abrirOferta() {
      var opened = window.open(product.affiliateUrl, "_blank", "noopener");
      if (!opened) window.location.href = product.affiliateUrl;
    }

    article.addEventListener("click", function (event) {
      if (event.target.closest("a, button")) return;
      abrirOferta();
    });

    article.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        abrirOferta();
      }
    });

    var media = document.createElement("div");
    media.className = "product-media";

    if (product.imagem) {
      var img = document.createElement("img");
      img.src = product.imagem;
      img.alt = cleanTitle(product.nome);
      img.loading = "lazy";
      img.decoding = "async";
      media.appendChild(img);
    } else {
      var placeholder = document.createElement("div");
      placeholder.className = "product-placeholder" + (product.marketplace === "Shopee" ? " shopee-placeholder" : "");
      var placeholderIcon = document.createElement("span");
      placeholderIcon.className = "placeholder-icon";
      placeholderIcon.textContent = categoryMeta[product.categoria] || "⌂";
      var placeholderTitle = document.createElement("strong");
      placeholderTitle.textContent = product.categoria || "Casa";
      var placeholderText = document.createElement("small");
      placeholderText.textContent = product.marketplace === "Shopee" ? "Achadinho Shopee" : "Achadinho selecionado";
      placeholder.appendChild(placeholderIcon);
      placeholder.appendChild(placeholderTitle);
      placeholder.appendChild(placeholderText);
      media.appendChild(placeholder);
    }

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

    var offer = document.createElement("div");
    offer.className = "product-offer";
    var priceText = formatPrice(product.preco);
    if (priceText) {
      var price = document.createElement("strong");
      price.className = "product-price";
      price.textContent = priceText;
      offer.appendChild(price);
    } else if (marketplace === "Mercado Livre") {
      var priceStatus = document.createElement("span");
      priceStatus.className = "product-price-status";
      priceStatus.textContent = product.precoConsultado ? "Confira o preço atual" : "Consultando preço...";
      offer.appendChild(priceStatus);
    }
    if (product.vendas) {
      var sales = document.createElement("span");
      sales.className = "product-sales";
      sales.textContent = product.vendas + " vendidos";
      offer.appendChild(sales);
    }

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
    link.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    meta.appendChild(code);
    meta.appendChild(link);
    body.appendChild(brand);
    body.appendChild(title);
    if (offer.childNodes.length) body.appendChild(offer);
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

  function renderProducts(loadPrices) {
    if (loadPrices === undefined) loadPrices = true;
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

    if (loadPrices) {
      var visibleProducts = products.slice(0, state.visible);
      window.setTimeout(function () {
        hydrateMercadoLivrePrices(visibleProducts);
      }, 0);
    }
  }

  function setMarketplace(marketplace) {
    state.marketplace = marketplace;
    state.category = "Todos";
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

  var shopeeShardUrls = Array.from({ length: 10 }, function (_, index) {
    return "/data/shopee/shard-" + String(index + 1).padStart(2, "0") + ".json";
  });

  var shopeeExtraChunkUrls = Array.from({ length: 16 }, function (_, index) {
    return "/data/shopee/add1000-" + String(index + 1).padStart(2, "0") + ".txt";
  });

  async function loadShopeeExtra1000() {
    if (typeof DecompressionStream === "undefined") return [];

    var parts = await Promise.all(shopeeExtraChunkUrls.map(function (url) {
      return fetch(url, { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("Falha ao carregar lote extra Shopee");
        return response.text();
      });
    }));

    var base64 = parts.join("");
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);

    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    var text = await new Response(stream).text();
    var compact = JSON.parse(text);
    var categories = Array.isArray(compact.c) ? compact.c : [];

    return (Array.isArray(compact.p) ? compact.p : []).map(function (row) {
      var id = String(row[0]);
      var seller = String(row[1]);
      var title = row[2];
      var imageSuffix = row[3];
      var category = categories[row[4]] || "Utilidades";
      var price = Number(row[5]);
      var imageUrl = "https://cf.shopee.com.br/file/" + imageSuffix;

      return {
        id: id,
        nome: title,
        marca: "Shopee",
        imagem: imageUrl,
        imagens: [imageUrl],
        categoria: category,
        marketplace: "Shopee",
        affiliateUrl: "https://shope.ee/an_redir?origin_link=https%3A%2F%2Fshopee.com.br%2Fproduct%2F" + seller + "%2F" + id,
        productUrl: "https://shopee.com.br/product/" + seller + "/" + id,
        affiliateStatus: "approved",
        preco: price,
        moeda: "BRL",
        origemSelecao: "SHOPEE_DATAFEED_OFICIAL"
      };
    });
  }

  Promise.all([
    fetch("/data/products.json", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("Falha ao carregar Mercado Livre");
      return response.json();
    }),
    Promise.all(shopeeShardUrls.map(function (url) {
      return fetch(url, { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("Falha ao carregar lote Shopee");
          return response.json();
        });
    })),
    loadShopeeExtra1000().catch(function () { return []; })
  ])
    .then(function (catalogs) {
      var ml = Array.isArray(catalogs[0].produtos) ? catalogs[0].produtos : [];
      var shopeeBase = catalogs[1].reduce(function (all, shard) {
        return all.concat(Array.isArray(shard.produtos) ? shard.produtos : []);
      }, []);
      var shopeeExtra = Array.isArray(catalogs[2]) ? catalogs[2] : [];
      var shopee = shopeeBase.concat(shopeeExtra);
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