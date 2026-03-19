import axios from "axios";
import FormData from "form-data";

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function scoreNameCandidate(search, product) {
  const q = normalizeText(search);
  const name = normalizeText(product?.name || "");
  const sku = normalizeText(product?.sku || "");

  if (!q || !name) return 0;
  if (name === q) return 1000;

  let score = 0;

  if (name.startsWith(q)) score += 400;
  if (name.includes(q)) score += 250;
  if (sku && sku.includes(q)) score += 80;

  const qTokens = tokenizeText(search).filter((t) => t.length >= 2);
  const nameTokens = tokenizeText(product?.name || "");

  let matchedTokens = 0;
  for (const token of qTokens) {
    if (name.includes(token) || nameTokens.includes(token)) {
      matchedTokens += 1;
      score += 70;
    }
  }

  if (qTokens.length > 0 && matchedTokens === qTokens.length) {
    score += 150;
  }

  const lengthDiff = Math.abs(name.length - q.length);
  score -= Math.min(lengthDiff, 40);

  return score;
}

function scoreSkuCandidate(search, product) {
  const q = normalizeText(search);
  const sku = normalizeText(product?.sku || "");
  const name = normalizeText(product?.name || "");

  if (!q) return 0;
  if (sku === q) return 1000;

  let score = 0;

  if (sku.startsWith(q)) score += 500;
  if (sku.includes(q)) score += 300;
  if (name.includes(q)) score += 80;

  const qTokens = tokenizeText(search).filter((t) => t.length >= 2);
  for (const token of qTokens) {
    if (sku.includes(token)) score += 60;
    else if (name.includes(token)) score += 20;
  }

  const lengthDiff = Math.abs(sku.length - q.length);
  score -= Math.min(lengthDiff, 40);

  return score;
}

function getMetaValue(metaData, key) {
  if (!Array.isArray(metaData)) return "";

  const found = metaData.find(
    (item) => String(item?.key || "").trim() === String(key || "").trim()
  );

  return found?.value != null ? String(found.value).trim() : "";
}

function mapProductForEdit(product) {
  const hasSale =
    product?.sale_price &&
    product.sale_price !== "" &&
    product.sale_price !== product.regular_price;

  const regular_price =
    product?.regular_price && product.regular_price !== ""
      ? product.regular_price
      : product?.price || "";

  const sale_price = hasSale ? product.sale_price : "";

  const cash_price_general =
    getMetaValue(product?.meta_data, "_precio_efectivo_general") ||
    getMetaValue(product?.meta_data, "_precio_efectivo");

  return {
    id: product?.id,
    name: product?.name || "",
    sku: product?.sku || "",
    type: product?.type || "",
    regular_price,
    sale_price,
    price: product?.price || "",
    cash_price_general,
  };
}

function buildAuthHeader(consumerKey, consumerSecret) {
  const token = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  return {
    Authorization: `Basic ${token}`,
  };
}

function buildWooConfig(consumerKey, consumerSecret, extra = {}) {
  return {
    ...extra,
    params: {
      ...(extra.params || {}),
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    },
    headers: {
      ...(extra.headers || {}),
    },
  };
}
async function fetchAllVariableProducts(baseUrl, consumerKey, consumerSecret) {
  const products = [];
  let page = 1;

  while (true) {
    const response = await axios.get(
      `${normalizeBaseUrl(baseUrl)}/products`,
      buildWooConfig(consumerKey, consumerSecret, {
        params: {
          type: "variable",
          per_page: 100,
          page,
        },
      })
    );

    const batch = Array.isArray(response.data) ? response.data : [];

    products.push(...batch);

    if (batch.length < 100) break;
    page += 1;
  }

  return products;
}

async function searchVariableProductsByName(baseUrl, consumerKey, consumerSecret, search) {
  const response = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products`,
    buildWooConfig(consumerKey, consumerSecret, {
      params: {
        type: "variable",
        search,
        per_page: 20,
      },
    })
  );

  return Array.isArray(response.data) ? response.data : [];
}

export async function findVariableProductWithVariations({
  baseUrl,
  consumerKey,
  consumerSecret,
  search,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!search) throw new Error("Falta search");

  const products = await searchVariableProductsByName(
    baseUrl,
    consumerKey,
    consumerSecret,
    search
  );

  if (!products.length) {
    return {
      ok: false,
      found: false,
      search,
      message: "No se encontraron productos variables con ese nombre.",
      candidates: [],
    };
  }

  const product = products[0];
  const variations = await fetchAllVariations(
    baseUrl,
    consumerKey,
    consumerSecret,
    product.id
  );

  return {
    ok: true,
    found: true,
    search,
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku ?? "",
      type: product.type ?? "",
    },
    variations: variations.map((variation) => ({
      variation_id: variation.id,
      sku: variation.sku ?? "",
      manage_stock: variation.manage_stock ?? null,
      stock_quantity: variation.stock_quantity ?? null,
      stock_status: variation.stock_status ?? null,
      attributes: Array.isArray(variation.attributes)
        ? variation.attributes.map((attr) => ({
            name: attr?.name ?? "",
            option: attr?.option ?? "",
          }))
        : [],
      attributes_text: formatAttributes(variation.attributes),
    })),
    candidates: products.slice(0, 5).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku ?? "",
      type: p.type ?? "",
    })),
  };
}

async function fetchAllVariations(baseUrl, consumerKey, consumerSecret, productId) {
  const variations = [];
  let page = 1;

  while (true) {
    const response = await axios.get(
      `${normalizeBaseUrl(baseUrl)}/products/${productId}/variations`,
      buildWooConfig(consumerKey, consumerSecret, {
        params: {
          per_page: 100,
          page,
        },
      })
    );

    const batch = Array.isArray(response.data) ? response.data : [];

    variations.push(...batch);

    if (batch.length < 100) break;
    page += 1;
  }

  return variations;
}

async function updateVariation(baseUrl, consumerKey, consumerSecret, productId, variationId, payload) {
  const response = await axios.put(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}/variations/${variationId}`,
    payload,
    buildWooConfig(consumerKey, consumerSecret, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  );

  return response.data;
}

