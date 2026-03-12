import axios from "axios";
import FormData from "form-data";

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
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
    headers: {
      ...(extra.headers || {}),
      ...buildAuthHeader(consumerKey, consumerSecret),
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
    buildWooConfig(consumerKey, consumerSecret, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  );

  return response.data;
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
  regularPrice,
  salePrice = "",
  description = "",
  shortDescription = "",
  categories = [],
  images = [],
  stockQuantity = null,
  manageStock = true,
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!name) throw new Error("Falta name");
  if (regularPrice == null || regularPrice === "") throw new Error("Falta regularPrice");

  const payload = {
    name: String(name).trim(),
    type: "simple",
    regular_price: String(regularPrice),
    description: String(description || ""),
    short_description: String(shortDescription || ""),
    manage_stock: Boolean(manageStock),
    stock_quantity: stockQuantity == null ? null : Number(stockQuantity),
  };

  if (salePrice !== undefined && salePrice !== null && String(salePrice).trim() !== "") {
    payload.sale_price = String(salePrice).trim();
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
}) {
  if (!baseUrl) throw new Error("Falta baseUrl");
  if (!consumerKey) throw new Error("Falta consumerKey");
  if (!consumerSecret) throw new Error("Falta consumerSecret");
  if (!productId) throw new Error("Falta productId");

  const payload = {
    regular_price: String(regularPrice),
  };

  if (salePrice !== undefined && salePrice !== null && salePrice !== "") {
    payload.sale_price = String(salePrice);
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
    action: "update_product_price",
    product_id: updated.id ?? productId,
    name: updated.name ?? "",
    regular_price: updated.regular_price ?? "",
    sale_price: updated.sale_price ?? "",
    price: updated.price ?? "",
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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

export async function createVariableProduct({
  baseUrl,
  consumerKey,
  consumerSecret,
  name,
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

  const productPayload = {
    name: String(name).trim(),
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

  if (Array.isArray(categories) && categories.length > 0) {
    productPayload.categories = categories
      .filter((id) => Number.isFinite(Number(id)))
      .map((id) => ({
        id: Number(id),
      }));
  }

  if (Array.isArray(images) && images.length > 0) {
    const sortedImages = [...images]
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
      .map((img) => ({
        id: img.id,
      }));

    if (sortedImages.length > 0) {
      productPayload.images = sortedImages;
    }
  }

  const createdProduct = await createProduct(
    baseUrl,
    consumerKey,
    consumerSecret,
    productPayload
  );

  const productId = createdProduct.id;
  const createdVariations = [];

  for (const variation of variations) {
    const payload = {
  regular_price: String(variation.regular_price),
  attributes: variation.attributes.map((a) => ({
    ...(a.id ? { id: Number(a.id) } : { name: String(a.name).trim() }),
    option: String(a.option || "").trim(),
  })),
};

    if (
      variation.sale_price !== undefined &&
      variation.sale_price !== null &&
      variation.sale_price !== ""
    ) {
      payload.sale_price = String(variation.sale_price);
    }

    const variationColor = variation.attributes.find(
      (a) => String(a.name || "").trim().toLowerCase() === "color"
    );

    if (variationColor) {
      const matchedImage = images.find(
        (img) =>
          String(img.color || "").trim().toLowerCase() ===
          String(variationColor.option || "").trim().toLowerCase()
      );

      if (matchedImage?.id) {
        payload.image = { id: matchedImage.id };
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
    name: createdProduct.name,
    variations_created: createdVariations.length,
  };
}

export async function uploadImageToWordpress({
  baseUrl,
  consumerKey,
  consumerSecret,
  buffer,
  filename,
}) {
  const form = new FormData();

  form.append("file", buffer, filename);

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