async function updateProduct(baseUrl, consumerKey, consumerSecret, productId, payload) {
  const response = await axios.put(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    payload,
    buildWooConfig(consumerKey, consumerSecret, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  );

  return response.data;
}

async function createProduct(baseUrl, consumerKey, consumerSecret, payload) {
  const response = await axios.post(
  `${normalizeBaseUrl(baseUrl)}/products`,
  payload,
  {
    params: {
      consumer_key: consumerKey,
      consumer_secret: consumerSecret
    },
    headers: {
      "Content-Type": "application/json"
    }
  }
);

  return response.data;
}

export async function findProductBySku({
  baseUrl,
  consumerKey,
  consumerSecret,
  sku,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!sku) throw new Error("Falta sku");

  const cleanSku = String(sku).trim();
  const normalizedSku = normalizeText(cleanSku);

  const foundMap = new Map();

  const directResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products`,
    buildWooConfig(consumerKey, consumerSecret, {
      params: {
        sku: cleanSku,
        per_page: 100,
      },
    })
  );

  const directProducts = Array.isArray(directResponse.data) ? directResponse.data : [];
  for (const product of directProducts) {
    if (product?.id) foundMap.set(product.id, product);
  }

  const searchTerms = [
    cleanSku,
    ...cleanSku.split(/\s+/).map((x) => x.trim()).filter(Boolean),
  ];

  for (const term of searchTerms) {
    const searchResponse = await axios.get(
      `${normalizeBaseUrl(baseUrl)}/products`,
      buildWooConfig(consumerKey, consumerSecret, {
        params: {
          search: term,
          per_page: 100,
        },
      })
    );

    const searchProducts = Array.isArray(searchResponse.data) ? searchResponse.data : [];
    for (const product of searchProducts) {
      if (product?.id) foundMap.set(product.id, product);
    }

    if (foundMap.size >= 50) break;
  }

  const allProducts = Array.from(foundMap.values());

  const exact = allProducts.find(
    (product) => normalizeText(product?.sku || "") === normalizedSku
  );

  const candidates = allProducts
    .map((product) => ({
      ...product,
      __score: scoreSkuCandidate(cleanSku, product),
    }))
    .filter((product) => product.__score > 0)
    .sort((a, b) => b.__score - a.__score)
    .slice(0, 10)
    .map((product) => mapProductForEdit(product));

  return {
    ok: true,
    exists: Boolean(exact),
    product: exact ? mapProductForEdit(exact) : null,
    candidates: exact ? [] : candidates,
  };
}

export async function findProductsByName({
  baseUrl,
  consumerKey,
  consumerSecret,
  name,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!name) throw new Error("Falta name");

  const cleanName = String(name).trim();
  const normalizedFullName = normalizeText(cleanName);

  const terms = cleanName
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.length >= 2);

  const searchTerms = [cleanName, ...terms];
  const foundMap = new Map();

  for (const term of searchTerms) {
    const response = await axios.get(
      `${normalizeBaseUrl(baseUrl)}/products`,
      buildWooConfig(consumerKey, consumerSecret, {
        params: {
          search: term,
          per_page: 100,
        },
      })
    );

    const products = Array.isArray(response.data) ? response.data : [];

    for (const product of products) {
      if (!product?.id) continue;
      foundMap.set(product.id, product);
    }

    if (foundMap.size >= 50) break;
  }

  const allProducts = Array.from(foundMap.values());

  const exactMatches = allProducts.filter(
    (product) => normalizeText(product?.name || "") === normalizedFullName
  );

  const rankedCandidates = allProducts
    .map((product) => ({
      ...product,
      __score: scoreNameCandidate(cleanName, product),
    }))
    .filter((product) => product.__score > 0)
    .sort((a, b) => b.__score - a.__score)
    .slice(0, 10);

  return {
    ok: true,
    search: name,
    products: exactMatches.map(mapProductForEdit),
    candidates: exactMatches.length > 0 ? [] : rankedCandidates.map(mapProductForEdit),
  };
}

export async function deleteProductById({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");

  const response = await axios.delete(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret, {
      params: {
        force: false,
      },
    })
  );

  return {
    ok: true,
    deleted: true,
    product: {
      id: response.data?.id ?? productId,
      name: response.data?.name ?? "",
      sku: response.data?.sku ?? "",
      type: response.data?.type ?? "",
    },
  };
}


async function fetchAllGlobalAttributes(baseUrl, consumerKey, consumerSecret) {
  const response = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/attributes`,
    buildWooConfig(consumerKey, consumerSecret, {
      params: {
        per_page: 100,
      },
    })
  );

  return Array.isArray(response.data) ? response.data : [];
}

async function createGlobalAttribute(baseUrl, consumerKey, consumerSecret, name) {
  const response = await axios.post(
    `${normalizeBaseUrl(baseUrl)}/products/attributes`,
    {
      name: String(name || "").trim(),
      type: "select",
      order_by: "menu_order",
      has_archives: false,
    },
    buildWooConfig(consumerKey, consumerSecret, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  );

  return response.data;
}

async function fetchTermsForGlobalAttribute(baseUrl, consumerKey, consumerSecret, attributeId) {
  const response = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/attributes/${attributeId}/terms`,
    buildWooConfig(consumerKey, consumerSecret, {
      params: {
        per_page: 100,
      },
    })
  );

  return Array.isArray(response.data) ? response.data : [];
}

async function createTermForGlobalAttribute(baseUrl, consumerKey, consumerSecret, attributeId, name) {
  const response = await axios.post(
    `${normalizeBaseUrl(baseUrl)}/products/attributes/${attributeId}/terms`,
    {
      name: String(name || "").trim(),
    },
    buildWooConfig(consumerKey, consumerSecret, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  );

  return response.data;
}

export async function ensureGlobalAttributeWithTerms({
  baseUrl,
  consumerKey,
  consumerSecret,
  attributeName,
  options = [],
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!attributeName) throw new Error("Falta attributeName");

  const cleanAttributeName = String(attributeName || "").trim();
  const cleanOptions = Array.from(
    new Set(
      (Array.isArray(options) ? options : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

  const allAttributes = await fetchAllGlobalAttributes(
    baseUrl,
    consumerKey,
    consumerSecret
  );

  let attribute = allAttributes.find(
    (item) =>
      String(item?.name || "").trim().toLowerCase() ===
      cleanAttributeName.toLowerCase()
  );

  if (!attribute) {
    attribute = await createGlobalAttribute(
      baseUrl,
      consumerKey,
      consumerSecret,
      cleanAttributeName
    );
  }

  const existingTerms = await fetchTermsForGlobalAttribute(
    baseUrl,
    consumerKey,
    consumerSecret,
    attribute.id
  );

  const ensuredTerms = [];

  for (const option of cleanOptions) {
    const exactTerm = existingTerms.find(
      (term) =>
        String(term?.name || "").trim().toLowerCase() === option.toLowerCase()
    );

    if (exactTerm) {
      ensuredTerms.push({
        id: exactTerm.id,
        name: exactTerm.name,
        slug: exactTerm.slug ?? "",
      });
      continue;
    }

    const createdTerm = await createTermForGlobalAttribute(
      baseUrl,
      consumerKey,
      consumerSecret,
      attribute.id,
      option
    );

    ensuredTerms.push({
      id: createdTerm.id,
      name: createdTerm.name,
      slug: createdTerm.slug ?? "",
    });
  }

  return {
    ok: true,
    attribute: {
      id: attribute.id,
      name: attribute.name,
      slug: attribute.slug ?? "",
    },
    terms: ensuredTerms,
  };
}

async function searchCategoriesByName(baseUrl, consumerKey, consumerSecret, search) {
  const response = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/categories`,
    buildWooConfig(consumerKey, consumerSecret, {
      params: {
        search,
        per_page: 20,
      },
    })
  );

  return Array.isArray(response.data) ? response.data : [];
}

async function createCategory(baseUrl, consumerKey, consumerSecret, name, parentId = 0) {
  const payload = {
    name: String(name || "").trim(),
  };

  if (Number(parentId) > 0) {
    payload.parent = Number(parentId);
  }

  const response = await axios.post(
    `${normalizeBaseUrl(baseUrl)}/products/categories`,
    payload,
    buildWooConfig(consumerKey, consumerSecret, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  );

  return response.data;
}

export async function ensureCategoryByName({
  baseUrl,
  consumerKey,
  consumerSecret,
  name,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!name) throw new Error("Falta name");

  const cleanName = String(name).trim();

  const found = await searchCategoriesByName(
    baseUrl,
    consumerKey,
    consumerSecret,
    cleanName
  );

  const exact = found.find(
    (cat) => String(cat?.name || "").trim().toLowerCase() === cleanName.toLowerCase()
  );

  if (exact) {
    return {
      ok: true,
      created: false,
      category: {
        id: exact.id,
        name: exact.name,
        slug: exact.slug ?? "",
      },
    };
  }

  const created = await createCategory(
    baseUrl,
    consumerKey,
    consumerSecret,
    cleanName
  );

  return {
    ok: true,
    created: true,
    category: {
      id: created.id,
      name: created.name,
      slug: created.slug ?? "",
    },
  };
}

export async function ensureCategoryPath({
  baseUrl,
  consumerKey,
  consumerSecret,
  categoryName,
  subcategoryName = "",
}) {
  const mainCategory = await ensureCategoryByName({
    baseUrl,
    consumerKey,
    consumerSecret,
    name: categoryName,
  });

  if (!subcategoryName) {
    return {
      ok: true,
      parentCategory: mainCategory.category,
      finalCategory: mainCategory.category,
      categories: [mainCategory.category.id],
    };
  }

  const cleanSubcategory = String(subcategoryName || "").trim();

  const found = await searchCategoriesByName(
    baseUrl,
    consumerKey,
    consumerSecret,
    cleanSubcategory
  );

  const exactChild = found.find((cat) => {
    const sameName =
      String(cat?.name || "").trim().toLowerCase() === cleanSubcategory.toLowerCase();
    const sameParent = Number(cat?.parent || 0) === Number(mainCategory.category.id);
    return sameName && sameParent;
  });

  if (exactChild) {
    return {
      ok: true,
      parentCategory: mainCategory.category,
      finalCategory: {
        id: exactChild.id,
        name: exactChild.name,
        slug: exactChild.slug ?? "",
        parent: exactChild.parent ?? 0,
      },
      categories: [exactChild.id],
    };
  }

  const createdChild = await createCategory(
    baseUrl,
    consumerKey,
    consumerSecret,
    cleanSubcategory,
    mainCategory.category.id
  );

  return {
    ok: true,
    parentCategory: mainCategory.category,
    finalCategory: {
      id: createdChild.id,
      name: createdChild.name,
      slug: createdChild.slug ?? "",
      parent: createdChild.parent ?? 0,
    },
    categories: [createdChild.id],
  };
}

export async function suggestCategoriesByName({
  baseUrl,
  consumerKey,
  consumerSecret,
  search,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!search) throw new Error("Falta search");

  const found = await searchCategoriesByName(
    baseUrl,
    consumerKey,
    consumerSecret,
    search
  );

  return {
    ok: true,
    search,
    categories: found.slice(0, 8).map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug ?? "",
    })),
  };
}

export async function createSimpleProduct({
  baseUrl,
  consumerKey,
  consumerSecret,
  name,
  sku = "",
  regularPrice,
  salePrice = "",
  cashPrice = "",
  description = "",
  shortDescription = "",
  categories = [],
  images = [],
  stockQuantity = null,
  manageStock = false,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!name) throw new Error("Falta name");
  if (regularPrice == null || regularPrice === "") throw new Error("Falta regularPrice");

  const hasStockQuantity =
    stockQuantity !== null &&
    stockQuantity !== undefined &&
    String(stockQuantity).trim() !== "";

  const cleanCashPrice = String(cashPrice || "").trim();

  const payload = {
    name: String(name).trim(),
    sku: String(sku || "").trim(),
    type: "simple",
    regular_price: String(regularPrice),
    description: String(description || ""),
    short_description: String(shortDescription || ""),
  };

  if (hasStockQuantity && Boolean(manageStock)) {
    payload.manage_stock = true;
    payload.stock_quantity = Number(stockQuantity);
    payload.stock_status = "instock";
  } else {
    payload.manage_stock = false;
    payload.stock_status = "instock";
  }

  if (salePrice !== undefined && salePrice !== null && String(salePrice).trim() !== "") {
    payload.sale_price = String(salePrice).trim();
  }

  if (cleanCashPrice) {
    payload.meta_data = [
      { key: "_precio_efectivo_general", value: cleanCashPrice },
      { key: "_precio_efectivo", value: cleanCashPrice },
    ];
  }

  if (Array.isArray(images) && images.length > 0) {
    payload.images = images.map((url) => ({
      src: url,
    }));
  }

  if (Array.isArray(categories) && categories.length > 0) {
    payload.categories = categories
      .filter((id) => Number.isFinite(Number(id)))
      .map((id) => ({ id: Number(id) }));
  }

  const created = await createProduct(
    baseUrl,
    consumerKey,
    consumerSecret,
    payload
  );

  return {
    ok: true,
    action: "create_simple_product",
    product_id: created.id ?? null,
    name: created.name ?? "",
    type: created.type ?? "",
    regular_price: created.regular_price ?? "",
    price: created.price ?? "",
    cash_price_general: cleanCashPrice,
    manage_stock: created.manage_stock ?? null,
    stock_quantity: created.stock_quantity ?? null,
    status: created.status ?? "",
  };
}

export async function updateProductPrice({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  regularPrice,
  salePrice,
  attributes = {},
  selectedCombinations = [],
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");

  const productResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret)
  );

  const product = productResponse.data || {};
  const productType = String(product.type || "").toLowerCase();

    const buildPricePayload = (currentRegularPrice = "") => {
    const payload = {};

    const cleanRegularPrice = String(
      regularPrice ?? currentRegularPrice ?? ""
    ).trim();

    if (cleanRegularPrice !== "") {
      payload.regular_price = cleanRegularPrice;
    }

    if (salePrice !== undefined && salePrice !== null && salePrice !== "") {
      payload.sale_price = String(salePrice).trim();
    } else {
      payload.sale_price = "";
    }

    return payload;
  };

  if (productType === "variable") {
  const variations = await fetchAllVariations(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId
  );

const normalizedFilters = Object.entries(attributes || {})
  .map(([name, value]) => ({
    name: normalizeText(name),
    value: normalizeText(value),
  }))
  .filter((item) => item.name && item.value);

const normalizedSelectedCombinations = (Array.isArray(selectedCombinations) ? selectedCombinations : [])
  .map((item) => {
    // 👉 SI VIENE COMO ARRAY (["Negro", "1"])
    if (Array.isArray(item)) {
      return item.map((v) => normalizeText(v));
    }

    // 👉 SI VIENE COMO OBJETO ({ Color: "Negro", Talle: "1" })
    const normalizedItem = {};

    for (const [key, value] of Object.entries(item || {})) {
      const cleanKey = normalizeText(key);
      const cleanValue = normalizeText(value);

      if (cleanKey && cleanValue) {
        normalizedItem[cleanKey] = cleanValue;
      }
    }

    return normalizedItem;
  })
  .filter((item) =>
    Array.isArray(item) ? item.length > 0 : Object.keys(item).length > 0
  );


const variationsFilteredByAttributes =
  normalizedFilters.length === 0
    ? variations
    : variations.filter((variation) => {
        const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];

        return normalizedFilters.every((filterItem) =>
          attrs.some(
            (attr) =>
              normalizeText(attr?.name || "") === filterItem.name &&
              normalizeText(attr?.option || "") === filterItem.value
          )
        );
      });

const variationsToUpdate =
  normalizedSelectedCombinations.length === 0
    ? variationsFilteredByAttributes
    : variationsFilteredByAttributes.filter((variation) => {
        const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];

        return normalizedSelectedCombinations.some((combo) => {
          // 👉 CASO ARRAY ["negro", "1"]
          if (Array.isArray(combo)) {
  const values = attrs.map((attr) =>
    normalizeText(String(attr?.option || "").replace(/^0+/, ""))
  );

  return combo.every((v) =>
    values.includes(normalizeText(String(v).replace(/^0+/, "")))
  );
}

          // 👉 CASO OBJETO { color: "negro" }
          return Object.entries(combo).every(([comboName, comboValue]) =>
            attrs.some(
              (attr) =>
                normalizeText(attr?.name || "") === comboName &&
                normalizeText(attr?.option || "") === comboValue
            )
          );
        });
      });

          if (variationsToUpdate.length === 0) {
    return {
      ok: false,
      action: "update_product_price",
      product_id: productId,
      name: product.name ?? "",
      type: product.type ?? "",
      updated_variations: 0,
      regular_price: "",
      sale_price: "",
      price: "",
      message: "No encontré variaciones que coincidan con esos atributos.",
    };
  }

    const updatedVariationDetails = await Promise.all(
    variationsToUpdate.map(async (variation) => {
      await axios.put(
        `${normalizeBaseUrl(baseUrl)}/products/${productId}/variations/${variation.id}`,
        buildPricePayload(variation.regular_price),
        buildWooConfig(consumerKey, consumerSecret, {
          headers: {
            "Content-Type": "application/json",
          },
        })
      );

      return {
        id: variation.id,
        attributes: Array.isArray(variation.attributes)
          ? variation.attributes.map((attr) => ({
              name: String(attr?.name || "").trim(),
              option: String(attr?.option || "").trim(),
            }))
          : [],
        attributes_text: Array.isArray(variation.attributes)
          ? variation.attributes
              .map((attr) => `${String(attr?.name || "").trim()}: ${String(attr?.option || "").trim()}`)
              .join(" | ")
          : "",
      };
    })
  );

  return {
    ok: true,
    action: "update_product_price",
    product_id: productId,
    name: product.name ?? "",
    type: product.type ?? "",
    updated_variations: variationsToUpdate.length,
    updated_variation_details: updatedVariationDetails,
    regular_price: "",
    sale_price: "",
    price: "",
  };
}
  const updated = await updateProduct(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    buildPricePayload()
  );

  return {
    ok: true,
    action: "update_product_price",
    product_id: updated.id ?? productId,
    name: updated.name ?? "",
    type: updated.type ?? "",
    regular_price: updated.regular_price ?? "",
    sale_price: updated.sale_price ?? "",
    price: updated.price ?? "",
  };
}

export async function updateProductCashPrice({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  cashPrice,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");

  const cleanCashPrice = String(cashPrice || "").trim();

  if (!cleanCashPrice) {
    throw new Error("Falta cashPrice");
  }

  const productResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret)
  );

  const product = productResponse.data || {};
  const productType = String(product.type || "").toLowerCase();

  await axios.put(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    {
      meta_data: [
        { key: "_precio_efectivo_general", value: cleanCashPrice },
        { key: "_precio_efectivo", value: cleanCashPrice },
      ],
    },
    buildWooConfig(consumerKey, consumerSecret, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  );

  let updatedVariations = 0;

  if (productType === "variable") {
    const variations = await fetchAllVariations(
      baseUrl,
      consumerKey,
      consumerSecret,
      productId
    );

    for (const variation of variations) {
      await axios.put(
        `${normalizeBaseUrl(baseUrl)}/products/${productId}/variations/${variation.id}`,
        {
          meta_data: [
            { key: "_precio_efectivo", value: cleanCashPrice },
          ],
        },
        buildWooConfig(consumerKey, consumerSecret, {
          headers: {
            "Content-Type": "application/json",
          },
        })
      );

      updatedVariations += 1;
    }
  }

  return {
    ok: true,
    action: "update_cash_price",
    product_id: productId,
    name: product?.name || "",
    type: productType || "",
    cash_price_general: cleanCashPrice,
    updated_variations: updatedVariations,
  };
}

export async function enableManageStockForVariation({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  variationId,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");
  if (!variationId) throw new Error("Falta variationId");

  const updated = await updateVariation(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    variationId,
    {
      manage_stock: true,
    }
  );

  return {
    ok: true,
    action: "enable_manage_stock_for_variation",
    product_id: productId,
    variation_id: variationId,
    manage_stock: updated.manage_stock ?? null,
    stock_quantity: updated.stock_quantity ?? null,
    stock_status: updated.stock_status ?? null,
    sku: updated.sku ?? "",
  };
}

export async function updateVariationStock({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  variationId,
  quantity,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");
  if (!variationId) throw new Error("Falta variationId");

  const updated = await updateVariation(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    variationId,
    {
      manage_stock: true,
      stock_quantity: Number(quantity),
    }
  );

  return {
    ok: true,
    action: "update_variation_stock",
    product_id: productId,
    variation_id: variationId,
    new_stock: updated.stock_quantity ?? null,
    stock_status: updated.stock_status ?? null,
    sku: updated.sku ?? "",
  };
}

export async function updateStockAdvanced({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  manageStock,
  stockQuantity = null,
  stockStatus = "instock",
  selectedCombinations = [],
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");

  const productResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret)
  );

  const product = productResponse.data || {};
  const productType = String(product.type || "").toLowerCase();

  if (productType !== "variable") {
    const payload = {
      manage_stock: Boolean(manageStock),
    };

    if (manageStock) {
      payload.stock_quantity = Number(stockQuantity || 0);
      payload.stock_status = "instock";
    } else {
      payload.stock_quantity = null;
      payload.stock_status = stockStatus || "instock";
    }

    const updated = await updateProduct(
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      payload
    );

    return {
      ok: true,
      action: "update_stock_advanced",
      scope: "product",
      product_id: updated.id,
      name: updated.name || "",
      manage_stock: updated.manage_stock ?? null,
      stock_quantity: updated.stock_quantity ?? null,
      stock_status: updated.stock_status ?? null,
    };
  }

  const variations = await fetchAllVariations(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId
  );

  const normalizedSelectedCombinations = (Array.isArray(selectedCombinations) ? selectedCombinations : [])
    .map((item) => {
      const normalizedItem = {};

      for (const [key, value] of Object.entries(item || {})) {
        const cleanKey = normalizeText(key);
        const cleanValue = normalizeText(value);

        if (cleanKey && cleanValue) {
          normalizedItem[cleanKey] = cleanValue;
        }
      }

      return normalizedItem;
    })
    .filter((item) => Object.keys(item).length > 0);

  const variationsToUpdate =
    normalizedSelectedCombinations.length === 0
      ? variations
      : variations.filter((variation) => {
          const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];

          return normalizedSelectedCombinations.some((combo) =>
            Object.entries(combo).every(([comboName, comboValue]) =>
              attrs.some(
                (attr) =>
                  normalizeText(attr?.name || "") === comboName &&
                  normalizeText(attr?.option || "") === comboValue
              )
            )
          );
        });

  const results = [];

  for (const variation of variationsToUpdate) {
    const payload = {
      manage_stock: Boolean(manageStock),
    };

    if (manageStock) {
      payload.stock_quantity = Number(stockQuantity || 0);
      payload.stock_status = "instock";
    } else {
      payload.stock_quantity = null;
      payload.stock_status = stockStatus || "instock";
    }

    const updated = await updateVariation(
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      variation.id,
      payload
    );

    results.push({
      variation_id: updated.id,
      attributes_text: formatAttributes(updated.attributes),
      manage_stock: updated.manage_stock ?? null,
      stock_quantity: updated.stock_quantity ?? null,
      stock_status: updated.stock_status ?? null,
    });
  }

  return {
    ok: true,
    action: "update_stock_advanced",
    scope: "variations",
    product_id: productId,
    name: product.name || "",
    updated_count: results.length,
    results,
  };
}

export async function addProductImages({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  images = [],
}) {
  const productResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret)
  );

  const product = productResponse.data || {};
  const currentImages = Array.isArray(product.images) ? product.images : [];

  const merged = [
    ...currentImages.map((img) => ({ id: img.id })),
    ...images,
  ];

  const unique = [];
  const seen = new Set();

  for (const img of merged) {
    const key = img?.id ? `id:${img.id}` : `src:${img?.src || ""}`;
    if (!seen.has(key) && (img?.id || img?.src)) {
      seen.add(key);
      unique.push(img.id ? { id: img.id } : { src: img.src });
    }
  }

  const updated = await updateProduct(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    { images: unique }
  );

  return {
    ok: true,
    product_id: updated.id,
    name: updated.name,
    images: updated.images || [],
  };
}

// ❌ ELIMINAR FOTOS DEL PRODUCTO
export async function removeProductImages({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  imageIdsToRemove = [],
}) {
  const productResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret)
  );

  const product = productResponse.data || {};
  const currentImages = Array.isArray(product?.images) ? product.images : [];

  const filteredImages = currentImages.filter(
    (img) => !imageIdsToRemove.includes(Number(img.id))
  );

  const updated = await updateProduct(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    {
      images: filteredImages.map((img) => ({
        id: Number(img.id),
      })),
    }
  );

  return {
    ok: true,
    product_id: updated.id,
    name: updated.name,
    images: updated.images || [],
    remaining_images: filteredImages.length,
  };
}

export async function reorderProductImages({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  orderedImageIds = [],
}) {
  const productResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret)
  );

  const product = productResponse.data || {};
  const currentImages = Array.isArray(product?.images) ? product.images : [];

  const imageMap = new Map(
    currentImages.map((img) => [Number(img.id), img])
  );

  const reordered = orderedImageIds
    .map((id) => imageMap.get(Number(id)))
    .filter(Boolean)
    .map((img) => ({ id: Number(img.id) }));

  const missingImages = currentImages
    .filter((img) => !orderedImageIds.includes(Number(img.id)))
    .map((img) => ({ id: Number(img.id) }));

  const finalImages = [...reordered, ...missingImages];

  const updated = await updateProduct(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    {
      images: finalImages,
    }
  );

  return {
    ok: true,
    product_id: updated.id,
    name: updated.name,
    images: updated.images || [],
  };
}

export async function setVariationImage({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  variationId,
  imageId,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");
  if (!variationId) throw new Error("Falta variationId");
  if (!imageId) throw new Error("Falta imageId");

  const updated = await updateVariation(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    variationId,
    {
      image: {
        id: Number(imageId),
      },
    }
  );

  return {
    ok: true,
    product_id: productId,
    variation_id: updated.id,
    image: updated.image || null,
    attributes_text: formatAttributes(updated.attributes),
  };
}

export async function assignImageToSelectedVariations({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  imageSrc,
  selectedCombinations = [],
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");
  if (!imageSrc) throw new Error("Falta imageSrc");

  const productWithImage = await addProductImages({
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    images: [{ src: imageSrc }],
  });

  const productResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret)
  );

  const product = productResponse.data || {};
  const allImages = Array.isArray(product.images) ? product.images : [];

  const matchedImage = allImages.find(
    (img) => String(img?.src || "").trim() === String(imageSrc).trim()
  );

  const fallbackImage = allImages.length > 0 ? allImages[allImages.length - 1] : null;
  const finalImageId = Number(matchedImage?.id || fallbackImage?.id || 0);

  if (!finalImageId) {
    throw new Error("No pude obtener el imageId final.");
  }

  const variations = await fetchAllVariations(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId
  );

  const normalizedSelectedCombinations = (Array.isArray(selectedCombinations) ? selectedCombinations : [])
    .map((item) => {
      if (Array.isArray(item)) {
        return item.map((v) => normalizeText(v));
      }

      const normalizedItem = {};

      for (const [key, value] of Object.entries(item || {})) {
        const cleanKey = normalizeText(key);
        const cleanValue = normalizeText(value);

        if (cleanKey && cleanValue) {
          normalizedItem[cleanKey] = cleanValue;
        }
      }

      return normalizedItem;
    })
    .filter((item) =>
      Array.isArray(item) ? item.length > 0 : Object.keys(item).length > 0
    );

  const variationsToUpdate =
    normalizedSelectedCombinations.length === 0
      ? variations
      : variations.filter((variation) => {
          const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];

          return normalizedSelectedCombinations.some((combo) => {
            if (Array.isArray(combo)) {
              const values = attrs.map((attr) => normalizeText(attr?.option || ""));
              return combo.every((v) => values.includes(normalizeText(v)));
            }

            return Object.entries(combo).every(([comboName, comboValue]) =>
              attrs.some(
                (attr) =>
                  normalizeText(attr?.name || "") === comboName &&
                  normalizeText(attr?.option || "") === comboValue
              )
            );
          });
        });

  if (variationsToUpdate.length === 0) {
    return {
      ok: false,
      product_id: productId,
      updated_count: 0,
      image_id: finalImageId,
      message: "No encontré variaciones para actualizar.",
    };
  }

  const results = [];

  for (const variation of variationsToUpdate) {
    const updated = await updateVariation(
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      variation.id,
      {
        image: {
          id: finalImageId,
        },
      }
    );

    results.push({
      variation_id: updated.id,
      image: updated.image || null,
      attributes_text: formatAttributes(updated.attributes),
    });
  }

  return {
    ok: true,
    product_id: productId,
    name: product.name || productWithImage.name || "",
    image_id: finalImageId,
    updated_count: results.length,
    results,
  };
}

export async function removeImageFromSelectedVariations({
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  selectedCombinations = [],
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");

  const productResponse = await axios.get(
    `${normalizeBaseUrl(baseUrl)}/products/${productId}`,
    buildWooConfig(consumerKey, consumerSecret)
  );

  const product = productResponse.data || {};

  const variations = await fetchAllVariations(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId
  );

  const normalizedSelectedCombinations = (Array.isArray(selectedCombinations) ? selectedCombinations : [])
    .map((item) => {
      if (Array.isArray(item)) {
        return item.map((v) => normalizeText(v));
      }

      const normalizedItem = {};

      for (const [key, value] of Object.entries(item || {})) {
        const cleanKey = normalizeText(key);
        const cleanValue = normalizeText(value);

        if (cleanKey && cleanValue) {
          normalizedItem[cleanKey] = cleanValue;
        }
      }

      return normalizedItem;
    })
    .filter((item) =>
      Array.isArray(item) ? item.length > 0 : Object.keys(item).length > 0
    );

  const variationsToUpdate =
    normalizedSelectedCombinations.length === 0
      ? variations
      : variations.filter((variation) => {
          const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];

          return normalizedSelectedCombinations.some((combo) => {
            if (Array.isArray(combo)) {
              const values = attrs.map((attr) => normalizeText(attr?.option || ""));
              return combo.every((v) => values.includes(normalizeText(v)));
            }

            return Object.entries(combo).every(([comboName, comboValue]) =>
              attrs.some(
                (attr) =>
                  normalizeText(attr?.name || "") === comboName &&
                  normalizeText(attr?.option || "") === comboValue
              )
            );
          });
        });

  if (variationsToUpdate.length === 0) {
    return {
      ok: false,
      product_id: productId,
      updated_count: 0,
      message: "No encontré variaciones para actualizar.",
    };
  }

  const results = [];

  for (const variation of variationsToUpdate) {
    const updated = await updateVariation(
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      variation.id,
      {
        image: {},
      }
    );

    results.push({
      variation_id: updated.id,
      image: updated.image || null,
      attributes_text: formatAttributes(updated.attributes),
    });
  }

  return {
    ok: true,
    product_id: productId,
    name: product.name || "",
    updated_count: results.length,
    results,
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function formatAttributes(attributes = []) {
  if (!Array.isArray(attributes)) return "";
  return attributes
    .map((attr) => `${attr?.name || "atributo"}: ${attr?.option || "-"}`)
    .join(" | ");
}

export async function auditVariableProductsStock({
  baseUrl,
  consumerKey,
  consumerSecret,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");

  const products = await fetchAllVariableProducts(baseUrl, consumerKey, consumerSecret);

  const withoutSku = [];
  const manageStockDisabled = [];
  let totalVariationsReviewed = 0;

  for (const product of products) {
    const variations = await fetchAllVariations(
      baseUrl,
      consumerKey,
      consumerSecret,
      product.id
    );

    for (const variation of variations) {
      totalVariationsReviewed += 1;

      const sku = cleanText(variation.sku);
      const hasNoSku = !sku;
      const manageStockOff = variation.manage_stock !== true;

      const item = {
        product_id: product.id,
        product_name: product.name,
        variation_id: variation.id,
        attributes: formatAttributes(variation.attributes),
        sku: variation.sku ?? "",
        manage_stock: variation.manage_stock ?? null,
        stock_quantity: variation.stock_quantity ?? null,
        stock_status: variation.stock_status ?? null,
        backorders: variation.backorders ?? null,
      };

      if (hasNoSku) withoutSku.push(item);
      if (manageStockOff) manageStockDisabled.push(item);
    }
  }

  const inconsistentStock = [];

  for (const item of manageStockDisabled) {
    if (item.stock_status === "instock" && item.stock_quantity == null) {
      inconsistentStock.push(item);
    }
  }

  return {
    summary: {
      variable_products_reviewed: products.length,
      variations_reviewed: totalVariationsReviewed,
      info_without_sku: withoutSku.length,
      attention_manage_stock_disabled: manageStockDisabled.length,
      problem_inconsistent_stock: inconsistentStock.length,
    },
    info: {
      withoutSku,
    },
    attention: {
      manageStockDisabled,
    },
    problems: {
      inconsistentStock,
    },
  };
}

export async function prepareEnableManageStockForVariations({
  baseUrl,
  consumerKey,
  consumerSecret,
  limit = 50,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");

  const products = await fetchAllVariableProducts(baseUrl, consumerKey, consumerSecret);

  const candidates = [];
  let totalVariationsReviewed = 0;

  for (const product of products) {
    const variations = await fetchAllVariations(
      baseUrl,
      consumerKey,
      consumerSecret,
      product.id
    );

    for (const variation of variations) {
      totalVariationsReviewed += 1;

      if (variation.manage_stock === true) continue;

      candidates.push({
        product_id: product.id,
        product_name: product.name,
        variation_id: variation.id,
        attributes: formatAttributes(variation.attributes),
        sku: variation.sku ?? "",
        current_manage_stock: variation.manage_stock ?? null,
        current_stock_quantity: variation.stock_quantity ?? null,
        current_stock_status: variation.stock_status ?? null,
        proposed_manage_stock: true,
      });
    }
  }

  const selected = candidates.slice(0, limit);

  return {
    summary: {
      variable_products_reviewed: products.length,
      variations_reviewed: totalVariationsReviewed,
      candidates_found: candidates.length,
      selected_for_dry_run: selected.length,
      limit,
    },
    selected,
  };
}

function getAttributeOption(variation, attributeNameCandidates = []) {
  const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];

  for (const attr of attrs) {
    const attrName = normalizeText(attr?.name);
    const attrOption = String(attr?.option || "").trim();

    for (const candidate of attributeNameCandidates) {
      if (attrName === normalizeText(candidate)) {
        return attrOption;
      }
    }
  }

  return "";
}

function parseColorSizeQuantityLine(line) {
  const clean = String(line || "").trim().replace(/\s+/g, " ");
  if (!clean) return null;

  const match = clean.match(/^(.+?)\s+([A-Za-z0-9]+)\s+(\d+)$/);

  if (!match) return null;

  return {
    color: match[1].trim(),
    size: match[2].trim(),
    quantity: Number(match[3]),
    raw: clean,
  };
}

export async function planStockUpdateByColorAndSize({
  baseUrl,
  consumerKey,
  consumerSecret,
  productSearch,
  lines,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productSearch) throw new Error("Falta productSearch");

  const found = await findVariableProductWithVariations({
    baseUrl,
    consumerKey,
    consumerSecret,
    search: productSearch,
  });

  if (!found.ok || !found.found) {
    return {
      ok: false,
      found: false,
      message: "No se encontró el producto variable.",
      productSearch,
      matches: [],
      errors: [],
    };
  }

  const parsedLines = [];
  const errors = [];
  const matches = [];

  for (const line of Array.isArray(lines) ? lines : []) {
    const parsed = parseColorSizeQuantityLine(line);

    if (!parsed) {
      errors.push({
        line,
        error: "No se pudo interpretar la línea. Formato esperado: Color Talle Cantidad",
      });
      continue;
    }

    parsedLines.push(parsed);
  }

  for (const item of parsedLines) {
    const colorWanted = normalizeText(item.color);
    const sizeWanted = normalizeText(item.size);

    const matchedVariation = found.variations.find((variation) => {
      const color = normalizeText(getAttributeOption(variation, ["Color", "Colores"]));
      const size = normalizeText(getAttributeOption(variation, ["Talle", "Talles", "Size", "Sizes"]));

      return color === colorWanted && size === sizeWanted;
    });

    if (!matchedVariation) {
      errors.push({
        line: item.raw,
        error: "No se encontró una variación que coincida con color y talle.",
      });
      continue;
    }

    matches.push({
      line: item.raw,
      product_id: found.product.id,
      product_name: found.product.name,
      variation_id: matchedVariation.variation_id,
      attributes_text: matchedVariation.attributes_text,
      current_stock_quantity: matchedVariation.stock_quantity,
      current_manage_stock: matchedVariation.manage_stock,
      new_quantity: item.quantity,
    });
  }

  return {
    ok: true,
    found: true,
    product: found.product,
    parsed_lines: parsedLines,
    matches,
    errors,
    summary: {
      lines_received: Array.isArray(lines) ? lines.length : 0,
      lines_parsed: parsedLines.length,
      matches_found: matches.length,
      errors: errors.length,
    },
  };
}

export async function applyStockUpdateByColorAndSize({
  baseUrl,
  consumerKey,
  consumerSecret,
  productSearch,
  lines,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productSearch) throw new Error("Falta productSearch");

  const plan = await planStockUpdateByColorAndSize({
    baseUrl,
    consumerKey,
    consumerSecret,
    productSearch,
    lines,
  });

  if (!plan.ok || !plan.found) {
    return {
      ok: false,
      applied: false,
      message: "No se pudo preparar el plan.",
      plan,
    };
  }

  if (plan.errors.length > 0) {
    return {
      ok: false,
      applied: false,
      message: "Hay errores en el plan. No se aplicaron cambios.",
      plan,
    };
  }

  const results = [];

  for (const item of plan.matches) {
    const updated = await updateVariationStock({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId: item.product_id,
      variationId: item.variation_id,
      quantity: item.new_quantity,
    });

    results.push({
      line: item.line,
      product_id: item.product_id,
      variation_id: item.variation_id,
      attributes_text: item.attributes_text,
      previous_stock: item.current_stock_quantity,
      new_stock: updated.new_stock ?? item.new_quantity,
      stock_status: updated.stock_status ?? null,
      sku: updated.sku ?? "",
    });
  }

  return {
    ok: true,
    applied: true,
    product: plan.product,
    summary: {
      lines_received: plan.summary.lines_received,
      applied_count: results.length,
      errors: 0,
    },
    results,
  };
}

function parseColorQuantityLine(line) {
  const clean = String(line || "").trim().replace(/\s+/g, " ");
  if (!clean) return null;

  const match = clean.match(/^(.+?)\s+(\d+)$/);

  if (!match) return null;

  return {
    color: match[1].trim(),
    quantity: Number(match[2]),
    raw: clean,
  };
}

export async function planStockUpdateByColorOnly({
  baseUrl,
  consumerKey,
  consumerSecret,
  productSearch,
  lines,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productSearch) throw new Error("Falta productSearch");

  const found = await findVariableProductWithVariations({
    baseUrl,
    consumerKey,
    consumerSecret,
    search: productSearch,
  });

  if (!found.ok || !found.found) {
    return {
      ok: false,
      found: false,
      message: "No se encontró el producto variable.",
      productSearch,
      matches: [],
      errors: [],
    };
  }

  const parsedLines = [];
  const errors = [];
  const matches = [];

  for (const line of Array.isArray(lines) ? lines : []) {
    const parsed = parseColorQuantityLine(line);

    if (!parsed) {
      errors.push({
        line,
        error: "No se pudo interpretar la línea. Formato esperado: Color Cantidad",
      });
      continue;
    }

    parsedLines.push(parsed);
  }

  for (const item of parsedLines) {
    const colorWanted = normalizeText(item.color);

    const sameColorVariations = found.variations.filter((variation) => {
      const color = normalizeText(getAttributeOption(variation, ["Color", "Colores"]));
      return color === colorWanted;
    });

    if (sameColorVariations.length === 0) {
      errors.push({
        line: item.raw,
        error: "No se encontró una variación para ese color.",
      });
      continue;
    }

    if (sameColorVariations.length > 1) {
      errors.push({
        line: item.raw,
        error: "Ese color tiene varias variaciones. Necesito que aclares el talle.",
        options: sameColorVariations.map((v) => v.attributes_text),
      });
      continue;
    }

    const matchedVariation = sameColorVariations[0];

    matches.push({
      line: item.raw,
      product_id: found.product.id,
      product_name: found.product.name,
      variation_id: matchedVariation.variation_id,
      attributes_text: matchedVariation.attributes_text,
      current_stock_quantity: matchedVariation.stock_quantity,
      current_manage_stock: matchedVariation.manage_stock,
      new_quantity: item.quantity,
    });
  }

  return {
    ok: true,
    found: true,
    product: found.product,
    parsed_lines: parsedLines,
    matches,
    errors,
    summary: {
      lines_received: Array.isArray(lines) ? lines.length : 0,
      lines_parsed: parsedLines.length,
      matches_found: matches.length,
      errors: errors.length,
    },
  };
}

function normalizeColorName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export async function createVariableProduct({
  baseUrl,
  consumerKey,
  consumerSecret,
  name,
  sku = "",
  cashPrice = "",
  description = "",
  shortDescription = "",
  attributes = [],
  variations = [],
  categories = [],
  images = [],
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!name) throw new Error("Falta name");

  const orderedImages = Array.isArray(images)
    ? [...images].sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    : [];

  const productPayload = {
    name: String(name).trim(),
    sku: String(sku || "").trim(),
    type: "variable",
    description: String(description || ""),
    short_description: String(shortDescription || ""),
    attributes: attributes.map((attr) => ({
      ...(attr.id ? { id: Number(attr.id) } : { name: attr.name }),
      visible: true,
      variation: true,
      options: attr.options,
    })),
  };
    const cleanCashPrice = String(cashPrice || "").trim();

  if (cleanCashPrice) {
    productPayload.meta_data = [
      { key: "_precio_efectivo_general", value: cleanCashPrice },
    ];
  }

  if (Array.isArray(categories) && categories.length > 0) {
    productPayload.categories = categories
      .filter((id) => Number.isFinite(Number(id)))
      .map((id) => ({
        id: Number(id),
      }));
  }

  // ACÁ sí dejamos src, pero solo en el producto padre
  if (orderedImages.length > 0) {
    productPayload.images = orderedImages.map((img) => ({
      src: img.src,
    }));
  }

  const createdProduct = await createProduct(
    baseUrl,
    consumerKey,
    consumerSecret,
    productPayload
  );

  console.log("VARIABLE PRODUCT PAYLOAD", productPayload);
  console.log("VARIABLE PRODUCT CREATED", {
    id: createdProduct?.id,
    name: createdProduct?.name,
    sku: createdProduct?.sku,
    type: createdProduct?.type,
  });

  const productId = createdProduct.id;
  const createdVariations = [];

  // Armamos un mapa color -> image id usando las imágenes ya importadas por Woo
  const createdProductImages = Array.isArray(createdProduct?.images)
    ? createdProduct.images
    : [];

  const imageIdByColor = new Map();

  for (let i = 0; i < orderedImages.length; i += 1) {
    const originalImage = orderedImages[i];
    const createdImage = createdProductImages[i];

    if (!originalImage?.color) continue;
    if (!createdImage?.id) continue;

    imageIdByColor.set(
      normalizeColorName(originalImage.color),
      Number(createdImage.id)
    );
  }

  for (const variation of variations) {
    const payload = {
      regular_price: String(variation.regular_price),
      attributes: variation.attributes.map((a) => ({
        ...(a.id ? { id: Number(a.id) } : { name: String(a.name).trim() }),
        option: String(a.option || "").trim(),
      })),
    };
        if (cleanCashPrice) {
      payload.meta_data = [
        { key: "_precio_efectivo", value: cleanCashPrice },
      ];
    }

    if (
      variation.sale_price !== undefined &&
      variation.sale_price !== null &&
      variation.sale_price !== ""
    ) {
      payload.sale_price = String(variation.sale_price);
    }

    const variationColor = variation.attributes.find(
      (a) => normalizeColorName(a.name) === "color"
    );

    if (variationColor) {
      const imageId = imageIdByColor.get(
        normalizeColorName(variationColor.option)
      );

      if (imageId) {
        payload.image = { id: imageId };
      }
    }

    if (
      variation.stock_quantity !== undefined &&
      variation.stock_quantity !== null &&
      variation.stock_quantity !== ""
    ) {
      payload.manage_stock = true;
      payload.stock_quantity = Number(variation.stock_quantity);
    } else {
      payload.manage_stock = false;
      payload.stock_status = "instock";
    }

    const response = await axios.post(
      `${normalizeBaseUrl(baseUrl)}/products/${productId}/variations`,
      payload,
      buildWooConfig(consumerKey, consumerSecret, {
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    createdVariations.push(response.data);
  }

  return {
    ok: true,
    action: "create_variable_product",
    product_id: productId,
    product_name: createdProduct.name,
    product_sku: createdProduct.sku ?? "",
    variations_created: createdVariations.length,
    variation_ids: createdVariations.map((item) => item.id),
  };
}

export async function uploadImageToWordpress({
  baseUrl,
  consumerKey,
  consumerSecret,
  fileBuffer,
  fileName,
  mimeType,
}) {
  const form = new FormData();

  form.append("file", fileBuffer, {
    filename: fileName,
    contentType: mimeType || "application/octet-stream",
  });

  const response = await axios.post(
    `${normalizeBaseUrl(baseUrl).replace("/wp-json/wc/v3", "")}/wp-json/wp/v2/media`,
    form,
    {
      headers: {
        ...form.getHeaders(),
      },
      auth: {
        username: process.env.WP_USER,
        password: process.env.WP_APP_PASSWORD,
      },
    }
  );

  return {
    id: response.data.id,
    url: response.data.source_url,
  };
}
