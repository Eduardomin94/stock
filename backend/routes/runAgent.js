import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import axios from "axios";
import {
  auditVariableProductsStock,
  updateVariationStock,
  enableManageStockForVariation,
  updateProductPrice,
  updateProductCashPrice,
  applyStockUpdateByColorAndSize,
  planStockUpdateByColorOnly,
  createSimpleProduct,
  createVariableProduct,
  ensureCategoryByName,
  ensureCategoryPath,
  ensureGlobalAttributeWithTerms,
  suggestCategoriesByName,
  listAllCategories,
  findProductBySku,
  findProductsByName,
  deleteProductById,
  updateStockAdvanced,
  addProductImages,
  removeProductImages,
  reorderProductImages,
  assignImageToSelectedVariations,
  removeImageFromSelectedVariations,
  updateProductCategories,
} from "../tools/woocommerce.js";
import jwt from "jsonwebtoken";
import { findUserById } from "../services/users.js";
import { decryptText } from "../services/crypto.js";
import {
  savePendingDraft,
  getPendingDraft,
  clearPendingDraft,
} from "../services/masterAgent.js";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});


const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateWooProduct(baseUrl, consumerKey, consumerSecret, productId, payload) {
  const axios = (await import("axios")).default;

  const response = await axios.put(
    `${String(baseUrl || "").replace(/\/+$/, "")}/products/${productId}`,
    payload,
    {
      params: {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

async function getStoreInfo(baseUrl, consumerKey, consumerSecret) {
  const response = await axios.get(
    `${String(baseUrl || "").replace(/\/+$/, "")}`,
    {
      params: {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
    }
  );

  return response.data || {};
}

function extractGlobalAttributeOptions(product = {}) {
  const attributes = Array.isArray(product?.attributes) ? product.attributes : [];

  return attributes
    .filter((attr) => attr && attr.variation === true)
    .map((attr) => ({
      name: String(attr?.name || "").trim(),
      options: Array.isArray(attr?.options)
        ? attr.options.map((opt) => String(opt || "").trim()).filter(Boolean)
        : [],
    }))
    .filter((attr) => attr.name && attr.options.length > 0);
}

function mapVariationImagePreview(variation = {}) {
  return {
    id: Number(variation?.id || 0),
    attributes: Array.isArray(variation?.attributes)
      ? variation.attributes.map((attr) => ({
          name: String(attr?.name || "").trim(),
          option: String(attr?.option || "").trim(),
        }))
      : [],
    image:
      variation?.image && variation.image.id
        ? {
            id: Number(variation.image.id),
            src: String(variation.image.src || ""),
          }
        : null,

    stock_quantity: variation?.stock_quantity ?? "",
    stock_status: String(variation?.stock_status || "instock"),
    manage_stock: Boolean(variation?.manage_stock),
  };
}
function looksLikeAuditRequest(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("auditar") ||
    text.includes("auditoria") ||
    text.includes("auditoría") ||
    text.includes("sin sku") ||
    text.includes("manage_stock") ||
    text.includes("variaciones")
  );
}

function looksLikeStockUpdate(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("stock") ||
    text.match(/\d+/)
  );
}

function extractNumber(text, key) {
  const regex = new RegExp(`${key}=(\\d+)`, "i");
  const match = String(text || "").match(regex);
  return match ? Number(match[1]) : null;
}

function looksLikeEnableManageStockCommand(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("activar manage_stock");
}

function looksLikeDirectStockCommand(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("stock") && text.includes("qty=");
}
function looksLikePriceUpdateCommand(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("precio") && text.includes("productid=") && text.includes("regular=");
}
function looksLikeDeleteProductCommand(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("eliminar producto") &&
    (
      text.includes("sku:") ||
      text.includes("nombre:")
    )
  );
}
function looksLikeEditProductSearchCommand(message) {
  const text = String(message || "");
  return text.startsWith("__search_edit_product__:");
}
function looksLikeEditProductActionCommand(message) {
  const text = String(message || "");
  return text.startsWith("__edit_product_action__:");
}
function detectCommerceIntent(message) {
  const text = String(message || "").toLowerCase();

  const looksCreate =
    text.includes("nuevo producto") ||
    text.includes("crear producto") ||
    text.includes("cargar producto") ||
    text.includes("producto nuevo") ||
    text.includes("publicar producto") ||
    text.includes("producto variable");

  const looksUpdate =
    text.includes("actualizar") ||
    text.includes("modificar") ||
    text.includes("cambiar") ||
    text.includes("stock") ||
    text.includes("precio") ||
    text.includes("variacion") ||
    text.includes("variación") ||
    text.includes("manage_stock");

  const hasManyLines = text.split("\n").filter((line) => line.trim()).length >= 2;
  const hasNumbers = /\d+/.test(text);

  if (looksCreate && !looksUpdate) {
    return "create";
  }

  if (looksUpdate && !looksCreate) {
    return "update";
  }

  if (!looksCreate && !looksUpdate && hasManyLines && hasNumbers) {
    return "ambiguous";
  }

  return null;
}

function looksLikeExistingProductReply(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("existente") ||
    text.includes("producto existente") ||
    text.includes("es existente") ||
    text.includes("actualizar producto")
  );
}

function looksLikeNewProductReply(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("nuevo") ||
    text.includes("producto nuevo") ||
    text.includes("crear producto") ||
    text.includes("cargar producto")
  );
}

function looksLikeSimpleProductCreateCommand(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("crear producto simple") ||
    text.includes("producto simple")
  );
}

function extractField(message, fieldName) {
  const lines = String(message || "").split("\n");

  const line = lines.find((item) => {
    return item.toLowerCase().startsWith(`${fieldName.toLowerCase()}:`);
  });

  if (!line) return "";
  return line.split(":").slice(1).join(":").trim();
}

function extractMultiValueField(message, fieldName) {
  const value = extractField(message, fieldName);

  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractDeleteSkus(message) {
  const value = extractField(message, "sku");

  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractDeleteNames(message) {
  const lines = String(message || "").split("\n");
  const startIndex = lines.findIndex((line) =>
    line.trim().toLowerCase().startsWith("nombre:")
  );

  if (startIndex === -1) return [];

  const firstLine = lines[startIndex]
    .split(":")
    .slice(1)
    .join(":")
    .trim();

  const collected = [];

  if (firstLine) {
    collected.push(firstLine);
    return firstLine
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (!line) continue;
    if (line.includes(":")) break;

    collected.push(line);
  }

  return collected.filter(Boolean);
}

function extractBlock(message, blockName, stopFields = []) {
  const normalized = String(message || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = normalized.split("\n");

  const startIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === `${blockName.toLowerCase()}:`
  );

  if (startIndex === -1) return "";

  const collected = [];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const lower = line.toLowerCase();

    const shouldStop = stopFields.some((field) =>
      lower.startsWith(`${field.toLowerCase()}:`)
    );

    if (shouldStop) break;
    if (line) collected.push(line);
  }

  return collected.join("\n").trim();
}

function extractLooseCategoryValue(message) {
  const lines = String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith("categoria:")) {
      return line.split(":").slice(1).join(":").trim();
    }

    if (lower.startsWith("categoría:")) {
      return line.split(":").slice(1).join(":").trim();
    }

    if (
      !lower.startsWith("nombre:") &&
      !lower.startsWith("precio:") &&
      !lower.startsWith("stock:") &&
      !lower.startsWith("descripcion:") &&
      !lower.startsWith("descripción:") &&
      !lower.startsWith("descripcion_corta:") &&
      !lower.startsWith("descripción_corta:") &&
      !lower.startsWith("crear producto")
    ) {
      return line;
    }
  }

  return "";
}

function looksLikeOnlyCategoryReply(message) {
  const lines = String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length !== 1) return false;

  const text = lines[0].toLowerCase();

  if (
    text.startsWith("crear producto") ||
    text.startsWith("nombre:") ||
    text.startsWith("precio:") ||
    text.startsWith("stock:") ||
    text.startsWith("descripcion:") ||
    text.startsWith("descripción:") ||
    text.startsWith("descripcion_corta:") ||
    text.startsWith("descripción_corta:") ||
    text.startsWith("producto:") ||
    text.startsWith("categoria:") ||
    text.startsWith("categoría:")
  ) {
    return false;
  }

  return true;
}

function extractOrderedImages(files = [], body = {}) {
  return files
    .filter((file) => file && file.buffer)
    .map((file, index) => {
      const assignedColor =
        body[`imageColor_${file.originalname}-${file.size}`] || "";

      return {
        file,
        position: index + 1,
        isMain: index === 0,
        assignedColor: String(assignedColor || "").trim(),
      };
    });
}


async function saveImagesAndBuildUrls(files = [], body = {}, req) {
  const orderedImages = extractOrderedImages(files, body);
  const uploadsDir = path.join(__dirname, "../uploads");

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const savedImages = [];

  for (const image of orderedImages) {
    const originalName = String(image.file.originalname || "image");
    const safeName = originalName.replace(/\s+/g, "-");
    const finalName = `${Date.now()}-${image.position}-${safeName}`;
    const finalPath = path.join(uploadsDir, finalName);

    fs.writeFileSync(finalPath, image.file.buffer);

    const url = `${req.protocol}://${req.get("host")}/uploads/${finalName}`;

    savedImages.push({
      src: url,
      color: image.assignedColor || "",
      position: image.position,
    });
  }

  return savedImages;
}

function parseVariableAttributesText(raw) {
  const lines = String(raw || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const attributes = [];

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/i);
    if (!match) continue;

    const name = match[1].trim();
    const options = match[2]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!name || options.length === 0) continue;

    attributes.push({
      name,
      options,
    });
  }

  return attributes;
}

function parseVariableVariationsText(raw) {
  const lines = String(raw || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const variations = [];

  for (const line of lines) {
    const parts = line.split("|").map((item) => item.trim());

    if (parts.length < 3) continue;

    const attrsPart = parts[0];
    const pricePart = parts.find((p) => /^precio\s*:/i.test(p));
    const stockPart = parts.find((p) => /^stock\s*:/i.test(p));

    if (!attrsPart || !pricePart || !stockPart) continue;

    const attributes = attrsPart
      .split(",")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const m = pair.match(/^([^:]+):\s*(.+)$/i);
        if (!m) return null;

        return {
          name: m[1].trim(),
          option: m[2].trim(),
        };
      })
      .filter(Boolean);

    const regularPrice = pricePart.replace(/^precio\s*:/i, "").trim();
    const stockQuantity = Number(stockPart.replace(/^stock\s*:/i, "").trim());

    if (!attributes.length) continue;
    if (!regularPrice) continue;
    if (Number.isNaN(stockQuantity)) continue;

    variations.push({
      attributes,
      regular_price: regularPrice,
      stock_quantity: stockQuantity,
    });
  }

  return variations;
}

function looksLikeHumanVariableProductCreate(message) {
  const text = String(message || "").toLowerCase();

  const hasNombre = /nombre\s*:/i.test(text);
  const hasPrecio = /precio\s*:/i.test(text);
  const hasAtributos = /atributos\s*:/i.test(text);
  const hasColor = /color\s*:/i.test(text);
  const hasTalle = /talle\s*:/i.test(text);

  return hasNombre && hasPrecio && hasAtributos && (hasColor || hasTalle);
}

function looksLikeVariableProductCreateReply(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("crear variable") ||
    text.includes("variable con variaciones")
  );
}

function looksLikeVariableProductCreateCommand(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("crear producto variable") ||
    text.includes("producto variable")
  );
}

function extractProductSearch(message) {
  const lines = String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const productLine = lines.find((line) => /^producto\s*:/i.test(line));
  if (productLine) {
    return productLine.replace(/^producto\s*:/i, "").trim();
  }

  if (!lines.length) return "";

  const firstLine = lines[0];

  const looksLikeStockLine =
    /^.+\s+[A-Za-z0-9]+\s+\d+$/i.test(firstLine) ||
    /^.+\s+\d+$/i.test(firstLine);

  if (looksLikeStockLine) return "";

  return firstLine;
}

function extractColorSizeStockLines(message) {
  return String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^producto\s*:/i.test(line))
    .filter((line) => /^.+\s+[A-Za-z0-9]+\s+\d+$/i.test(line));
}

function looksLikeColorSizeStockBatch(message) {
  const productSearch = extractProductSearch(message);
  const stockLines = extractColorSizeStockLines(message);
  return Boolean(productSearch) && stockLines.length > 0;
}

function extractColorOnlyStockLines(message) {
  return String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^producto\s*:/i.test(line))
    .filter((line) => /^.+\s+\d+$/i.test(line))
    .filter((line) => !/^.+\s+[A-Za-z0-9]+\s+\d+$/i.test(line));
}

function looksLikeColorOnlyStockBatch(message) {
  const productSearch = extractProductSearch(message);
  const stockLines = extractColorOnlyStockLines(message);

  const firstLine = String(message || "")
    .split("\n")[0]
    .toLowerCase();

  const looksLikeNewProduct =
    firstLine.includes("$") ||
    /\b\d{3,}\b/.test(firstLine);

  if (looksLikeNewProduct) {
    return false;
  }

  return Boolean(productSearch) && stockLines.length > 0;
}

function looksLikeCompactVariableCreateByColor(message) {
  const lines = String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3) return false;

  const firstLine = lines[0] || "";
  const secondLine = lines[1] || "";

  const hasPrice =
    /\$\s*\d+|\b\d{3,}\b/.test(firstLine) ||
    /\$\s*\d+|\b\d{3,}\b/.test(secondLine);

  const colorStockLines = lines.slice(1).filter((line) => /^.+\s+\d+$/i.test(line));

  return Boolean(firstLine) && hasPrice && colorStockLines.length >= 2;
}

function parseCompactVariableCreateByColor(message) {
  const lines = String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine = lines[0] || "";
  const secondLine = lines[1] || "";

  let priceMatch = titleLine.match(/\$\s*(\d+)|\b(\d{3,})\b/);

  if (!priceMatch) {
    priceMatch = secondLine.match(/\$\s*(\d+)|\b(\d{3,})\b/);
  }

  const price = priceMatch ? Number(priceMatch[1] || priceMatch[2]) : null;

  const name = titleLine
    .replace(/\$\s*\d+/g, "")
    .replace(/\b\d{3,}\b/g, "")
    .trim();

  const stockLines = lines.slice(1);
  const colors = [];
  const variations = [];

  for (const line of stockLines) {
    const match = line.match(/^(.+?)\s+(\d+)$/);
    if (!match) continue;

    const color = match[1].trim();
    const stock = Number(match[2]);

    colors.push(color);

    variations.push({
      attributes: [
        {
          name: "Color",
          option: color,
        },
      ],
      regular_price: String(price),
      stock_quantity: stock,
    });
  }

  return {
    name,
    price,
    attributes: [
      {
        name: "Color",
        options: [...new Set(colors)],
      },
    ],
    variations,
  };
}

function looksLikeCompactVariableCreateByColorReply(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("primera") ||
    text.includes("segunda") ||
    text.includes("tercera")
  );
}
function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKeyName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function looksLikeSupplierVariableProductMessage(message) {
  const text = String(message || "").toLowerCase();

  const hasNombre = text.includes("nombre:");
  const hasPrecio = text.includes("precio:");
  const hasCategoria = text.includes("categoria:");

  const hasAtributosBlock = text.includes("atributos:");
  const hasColor = text.includes("color:");
  const hasTalle = text.includes("talle:");

  return hasNombre && hasPrecio && hasCategoria && hasAtributosBlock && hasColor && hasTalle;
}

function parseSizeRangeExpression(raw) {
  const value = normalizeSpaces(raw);
  const lower = normalizeKeyName(value);

  const numericRangeMatch = lower.match(/(?:talle\s*)?(\d+)\s*(?:al|a|-)\s*(\d+)$/i);

  if (numericRangeMatch) {
    const start = Number(numericRangeMatch[1]);
    const end = Number(numericRangeMatch[2]);

    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      const result = [];
      for (let i = start; i <= end; i += 1) {
        result.push(`Talle ${i}`);
      }
      return result;
    }
  }

  return value
    .split(",")
    .map((item) => normalizeSpaces(item))
    .filter(Boolean);
}

function parseSupplierStockBlock(raw) {
  const lines = String(raw || "")
    .split("\n")
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);

  const stockMap = new Map();

  for (const line of lines) {
    const threePartsMatch = line.match(/^(.+?)\s+([A-Za-z0-9]+)\s+(\d+)$/);

    if (threePartsMatch) {
      const color = normalizeSpaces(threePartsMatch[1]);
      const sizeToken = normalizeSpaces(threePartsMatch[2]);
      const qty = Number(threePartsMatch[3]);

      const normalizedColor = normalizeKeyName(color);
      const normalizedSize = normalizeKeyName(sizeToken);
      const key = `${normalizedColor}__${normalizedSize}`;

      stockMap.set(key, qty);
      continue;
    }

    const twoPartsMatch = line.match(/^(.+?)\s+(\d+)$/);

    if (twoPartsMatch) {
      const firstPart = normalizeSpaces(twoPartsMatch[1]);
      const qty = Number(twoPartsMatch[2]);
      const normalizedFirstPart = normalizeKeyName(firstPart);

      stockMap.set(`${normalizedFirstPart}__`, qty);
      stockMap.set(`__${normalizedFirstPart}`, qty);
    }
  }

  return stockMap;
}

function buildSupplierVariableVariations({ colors = [], sizes = [], price, salePrice = null, stockMap = null }) {
  const variations = [];

  for (const color of colors) {
    for (const size of sizes) {
            const variation = {
        attributes: [
          { name: "Color", option: color },
          { name: "Talle", option: size },
        ],
        regular_price: String(price),
      };

      if (Number.isFinite(salePrice)) {
        variation.sale_price = String(salePrice);
      }

      const key = `${normalizeKeyName(color)}__${normalizeKeyName(size)}`;
      const hasStock = stockMap instanceof Map && stockMap.has(key);

      if (hasStock) {
        variation.stock_quantity = Number(stockMap.get(key));
      }

      variations.push(variation);
    }
  }

  return variations;
}

function parseSupplierVariableProductMessage(message) {
  const rawMessage = String(message || "");

  const stockBlockMatch = rawMessage.match(/\nstock\s*:\s*([\s\S]*)$/i);
  const stockRaw = stockBlockMatch ? stockBlockMatch[1].trim() : "";

  const mainBlock = stockBlockMatch
    ? rawMessage.slice(0, stockBlockMatch.index).trim()
    : rawMessage;

  const lines = String(mainBlock || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const data = {};

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;

    const rawKey = match[1].trim();
    const rawValue = match[2].trim();
    const key = normalizeKeyName(rawKey);

    data[key] = rawValue;
  }

  const name = normalizeSpaces(data.nombre || "");
  const priceRaw = normalizeSpaces(data.precio || "");
  const categoryName = normalizeSpaces(data.categoria || "");
  const subcategoryName = normalizeSpaces(data.subcategoria || "");
  const shortDescription = normalizeSpaces(data.descripcion_corta || "");
  const salePriceRaw = normalizeSpaces(data.precio_rebajado || "");
  const colorRaw = normalizeSpaces(data.color || "");
  const sizeRaw = normalizeSpaces(data.talle || "");

  const cleanPrice = priceRaw.replace(/[^\d]/g, "");
  const price = cleanPrice ? Number(cleanPrice) : null;
  const cleanSalePrice = salePriceRaw.replace(/[^\d]/g, "");
  const salePrice = cleanSalePrice ? Number(cleanSalePrice) : null;

  const colors = colorRaw
    .split(",")
    .map((item) => normalizeSpaces(item))
    .filter(Boolean);

  const sizes = parseSizeRangeExpression(sizeRaw);
  const stockMap = parseSupplierStockBlock(stockRaw);

  const attributes = [];

  if (colors.length > 0) {
    attributes.push({
      name: "Color",
      options: [...new Set(colors)],
    });
  }

  if (sizes.length > 0) {
    attributes.push({
      name: "Talle",
      options: [...new Set(sizes)],
    });
  }

    const variations =
    Number.isFinite(price) && colors.length > 0 && sizes.length > 0
      ? buildSupplierVariableVariations({
          colors: [...new Set(colors)],
          sizes: [...new Set(sizes)],
          price,
          salePrice,
          stockMap,
        })
      : [];

    return {
    name,
    price,
    salePrice,
    categoryName,
    subcategoryName,
    shortDescription,
    colors: [...new Set(colors)],
    sizes: [...new Set(sizes)],
    attributes,
    variations,
    hasStockBlock: Boolean(stockRaw),
    stockLinesParsed: stockMap.size,
  };
}

router.post("/", upload.array("images", 10), async (req, res) => {
  console.log("RUNAGENT HIT", {
    time: new Date().toISOString(),
    message: req.body?.message,
    agentId: req.body?.agentId,
  });
  try {
    const { agentId, message } = req.body;
    const files = req.files || [];


   const resolvedAgentId =
  typeof agentId === "string" && agentId.trim()
    ? agentId.trim()
    : "woocommerce-assistant";

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Falta 'message' en el body",
      });
    }

    const agent = {
  id: "woocommerce-assistant",
  name: "Asistente WooCommerce",
  system_prompt:
    "Sos un asistente especializado en WooCommerce. Respondé en español, claro, directo y sin inventar datos. Si hay resultados de tools, basate en esos datos reales.",
};

let toolContext = "";
let result;

const authHeader = req.headers.authorization || "";
const token = authHeader.startsWith("Bearer ")
  ? authHeader.slice(7)
  : null;

let baseUrl = process.env.WC_URL;
let consumerKey = process.env.WC_KEY;
let consumerSecret = process.env.WC_SECRET;

if (token) {
  try {
    const decoded = jwt.verify(
      token,
      process.env.AUTH_JWT_SECRET || "dev_secret_change_this"
    );

   const user = await findUserById(decoded.id);

   if (user) {
  const userBaseUrl = String(user.store_url || "").trim();
  const userConsumerKey = String(decryptText(user.consumer_key) || "").trim();
  const userConsumerSecret = String(decryptText(user.consumer_secret) || "").trim();

console.log("WOO CHECK", {
  email: user.email,
  store_url: userBaseUrl,
  key_prefix: userConsumerKey.slice(0, 3),
  secret_prefix: userConsumerSecret.slice(0, 3),
  key_len: userConsumerKey.length,
  secret_len: userConsumerSecret.length,
});

  if (userBaseUrl && userConsumerKey && userConsumerSecret) {
    baseUrl = userBaseUrl;
    consumerKey = userConsumerKey;
    consumerSecret = userConsumerSecret;
  }
}
  } catch (error) {
    return res.status(401).json({
      error: "Token inválido o vencido",
    });
  }
}

if (String(message || "").startsWith("__check_sku__:")) {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan credenciales de WooCommerce.",
    });
  }

  const skuToCheck = String(message || "").replace("__check_sku__:", "").trim();

  if (!skuToCheck) {
    return res.json({
      ok: true,
      exists: false,
      product: null,
    });
  }

  const skuCheck = await findProductBySku({
    baseUrl,
    consumerKey,
    consumerSecret,
    sku: skuToCheck,
  });

  return res.json(skuCheck);
}

if (looksLikeEditProductSearchCommand(message)) {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan credenciales de WooCommerce.",
    });
  }

  const raw = String(message || "").replace("__search_edit_product__:", "").trim();
  const [modeRaw, ...rest] = raw.split("|");
  const value = rest.join("|").trim();
  const mode = String(modeRaw || "").trim().toLowerCase();

  if (!value) {
    return res.status(400).json({
      error: "Falta el valor a buscar.",
    });
  }

  if (mode === "sku") {
    const found = await findProductBySku({
      baseUrl,
      consumerKey,
      consumerSecret,
      sku: value,
    });

    let variations = [];

if (found.exists && found.product?.id) {
  const axios = (await import("axios")).default;

  const response = await axios.get(
    `${String(baseUrl || "").replace(/\/+$/, "")}/products/${found.product.id}/variations`,
    {
      params: {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        per_page: 100,
      },
    }
  );

  variations = response.data || [];
}

let attributeOptions = [];
let productImages = [];

if (found.exists && found.product?.id) {
  const axios = (await import("axios")).default;

  const productResponse = await axios.get(
    `${String(baseUrl || "").replace(/\/+$/, "")}/products/${found.product.id}`,
    {
      params: {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
    }
  );

  attributeOptions = extractGlobalAttributeOptions(productResponse.data || {});
  productImages = Array.isArray(productResponse.data?.images)
    ? productResponse.data.images
    : [];
}

return res.json({
  usedTool: true,
  mode: "sku",
  found: found.exists,
  exact: found.exists,
  product: found.product
  ? {
      ...found.product,
      categories: Array.isArray(found.product?.categories) ? found.product.categories : [],
      attributeOptions,
      images: productImages,
      variations: Array.isArray(variations) ? variations.map(mapVariationImagePreview) : [],
    }
  : null,
  candidates: found.candidates || [],
  variationSample: variations[0] || null,
});
  }

  if (mode === "nombre") {
    const found = await findProductsByName({
      baseUrl,
      consumerKey,
      consumerSecret,
      name: value,
    });

    const axios = (await import("axios")).default;

const enrichWithAttributeOptions = async (product) => {
  if (!product?.id) return product;

  const productResponse = await axios.get(
    `${String(baseUrl || "").replace(/\/+$/, "")}/products/${product.id}`,
    {
      params: {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
    }
  );

  const variationsResponse = await axios.get(
    `${String(baseUrl || "").replace(/\/+$/, "")}/products/${product.id}/variations`,
    {
      params: {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        per_page: 100,
      },
    }
  );

  const variations = Array.isArray(variationsResponse.data)
    ? variationsResponse.data
    : [];

  return {
    ...product,
    categories: Array.isArray(productResponse.data?.categories) ? productResponse.data.categories : [],
    attributeOptions: extractGlobalAttributeOptions(productResponse.data || {}),
    images: Array.isArray(productResponse.data?.images) ? productResponse.data.images : [],
    variations: variations.map(mapVariationImagePreview),
  };
};

const enrichedProducts = await Promise.all(
  (found.products || []).map(enrichWithAttributeOptions)
);

const enrichedCandidates = await Promise.all(
  (found.candidates || []).map(enrichWithAttributeOptions)
);

return res.json({
  usedTool: true,
  mode: "nombre",
  found: enrichedProducts.length > 0,
  exact: enrichedProducts.length > 0,
  product: enrichedProducts.length === 1 ? enrichedProducts[0] : null,
  products: enrichedProducts,
  candidates: enrichedCandidates,
});
  }

  return res.status(400).json({
    error: "Modo de búsqueda inválido. Usá sku o nombre.",
  });
}

if (message === "__list_categories__") {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan credenciales de WooCommerce.",
    });
  }

  try {
    const result = await listAllCategories({
      baseUrl,
      consumerKey,
      consumerSecret,
    });

    return res.json({
      usedTool: true,
      categories: result.categories || [],
    });
  } catch {
    return res.status(500).json({
      error: "No se pudieron obtener las categorías.",
    });
  }
}

if (message === "__get_store_info__") {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan credenciales de WooCommerce.",
    });
  }

  try {
    const store = await getStoreInfo(baseUrl, consumerKey, consumerSecret);

    return res.json({
      storeName: store?.name || "Tienda WooCommerce",
      storeUrl: store?.url || baseUrl,
    });
  } catch (err) {
    return res.status(500).json({
      error: "No se pudo obtener la tienda.",
    });
  }
}

if (looksLikeEditProductActionCommand(message)) {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan credenciales de WooCommerce.",
    });
  }

  const raw = String(message || "").replace("__edit_product_action__:", "").trim();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({
      error: "El JSON de edición es inválido.",
    });
  }

  const action = String(payload?.action || "");
  const productId = Number(payload?.productId);
  const regularPrice = String(payload?.regularPrice ?? "").replace(/[^\d]/g, "");
  const salePrice = String(payload?.salePrice ?? "").replace(/[^\d]/g, "");
  const cashPrice = String(payload?.cashPrice ?? "").replace(/[^\d]/g, "");

  if (!action || !productId) {
    return res.status(400).json({
      error: "Faltan action o productId.",
    });
  }

  // ✅ CAMBIAR PRECIO
  if (action === "cambiar_precio") {
    const regularPrice = String(payload?.regularPrice ?? "").replace(/[^\d]/g, "");

    if (!regularPrice) {
      return res.status(400).json({
        error: "Falta regularPrice.",
      });
    }

    result = await updateProductPrice({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      regularPrice,
      attributes: payload?.attributes || {},
      selectedCombinations: Array.isArray(payload?.selectedCombinations)
        ? payload.selectedCombinations
        : [],
    });
  }


  // ✅ AGREGAR / CAMBIAR PRECIO REBAJADO
  if (action === "agregar_precio_rebajado" || action === "cambiar_precio_rebajado") {
    const salePrice = String(payload?.salePrice ?? "").replace(/[^\d]/g, "");

    if (!salePrice) {
      return res.status(400).json({
        error: "Falta salePrice.",
      });
    }

    result = await updateProductPrice({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      salePrice,
      attributes: payload?.attributes || {},
      selectedCombinations: payload?.selectedCombinations || [],
    });
  }

  // ✅ QUITAR PRECIO REBAJADO
  if (action === "quitar_precio_rebajado") {
    result = await updateProductPrice({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      salePrice: "",
      attributes: payload?.attributes || {},
      selectedCombinations: payload?.selectedCombinations || [],
    });
  }

  if (action === "cambiar_categorias") {
    const cleanCategoryIds = Array.isArray(payload?.categoryIds)
      ? payload.categoryIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];

    if (cleanCategoryIds.length === 0) {
      return res.status(400).json({
        error: "Faltan categoryIds.",
      });
    }

    result = await updateProductCategories({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      categoryIds: cleanCategoryIds,
    });
  }

  if (action === "cambiar_precio_efectivo") {
    const cashPriceGeneral = String(payload?.cashPriceGeneral ?? "").replace(/[^\d]/g, "");

    if (!cashPriceGeneral) {
      return res.status(400).json({
        error: "Falta cashPriceGeneral.",
      });
    }

    result = await updateProductCashPrice({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      cashPriceGeneral,
      selectedCombinations: Array.isArray(payload?.selectedCombinations)
        ? payload.selectedCombinations
        : [],
    });
  }

  // ✅ CAMBIAR STOCK
    if (action === "cambiar_stock") {
      if (Array.isArray(payload?.variations) && payload.variations.length > 0) {
        const baseApiUrl = `${String(baseUrl || "").replace(/\/+$/, "")}`;
        const currentVariationsResponse = await axios.get(
          `${baseApiUrl}/products/${productId}/variations`,
          {
            params: {
              consumer_key: consumerKey,
              consumer_secret: consumerSecret,
              per_page: 100,
            },
          }
        );

        const currentVariations = Array.isArray(currentVariationsResponse?.data)
          ? currentVariationsResponse.data
          : [];
        const currentVariationsMap = new Map(
          currentVariations.map((item) => [Number(item?.id), item])
        );

        const stockResults = [];

        for (const v of payload.variations) {
          const currentVariation = currentVariationsMap.get(Number(v?.id));
          if (!currentVariation) {
            continue;
          }

          const nextManageStock = Boolean(v.manage_stock);
          const nextStockQuantity = nextManageStock
            ? Number(v.stock_quantity || 0)
            : null;
          const nextStockStatus = nextManageStock
            ? "instock"
            : String(v.stock_status || "instock");

          const currentManageStock = Boolean(currentVariation.manage_stock);
          const currentStockQuantity = currentVariation.stock_quantity == null
            ? null
            : Number(currentVariation.stock_quantity);
          const currentStockStatus = String(currentVariation.stock_status || "instock");

          const changed =
            currentManageStock !== nextManageStock ||
            currentStockQuantity !== nextStockQuantity ||
            currentStockStatus !== nextStockStatus;

          if (!changed) {
            continue;
          }

          const updatedVariationResponse = await axios.put(
            `${baseApiUrl}/products/${productId}/variations/${v.id}`,
            {
              stock_quantity: nextManageStock ? nextStockQuantity : null,
              stock_status: nextStockStatus,
              manage_stock: nextManageStock,
            },
            {
              params: {
                consumer_key: consumerKey,
                consumer_secret: consumerSecret,
              },
            }
          );

          const updatedVariation = updatedVariationResponse.data || {};
          stockResults.push({
            variation_id: updatedVariation.id || v.id,
            attributes_text: Array.isArray(updatedVariation?.attributes)
              ? updatedVariation.attributes
                  .map((attr) => `${String(attr?.name || "").trim()}: ${String(attr?.option || "").trim()}`)
                  .join(" | ")
              : `Variación #${updatedVariation.id || v.id}`,
            manage_stock: updatedVariation.manage_stock ?? nextManageStock,
            stock_quantity: updatedVariation.stock_quantity ?? null,
            stock_status: updatedVariation.stock_status || nextStockStatus,
          });
        }

        const productResponse = await axios.get(
          `${baseApiUrl}/products/${productId}`,
          {
            params: {
              consumer_key: consumerKey,
              consumer_secret: consumerSecret,
            },
          }
        );

        result = {
          ok: true,
          action: "update_stock_advanced",
          scope: "variations",
          product_id: productId,
          name: productResponse?.data?.name || "",
          updated_count: stockResults.length,
          results: stockResults,
        };
      } else {
        result = await updateStockAdvanced({
          baseUrl,
          consumerKey,
          consumerSecret,
          productId,
          manageStock: Boolean(payload?.manageStock),
          stockQuantity: payload?.stockQuantity,
          stockStatus: String(payload?.stockStatus || "instock"),
          selectedCombinations: Array.isArray(payload?.selectedCombinations)
            ? payload.selectedCombinations
            : [],
        });
      }
    }

     // ✅ AGREGAR FOTOS AL PRODUCTO
if (action === "agregar_fotos_producto") {
  const files = Array.isArray(req.files) ? req.files : [];

  if (!files.length) {
    return res.status(400).json({
      error: "Faltan imágenes.",
    });
  }

  const uploadedImages = await saveImagesAndBuildUrls(files, req.body, req);

  if (!uploadedImages.length) {
    return res.status(400).json({
      error: "No se pudieron preparar las imágenes.",
    });
  }

  result = await addProductImages({
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    images: uploadedImages.map((img) => ({ src: img.src })),
  });
}

// ❌ ELIMINAR FOTOS DEL PRODUCTO
if (action === "eliminar_fotos_producto") {
  const imageIds = Array.isArray(payload?.imageIds)
    ? payload.imageIds.map((id) => Number(id)).filter(Boolean)
    : [];

  if (!imageIds.length) {
    return res.status(400).json({
      error: "Faltan imageIds.",
    });
  }

  result = await removeProductImages({
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    imageIdsToRemove: imageIds,
  });
}

// ORDENAR FOTOS DEL PRODUCTO
if (action === "ordenar_fotos_producto") {
  const orderedImageIds = Array.isArray(payload?.orderedImageIds)
    ? payload.orderedImageIds.map((id) => Number(id)).filter(Boolean)
    : [];

  if (!orderedImageIds.length) {
    return res.status(400).json({
      error: "Faltan orderedImageIds.",
    });
  }

  result = await reorderProductImages({
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    orderedImageIds,
  });
}

// CAMBIAR FOTOS DE VARIANTES
if (action === "cambiar_fotos_variantes") {
  const files = Array.isArray(req.files) ? req.files : [];

  if (!files.length) {
    return res.status(400).json({
      error: "Faltan imágenes.",
    });
  }

  const uploadedImages = await saveImagesAndBuildUrls(files, req.body, req);

  if (!uploadedImages.length) {
    return res.status(400).json({
      error: "No se pudieron preparar las imágenes.",
    });
  }

  const firstImage = uploadedImages[0];

  result = await assignImageToSelectedVariations({
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    imageSrc: firstImage.src,
    selectedCombinations: Array.isArray(payload?.selectedCombinations)
      ? payload.selectedCombinations
      : [],
  });
}

// ✅ QUITAR FOTOS VARIANTES
if (action === "quitar_fotos_variantes") {
  result = await removeImageFromSelectedVariations({
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    selectedCombinations: Array.isArray(payload?.selectedCombinations)
      ? payload.selectedCombinations
      : [],
  });
}

  // ✅ CAMBIAR DESCRIPCIÓN CORTA
if (action === "cambiar_descripcion") {
  const description = payload?.description;

  if (description == null) {
    return res.status(400).json({
      error: "Falta description.",
    });
  }

  const updated = await updateWooProduct(
    baseUrl,
    consumerKey,
    consumerSecret,
    productId,
    {
      short_description: String(description),
    }
  );

  return res.json({
    usedTool: true,
    reply: `Descripción corta actualizada correctamente para ${updated.name}.`,
    product: {
      id: updated.id,
      name: updated.name,
      sku: updated.sku || "",
      short_description: updated.short_description || "",
    },
  });
}

// ✅ MOVER PRODUCTO POR FECHA (ANTES / DESPUÉS)
if (action === "mover_producto_fecha") {
  const targetProductId = Number(payload?.targetProductId);
  const position = String(payload?.position || "").trim().toLowerCase();

  if (!targetProductId) {
    return res.status(400).json({
      error: "Falta targetProductId.",
    });
  }

  if (!["before", "after"].includes(position)) {
    return res.status(400).json({
      error: "position debe ser 'before' o 'after'.",
    });
  }

  if (productId === targetProductId) {
    return res.status(400).json({
      error: "No podés mover un producto respecto de sí mismo.",
    });
  }

  const targetRes = await axios.get(
    `${String(baseUrl || "").replace(/\/+$/, "")}/products/${targetProductId}`,
    {
      params: {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
    }
  );

  const targetProduct = targetRes.data || {};

  console.log("TARGET PRODUCT FECHAS", {
    id: targetProduct?.id,
    name: targetProduct?.name,
    date_created: targetProduct?.date_created,
    date_created_gmt: targetProduct?.date_created_gmt,
    date_modified: targetProduct?.date_modified,
    date_modified_gmt: targetProduct?.date_modified_gmt,
  });

  const targetDateRaw =
    String(targetProduct?.date_created_gmt || "").trim() ||
    String(targetProduct?.date_created || "").trim() ||
    String(targetProduct?.date_modified_gmt || "").trim() ||
    String(targetProduct?.date_modified || "").trim();

  console.log("TARGET DATE RAW", targetDateRaw);

  if (!targetDateRaw) {
    return res.status(400).json({
      error: "No se pudo obtener la fecha del producto de referencia.",
    });
  }

  const targetDate = new Date(targetDateRaw);

  if (Number.isNaN(targetDate.getTime())) {
    return res.status(400).json({
      error: "La fecha del producto de referencia no es válida.",
    });
  }

  console.log("TARGET DATE PARSED", targetDate.toISOString());

  if (position === "before") {
    targetDate.setMinutes(targetDate.getMinutes() - 1);
  } else {
    targetDate.setMinutes(targetDate.getMinutes() + 1);
  }

  const newDateISO = targetDate.toISOString();

  console.log("NEW DATE TO APPLY", newDateISO);

  const updated = await updateWooProduct(
  baseUrl,
  consumerKey,
  consumerSecret,
  productId,
  {
    date_created_gmt: newDateISO,
  }
);

  console.log("UPDATED PRODUCT RESULT", {
    id: updated?.id,
    name: updated?.name,
    date_created: updated?.date_created,
    date_created_gmt: updated?.date_created_gmt,
    date_modified: updated?.date_modified,
    date_modified_gmt: updated?.date_modified_gmt,
  });

  result = {
    ok: true,
    product_id: updated.id,
    name: updated.name,
    target_name: targetProduct.name,
    position,
    new_date: newDateISO,
  };
}

// ✅ RESPUESTA FINAL ÚNICA
if (result) {
  const variationLines = Array.isArray(result.updated_variation_details)
    ? result.updated_variation_details
        .map((item) => `- ${item.attributes_text || `Variación #${item.id}`}`)
        .join("\n")
    : "";

  let reply = "Producto actualizado correctamente.";

  if (action === "cambiar_precio") {
    if (result.type === "variable") {
      reply =
        result.updated_variations === 1
          ? `Precio normal actualizado a ${regularPrice} en esta variación de ${result.name}:\n${variationLines}`
          : `Precio normal actualizado a ${regularPrice} en estas ${result.updated_variations} variaciones de ${result.name}:\n${variationLines}`;
    } else {
      reply = `Precio normal actualizado a ${result.regular_price || regularPrice} en ${result.name}.`;
    }
  }

  if (action === "agregar_precio_rebajado") {
    if (result.type === "variable") {
      reply =
        result.updated_variations === 1
          ? `Precio rebajado agregado: ${salePrice} en esta variación de ${result.name}:\n${variationLines}`
          : `Precio rebajado agregado: ${salePrice} en estas ${result.updated_variations} variaciones de ${result.name}:\n${variationLines}`;
    } else {
      reply = `Precio rebajado agregado: ${result.sale_price || salePrice} en ${result.name}.`;
    }
  }

  if (action === "cambiar_precio_rebajado") {
    if (result.type === "variable") {
      reply =
        result.updated_variations === 1
          ? `Precio rebajado cambiado a ${salePrice} en esta variación de ${result.name}:\n${variationLines}`
          : `Precio rebajado cambiado a ${salePrice} en estas ${result.updated_variations} variaciones de ${result.name}:\n${variationLines}`;
    } else {
      reply = `Precio rebajado cambiado a ${result.sale_price || salePrice} en ${result.name}.`;
    }
  }

  if (action === "quitar_precio_rebajado") {
    if (result.type === "variable") {
      reply =
        result.updated_variations === 1
          ? `Precio rebajado quitado en esta variación de ${result.name}:\n${variationLines}`
          : `Precio rebajado quitado en estas ${result.updated_variations} variaciones de ${result.name}:\n${variationLines}`;
    } else {
      reply = `Precio rebajado quitado en ${result.name}.`;
    }
  }
    if (action === "cambiar_precio_efectivo") {
      if (result.type === "variable") {
        reply =
          result.updated_variations === 1
            ? `Precio en efectivo cambiado a ${result.cash_price_general || cashPrice} en esta variación de ${result.name}:
${variationLines}`
            : `Precio en efectivo cambiado a ${result.cash_price_general || cashPrice} en estas ${result.updated_variations} variaciones de ${result.name}:
${variationLines}`;
      } else {
        reply = `Precio en efectivo cambiado a ${result.cash_price_general || cashPrice} en ${result.name}.`;
      }
    }
    if (action === "cambiar_stock") {
      if (result.scope === "variations") {
        const translateStockStatus = (status) => {
          if (status === "instock") return "Disponible";
          if (status === "outofstock") return "Agotado";
          return status || "";
        };

        const stockLines = Array.isArray(result.results)
          ? result.results
              .map((item) => {
                const label = item.attributes_text || `Variación #${item.variation_id}`;
                return item.manage_stock
                  ? `- ${label}: ${item.stock_quantity ?? 0} unidades`
                  : `- ${label}: ${translateStockStatus(item.stock_status)}`;
              })
              .join("\n")
          : "";

        if (result.updated_count === 0) {
          reply = `No hubo cambios en las variaciones de ${result.name}.`;
        } else {
          reply =
            result.updated_count === 1
              ? `Se actualizó 1 variación de ${result.name}:\n${stockLines}`
              : `Se actualizaron ${result.updated_count} variaciones de ${result.name}:\n${stockLines}`;
        }
      } else {
        reply = `Stock actualizado correctamente en ${result.name}.`;
      }
    }

    if (action === "agregar_fotos_producto") {
    reply = `Fotos agregadas correctamente en ${result.name}.`;
  }

  if (action === "eliminar_fotos_producto") {
  reply = `Fotos eliminadas correctamente en ${result.name}.`;
}

if (action === "ordenar_fotos_producto") {
  reply = `Fotos reordenadas correctamente en ${result.name}.`;
}
  
if (action === "cambiar_fotos_variantes") {
  const variationLines = Array.isArray(result.results)
    ? result.results
        .map((item) => `- ${item.attributes_text || `Variación #${item.variation_id}`}`)
        .join("\n")
    : "";

  reply =
    result.updated_count === 1
      ? `Foto asignada correctamente a 1 variante de ${result.name}:\n${variationLines}`
      : `Foto asignada correctamente a ${result.updated_count} variantes de ${result.name}:\n${variationLines}`;
}

if (action === "quitar_fotos_variantes") {
  const variationLines = Array.isArray(result.results)
    ? result.results
        .map((item) => `- ${item.attributes_text || `Variación #${item.variation_id}`}`)
        .join("\n")
    : "";

  reply =
    result.updated_count === 1
      ? `Foto eliminada de 1 variante de ${result.name}:\n${variationLines}`
      : `Foto eliminada de ${result.updated_count} variantes de ${result.name}:\n${variationLines}`;
}

if (action === "mover_producto_fecha") {
  reply =
    result.position === "before"
      ? `${result.name} fue movido antes de ${result.target_name}.`
      : `${result.name} fue movido después de ${result.target_name}.`;
}

  return res.json({
    usedTool: true,
    reply,
    product: {
      id: result.product_id,
      name: result.name,
      type: result.type || "",
      regular_price: result.regular_price || "",
      sale_price: result.sale_price || "",
    },
    toolResult: result,
  });

}

  return res.status(400).json({
    error: "Acción no reconocida.",
  });
}


if (looksLikeDeleteProductCommand(message)) {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan credenciales de WooCommerce.",
    });
  }

  const skus = extractDeleteSkus(message);
  const names = extractDeleteNames(message);

  if (skus.length === 0 && names.length === 0) {
    return res.status(400).json({
      error: "Mandame al menos un sku o un nombre.",
      example: "eliminar producto\nsku: REM-001, REM-002",
    });
  }

  const productsToDelete = [];
  const notFound = [];
  const ambiguous = [];

  for (const sku of skus) {
    const found = await findProductBySku({
      baseUrl,
      consumerKey,
      consumerSecret,
      sku,
    });

    if (found?.exists && found?.product?.id) {
      productsToDelete.push(found.product);
    } else {
      notFound.push(`SKU: ${sku}`);
    }
  }

  for (const name of names) {
    const foundByName = await findProductsByName({
      baseUrl,
      consumerKey,
      consumerSecret,
      name,
    });

    if ((foundByName?.products || []).length === 1) {
      productsToDelete.push(foundByName.products[0]);
      continue;
    }

    if ((foundByName?.products || []).length > 1) {
      ambiguous.push({
        name,
        matches: foundByName.products,
      });
      continue;
    }

    if ((foundByName?.candidates || []).length > 1) {
      ambiguous.push({
        name,
        matches: foundByName.candidates.slice(0, 5),
      });
      continue;
    }

    notFound.push(`Nombre: ${name}`);
  }

  const uniqueProducts = Array.from(
    new Map(productsToDelete.map((product) => [product.id, product])).values()
  );

  if (ambiguous.length > 0) {
    return res.status(400).json({
      error: `Hay nombres ambiguos. Decime el SKU o el nombre exacto.\n\n${ambiguous
        .map(
          (item) =>
            `Nombre: ${item.name}\nCoincidencias: ${item.matches
              .map((p) => `${p.name}${p.sku ? ` (SKU: ${p.sku})` : ""}`)
              .join(", ")}`
        )
        .join("\n\n")}`,
    });
  }

  if (uniqueProducts.length === 0) {
    return res.status(404).json({
      error: `No encontré productos para eliminar.\n${notFound.join("\n")}`,
    });
  }

  const deletedResults = [];

  for (const product of uniqueProducts) {
    result = await deleteProductById({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId: product.id,
    });

    deletedResults.push(result.product);
  }

  const replyLines = [
    deletedResults.length === 1
      ? `Producto eliminado correctamente: ${deletedResults[0].name || `#${deletedResults[0].id}`}.`
      : `Se eliminaron ${deletedResults.length} productos correctamente.`,
    ...deletedResults.map(
      (product) => `- ${product.name || `#${product.id}`}${product.sku ? ` (SKU: ${product.sku})` : ""}`
    ),
  ];

  if (notFound.length > 0) {
    replyLines.push("");
    replyLines.push("No encontrados:");
    replyLines.push(...notFound.map((item) => `- ${item}`));
  }

  return res.json({
    usedTool: true,
    reply: replyLines.join("\n"),
    toolResult: {
      deleted: deletedResults,
      notFound,
    },
  });
}

const detectedIntent = detectCommerceIntent(message);

const pendingDraft = getPendingDraft(resolvedAgentId);

if (pendingDraft && looksLikeOnlyCategoryReply(message)) {

  const categoryName = message.trim();

  let categories = [];

  const categoryResult = await ensureCategoryByName({
    baseUrl,
    consumerKey,
    consumerSecret,
    name: categoryName,
  });

  categories = [categoryResult.category.id];

  result = await createSimpleProduct({
    baseUrl,
    consumerKey,
    consumerSecret,
    name: pendingDraft.name,
    sku: pendingDraft.sku || "",
    regularPrice: pendingDraft.regularPrice,
    description: pendingDraft.description || "",
    shortDescription: pendingDraft.shortDescription || "",
    categories,
    stockQuantity: pendingDraft.stockQuantity,
    manageStock: true,
  });

  clearPendingDraft(resolvedAgentId);

  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: true,
    reply: `Producto creado correctamente en la categoría "${categoryName}": ${result.name}.`,
    toolResult: result,
  });

}

if (looksLikeOnlyCategoryReply(message)) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      `Perfecto. Ahora mandame el producto completo de nuevo y dejá esa categoría al final o en una línea sola. Ejemplo:\ncrear producto simple\nnombre: Remera básica\nsku: REM-001\nprecio: 15000\nstock: 5\n${message.trim()}`,
  });
}

// si el mensaje ya tiene producto + líneas de stock no preguntamos
if (
  detectedIntent === "ambiguous" &&
  !looksLikeColorSizeStockBatch(message) &&
  !looksLikeColorOnlyStockBatch(message) &&
  !looksLikeCompactVariableCreateByColor(message) &&
  !looksLikeSupplierVariableProductMessage(message)
) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      "Necesito confirmar algo antes de seguir: ¿esto es para cargar un producto nuevo o para actualizar un producto existente? Si es existente, pasame producto/SKU/variación si lo tenés. Si es nuevo, pasame nombre, precio, stock, categorías y atributos.",
  });
}

        if (looksLikeExistingProductReply(message)) {
      return res.json({
        agentId: agent.id,
        agentName: agent.name,
        usedTool: false,
        reply:
          "Perfecto. Decime ahora qué producto existente querés tocar. Pasame al menos uno de estos datos: productId, SKU o nombre exacto. Y además decime qué querés cambiar: stock, precio, manage_stock o variaciones. Si son variaciones, pasame variationId o atributo + cantidad.",
      });
    }

 

        if (looksLikeSimpleProductCreateCommand(message)) {
      if (!baseUrl || !consumerKey || !consumerSecret) {
        return res.status(500).json({
          error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
        });
      }

      const name = extractField(message, "nombre");
const sku = extractField(message, "sku");
const regularPriceRaw = extractField(message, "precio");
const subcategoryName = extractField(message, "subcategoria");
const categoryIdsRaw = extractField(message, "categorias_ids");
const selectedCategoryIds = String(categoryIdsRaw || "")
  .split(",")
  .map((item) => Number(String(item || "").trim()))
  .filter((id) => Number.isFinite(id) && id > 0);
const salePriceRaw = extractField(message, "precio_rebajado");
const cashPriceRaw = extractField(message, "precio_efectivo");
const stockQuantityRaw = extractField(message, "stock");
const categoryName = extractField(message, "categoria") || extractLooseCategoryValue(message);

      const regularPrice = regularPriceRaw ? Number(regularPriceRaw) : null;
const salePrice = salePriceRaw
  ? Number(String(salePriceRaw).replace(/[^\d]/g, ""))
  : null;
const cashPrice = cashPriceRaw
  ? Number(String(cashPriceRaw).replace(/[^\d]/g, ""))
  : null;
const stockQuantity = stockQuantityRaw ? Number(stockQuantityRaw) : null;
      const description = extractField(message, "descripcion");
      const shortDescription = extractField(message, "descripcion_corta");

    if (!name || regularPrice == null || Number.isNaN(regularPrice)) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
  "Para crear un producto simple pasame al menos: nombre y precio. Si querés, también podés agregar SKU entre medio. Ejemplo:\nnombre: Remera básica\nsku: REM-001\nprecio: 15000",
  });
}

if (!categoryName && selectedCategoryIds.length === 0) {
  savePendingDraft(resolvedAgentId, {
  type: "simple_product",
  name,
  sku,
  regularPrice,
  stockQuantity: stockQuantity == null ? null : stockQuantity,
  description,
  shortDescription,
});

  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      "¿En qué categoría querés que vaya este producto? Podés responder solo con el nombre, por ejemplo: Remeras",
  });
}


const categorySuggestions = await suggestCategoriesByName({
  baseUrl,
  consumerKey,
  consumerSecret,
  search: categoryName,
});

const exactCategory = categorySuggestions.categories.find(
  (c) => String(c.name || "").trim().toLowerCase() === String(categoryName || "").trim().toLowerCase()
);

if (!exactCategory && categorySuggestions.categories.length > 0) {
  const suggestedNames = categorySuggestions.categories.map((c) => c.name).join(", ");

  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      `Encontré categorías parecidas para "${categoryName}": ${suggestedNames}. Respondeme con una de esas categorías o con un nombre nuevo si querés que cree una nueva.`,
  });
}

if (stockQuantityRaw && Number.isNaN(stockQuantity)) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply: "El stock del producto simple no es válido. Usá por ejemplo: stock: 5",
  });
}

let categories = [];

if (selectedCategoryIds.length > 0) {
  categories = selectedCategoryIds;
} else if (categoryName) {
  const categoryResult = await ensureCategoryPath({
    baseUrl,
    consumerKey,
    consumerSecret,
    categoryName,
    subcategoryName,
  });

  categories = categoryResult.categories;
}

let uploadedImages = [];

if (files.length > 0) {
  uploadedImages = await saveImagesAndBuildUrls(files, req.body, req);
}

   result = await createSimpleProduct({
  baseUrl,
  consumerKey,
  consumerSecret,
  name,
  sku,
  regularPrice,
  salePrice: Number.isFinite(salePrice) ? salePrice : "",
  cashPrice: Number.isFinite(cashPrice) ? cashPrice : "",
  description,
  shortDescription,
  categories,
  images: uploadedImages.map((img) => img.src),
  stockQuantity: stockQuantity == null ? null : stockQuantity,
  manageStock: true,
});



      return res.json({
        agentId: agent.id,
        agentName: agent.name,
        usedTool: true,
        reply: `Producto simple creado correctamente: ${result.name}.`,
        toolResult: result,
      });
    }

    if (looksLikeVariableProductCreateReply(message)) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      "Perfecto. Pasame ahora el producto variable en este formato:\n\nnombre: Remera básica\ndescripcion: ...\ndescripcion_corta: ...\ncategorias: 12, 15\natributos:\nColor: Negro, Blanco\nTalle: S, M, L\nvariaciones:\nColor: Negro, Talle: S | precio: 10000 | stock: 5\nColor: Negro, Talle: M | precio: 10000 | stock: 8\nColor: Blanco, Talle: S | precio: 11000 | stock: 4",
  });
}

    if (
  looksLikeHumanVariableProductCreate(message) ||
  (
    looksLikeVariableProductCreateCommand(message) &&
    message.toLowerCase().includes("variaciones:")
  )
) {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
    });
  }

  const name = extractField(message, "nombre");
const sku = extractField(message, "sku");
const description = extractField(message, "descripcion");
const shortDescription = extractField(message, "descripcion_corta");
const categoryName = extractField(message, "categoria");
const subcategoryName = extractField(message, "subcategoria");
const categoryIdsRaw = extractField(message, "categorias_ids");
const selectedCategoryIds = String(categoryIdsRaw || "")
  .split(",")
  .map((item) => Number(String(item || "").trim()))
  .filter((id) => Number.isFinite(id) && id > 0);
const attributesRaw = extractBlock(message, "atributos", [
  "stock",
  "categoria",
  "categorias_ids",
  "subcategoria",
  "descripcion",
  "descripcion_corta",
  "precio",
  "precio_rebajado",
  "precio_efectivo",
  "variaciones",
]);
const variationsRaw = extractBlock(message, "variaciones", [
  "stock",
  "categoria",
  "categorias_ids",
  "subcategoria",
  "descripcion",
  "descripcion_corta",
  "precio",
  "precio_rebajado",
  "precio_efectivo",
]);

const attributes = parseVariableAttributesText(attributesRaw);
let variations = parseVariableVariationsText(variationsRaw);

const regularPriceRaw = extractField(message, "precio");
const salePriceRaw = extractField(message, "precio_rebajado");
const cashPriceRaw = extractField(message, "precio_efectivo");

const regularPrice = regularPriceRaw
  ? Number(String(regularPriceRaw).replace(/[^\d]/g, ""))
  : null;

const salePrice = salePriceRaw
  ? Number(String(salePriceRaw).replace(/[^\d]/g, ""))
  : null;

const cashPrice = cashPriceRaw
  ? Number(String(cashPriceRaw).replace(/[^\d]/g, ""))
  : null;

const stockBlockMatch = String(message || "").match(/\nstock\s*:\s*([\s\S]*?)(\ncategoria\s*:|\nsubcategoria\s*:|$)/i);
const stockRaw = stockBlockMatch ? stockBlockMatch[1].trim() : "";
const stockMap = parseSupplierStockBlock(stockRaw);

if (
  variations.length === 0 &&
  Number.isFinite(regularPrice) &&
  attributes.length > 0
) {
  const colorAttr = attributes.find(
    (attr) => normalizeKeyName(attr.name) === "color"
  );
  const talleAttr = attributes.find(
    (attr) => normalizeKeyName(attr.name) === "talle"
  );

  const colors = colorAttr?.options || [];
  const sizes = talleAttr?.options || [];

  if (colors.length > 0 && sizes.length > 0) {
    variations = buildSupplierVariableVariations({
      colors,
      sizes,
      price: regularPrice,
      salePrice,
      stockMap: stockRaw ? stockMap : null,
    });
  } else if (colors.length > 0) {
  variations = colors.map((color) => {
    const variation = {
      attributes: [{ name: "Color", option: color }],
      regular_price: String(regularPrice),
    };

    if (Number.isFinite(salePrice)) {
      variation.sale_price = String(salePrice);
    }

    const colorKey = `${normalizeKeyName(color)}__`;
    const hasStock = stockRaw && stockMap.has(colorKey);

    if (hasStock) {
      variation.stock_quantity = Number(stockMap.get(colorKey));
    }

    return variation;
  });
} else if (sizes.length > 0) {
  variations = sizes.map((size) => {
    const variation = {
      attributes: [{ name: "Talle", option: size }],
      regular_price: String(regularPrice),
    };

    if (Number.isFinite(salePrice)) {
      variation.sale_price = String(salePrice);
    }

    const sizeKey = `__${normalizeKeyName(size)}`;
    const hasStock = stockRaw && stockMap.has(sizeKey);

    if (hasStock) {
      variation.stock_quantity = Number(stockMap.get(sizeKey));
    }

    return variation;
  });
}
}

  if (!name) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      "Falta el nombre del producto. Usá el formato: nombre: ...",
  });
}

if (attributes.length === 0) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      "No pude interpretar los atributos del producto variable. Usá por ejemplo:\natributos:\nColor: Negro, Blanco\nTalle: S, M, L",
  });
}

if (variations.length === 0) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      "No pude armar las variaciones del producto. Revisá que hayas cargado precio, atributos válidos y, si corresponde, stock por variación.",
  });
}

const globalAttributesEnsured = [];

for (const attr of attributes) {
  const ensured = await ensureGlobalAttributeWithTerms({
    baseUrl,
    consumerKey,
    consumerSecret,
    attributeName: attr.name,
    options: attr.options,
  });

  globalAttributesEnsured.push(ensured);
}

const normalizedVariations = variations.map((variation) => ({
  ...variation,
  attributes: variation.attributes.map((variationAttr) => {
    const matchedGlobal = globalAttributesEnsured.find(
      (item) =>
        normalizeKeyName(item.attribute.name) === normalizeKeyName(variationAttr.name)
    );

    return {
      ...(matchedGlobal?.attribute?.id
        ? { id: Number(matchedGlobal.attribute.id) }
        : {}),
      name: matchedGlobal ? matchedGlobal.attribute.name : variationAttr.name,
      option: String(variationAttr.option || "").trim(),
    };
  }),
}));

let uploadedImages = [];

if (files.length > 0) {
  uploadedImages = await saveImagesAndBuildUrls(files, req.body, req);
}

  let categories = [];

if (selectedCategoryIds.length > 0) {
  categories = selectedCategoryIds;
} else if (categoryName) {
  const categoryResult = await ensureCategoryPath({
    baseUrl,
    consumerKey,
    consumerSecret,
    categoryName,
    subcategoryName,
  });

  categories = categoryResult.categories;
}
console.log("VARIABLE SKU DEBUG", {
  name,
  sku,
  message,
});

result = await createVariableProduct({
  baseUrl,
  consumerKey,
  consumerSecret,
  name,
  sku,
  cashPrice: Number.isFinite(cashPrice) ? cashPrice : "",
  description,
  shortDescription,
  categories,
  attributes: globalAttributesEnsured.map((item) => ({
    id: item.attribute.id,
    name: item.attribute.name,
    slug: item.attribute.slug,
    options: item.terms.map((term) => term.name),
  })),
  variations: normalizedVariations,
  images: uploadedImages,
});

  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: true,
    reply: `Producto variable creado correctamente: ${result.name}. Variaciones creadas: ${result.variations_created}.`,
    toolResult: result,
  });
}

if (looksLikeSupplierVariableProductMessage(message)) {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
    });
  }

  const parsed = parseSupplierVariableProductMessage(message);

  if (!parsed.name) {
    return res.json({
      agentId: agent.id,
      agentName: agent.name,
      usedTool: false,
      reply: "Falta el nombre del producto.",
    });
  }

  if (!Number.isFinite(parsed.price)) {
    return res.json({
      agentId: agent.id,
      agentName: agent.name,
      usedTool: false,
      reply: "No pude interpretar el precio del producto.",
    });
  }

  if (!parsed.categoryName) {
    return res.json({
      agentId: agent.id,
      agentName: agent.name,
      usedTool: false,
      reply: "Falta la categoría del producto.",
    });
  }

  if (!parsed.colors.length) {
    return res.json({
      agentId: agent.id,
      agentName: agent.name,
      usedTool: false,
      reply: "No pude interpretar los colores.",
    });
  }

  if (!parsed.sizes.length) {
    return res.json({
      agentId: agent.id,
      agentName: agent.name,
      usedTool: false,
      reply: "No pude interpretar los talles.",
    });
  }

    if (message.toLowerCase().includes("stock:") && parsed.stockLinesParsed === 0) {
    return res.json({
      agentId: agent.id,
      agentName: agent.name,
      usedTool: false,
      reply: "Marcaste stock por variación, pero no pude leer ninguna línea de stock. Revisá las cantidades de cada combinación.",
    });
  }

    const categoryResult = await ensureCategoryPath({
    baseUrl,
    consumerKey,
    consumerSecret,
    categoryName: parsed.categoryName,
    subcategoryName: parsed.subcategoryName,
  });

  let uploadedImages = [];

if (files.length > 0) {
  uploadedImages = await saveImagesAndBuildUrls(files, req.body, req);
}

    const globalAttributesEnsured = [];

for (const attr of parsed.attributes) {
  const ensured = await ensureGlobalAttributeWithTerms({
    baseUrl,
    consumerKey,
    consumerSecret,
    attributeName: attr.name,
    options: attr.options,
  });

  globalAttributesEnsured.push(ensured);
}

const normalizedVariations = parsed.variations.map((variation) => ({
  ...variation,
  attributes: variation.attributes.map((variationAttr) => {
    const matchedGlobal = globalAttributesEnsured.find(
      (item) =>
        normalizeKeyName(item.attribute.name) === normalizeKeyName(variationAttr.name)
    );

    return {
      ...(matchedGlobal?.attribute?.id
        ? { id: Number(matchedGlobal.attribute.id) }
        : {}),
      name: matchedGlobal ? matchedGlobal.attribute.name : variationAttr.name,
      option: String(variationAttr.option || "").trim(),
    };
  }),
}));

result = await createVariableProduct({
  baseUrl,
  consumerKey,
  consumerSecret,
  name: parsed.name,
  description: "",
  shortDescription: parsed.shortDescription || "",
  categories: categoryResult.categories,
  attributes: globalAttributesEnsured.map((item) => ({
    id: item.attribute.id,
    name: item.attribute.name,
    slug: item.attribute.slug,
    options: item.terms.map((term) => term.name),
  })),
  variations: normalizedVariations,
  images: uploadedImages,
});

  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: true,
    reply: `Producto variable creado correctamente: ${result.name}. Variaciones creadas: ${result.variations_created}.`,
    toolResult: {
      ...result,
      parsedInput: {
  category: parsed.categoryName,
  colors: parsed.colors,
  sizes: parsed.sizes,
  price: parsed.price,
  hasStockBlock: parsed.hasStockBlock,
  stockLinesParsed: parsed.stockLinesParsed,
},
    },
  });
}

  if (looksLikeCompactVariableCreateByColor(message)) {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({
      error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
    });
  }

  const parsed = parseCompactVariableCreateByColor(message);

  if (!parsed.name || !parsed.price || !parsed.variations.length) {
    return res.json({
      agentId: agent.id,
      agentName: agent.name,
      usedTool: false,
      reply:
        "No pude interpretar bien el mensaje para crear el producto. Necesito nombre, precio y al menos 1 línea de color con stock.",
    });
  }

let uploadedImages = [];

if (files.length > 0) {
  uploadedImages = await saveImagesAndBuildUrls(files, req.body, req);
}



  result = await createVariableProduct({
  baseUrl,
  consumerKey,
  consumerSecret,
  name: parsed.name,
  description: "",
  shortDescription: "",
  categories: [],
  attributes: parsed.attributes,
  variations: parsed.variations,
  images: uploadedImages,
});

  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: true,
    reply: `Producto variable creado correctamente: ${result.name}. Variaciones creadas: ${result.variations_created}.`,
    toolResult: result,
  });
}


        if (looksLikeNewProductReply(message)) {
      return res.json({
        agentId: agent.id,
        agentName: agent.name,
        usedTool: false,
        reply:
          "Perfecto. Para cargar un producto nuevo pasame estos datos: nombre, tipo (simple o variable), precio, stock, categorías, descripción y, si corresponde, atributos/variaciones con sus precios y stock.",
      });
    }

     
if (looksLikeColorSizeStockBatch(message)) {
      if (!baseUrl || !consumerKey || !consumerSecret) {
        return res.status(500).json({
          error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
        });
      }

      const productSearch = extractProductSearch(message);
      const lines = extractColorSizeStockLines(message);

      result = await applyStockUpdateByColorAndSize({
        baseUrl,
        consumerKey,
        consumerSecret,
        productSearch,
        lines,
      });

      if (!result.ok || !result.applied) {
        return res.json({
          agentId: agent.id,
          agentName: agent.name,
          usedTool: true,
          reply: "No pude aplicar los cambios porque hubo un problema al preparar o validar el plan.",
          toolResult: result,
        });
      }

      return res.json({
        agentId: agent.id,
        agentName: agent.name,
        usedTool: true,
        reply: `Stock actualizado correctamente para ${result.summary.applied_count} variaciones del producto ${result.product.name}.`,
        toolResult: result,
      });
    }

        if (looksLikeColorOnlyStockBatch(message)) {
      if (!baseUrl || !consumerKey || !consumerSecret) {
        return res.status(500).json({
          error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
        });
      }

      const productSearch = extractProductSearch(message);
      const lines = extractColorOnlyStockLines(message);

      const plan = await planStockUpdateByColorOnly({
        baseUrl,
        consumerKey,
        consumerSecret,
        productSearch,
        lines,
      });

      if (!plan.ok || !plan.found) {
        return res.json({
          agentId: agent.id,
          agentName: agent.name,
          usedTool: true,
          reply: "No encontré el producto variable para preparar la actualización.",
          toolResult: plan,
        });
      }

      if (plan.errors.length > 0) {
        return res.json({
          agentId: agent.id,
          agentName: agent.name,
          usedTool: true,
          reply: "Necesito que me aclares el talle en algunas líneas antes de actualizar el stock.",
          toolResult: plan,
        });
      }

      return res.json({
        agentId: agent.id,
        agentName: agent.name,
        usedTool: true,
        reply: "Encontré las variaciones correctamente. Ya podés usar el formato con talle para actualizar.",
        toolResult: plan,
      });
    }


    if (looksLikeEnableManageStockCommand(message)) {
      if (!baseUrl || !consumerKey || !consumerSecret) {
        return res.status(500).json({
          error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
        });
      }

      const productId = extractNumber(message, "productId");
      const variationId = extractNumber(message, "variationId");

      if (!productId || !variationId) {
        return res.status(400).json({
          error: "Faltan productId o variationId en el mensaje",
          example: "activar manage_stock productId=1153 variationId=1159",
        });
      }

      result = await enableManageStockForVariation({
        baseUrl,
        consumerKey,
        consumerSecret,
        productId,
        variationId,
      });

      return res.json({
        agentId: agent.id,
        agentName: agent.name,
        usedTool: true,
        reply: `Manage stock activado correctamente en la variación ${variationId} del producto ${productId}.`,
        toolResult: result,
      });
    }

    if (looksLikeDirectStockCommand(message)) {
      if (!baseUrl || !consumerKey || !consumerSecret) {
        return res.status(500).json({
          error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
        });
      }

      const productId = extractNumber(message, "productId");
      const variationId = extractNumber(message, "variationId");
      const quantity = extractNumber(message, "qty");

      if (!productId || !variationId || quantity == null) {
        return res.status(400).json({
          error: "Faltan productId, variationId o qty en el mensaje",
          example: "stock productId=1153 variationId=1159 qty=7",
        });
      }

      result = await updateVariationStock({
        baseUrl,
        consumerKey,
        consumerSecret,
        productId,
        variationId,
        quantity,
      });

      return res.json({
        agentId: agent.id,
        agentName: agent.name,
        usedTool: true,
        reply: `Stock actualizado correctamente a ${quantity} en la variación ${variationId} del producto ${productId}.`,
        toolResult: result,
      });
    }

        if (looksLikePriceUpdateCommand(message)) {
      if (!baseUrl || !consumerKey || !consumerSecret) {
        return res.status(500).json({
          error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
        });
      }

      const productId = extractNumber(message, "productId");
      const regularPrice = extractNumber(message, "regular");
      const salePrice = extractNumber(message, "sale");

      if (!productId || regularPrice == null) {
        return res.status(400).json({
          error: "Faltan productId o regular en el mensaje",
          example: "precio productId=1153 regular=19990 sale=17990",
        });
      }

      result = await updateProductPrice({
        baseUrl,
        consumerKey,
        consumerSecret,
        productId,
        regularPrice,
        salePrice,
      });

      return res.json({
        agentId: agent.id,
        agentName: agent.name,
        usedTool: true,
        reply: `Precio actualizado correctamente en el producto ${productId}.`,
        toolResult: result,
      });
    }


    if (looksLikeStockUpdate(message)) {
  const lines = message.split("\n");

  const updates = [];

  for (const line of lines) {
    const parts = line.trim().split(" ");

    if (parts.length === 2) {
      const name = parts[0];
      const qty = Number(parts[1]);

      if (!isNaN(qty)) {
        updates.push({
          name,
          qty
        });
      }
    }
  }

  toolContext = `
El usuario quiere actualizar stock.

Datos detectados:
${JSON.stringify(updates, null, 2)}

Interpretá estos datos como actualizaciones de stock.
`;
}


    if (looksLikeAuditRequest(message)) {
      const baseUrl = process.env.WC_URL;
      const consumerKey = process.env.WC_KEY;
      const consumerSecret = process.env.WC_SECRET;

      if (!baseUrl || !consumerKey || !consumerSecret) {
        return res.status(500).json({
          error: "Faltan WC_URL, WC_KEY o WC_SECRET en el .env",
        });
      }

      const auditResult = await auditVariableProductsStock({
        baseUrl,
        consumerKey,
        consumerSecret,
      });

      toolContext = `
RESULTADO REAL DE LA TOOL auditVariableProductsStock:

${JSON.stringify(auditResult, null, 2)}

Instrucciones:
- Respondé usando estos datos reales.
- No inventes números.
- Hacé un resumen claro en español.
- Indicá totales y ejemplos concretos.
- Si hay muchas variaciones, resumí y mencioná las más relevantes.
`;
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const finalUserMessage = toolContext
      ? `${message}\n\n${toolContext}`
      : message;

    const response = await client.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "system",
          content: agent.system_prompt,
        },
        {
          role: "user",
          content: finalUserMessage,
        },
      ],
    });

    const output = response.output_text || "";

    res.json({
      agentId: agent.id,
      agentName: agent.name,
      usedTool: Boolean(toolContext),
      reply: output,
    });
  } catch (error) {
    console.error("Error en /run-agent:", error?.response?.data || error);

    const status = Number(error?.status || error?.response?.status || 500);
    const responseDetail = error?.detail ?? error?.response?.data ?? error?.message;

    res.status(status).json({
      error:
        status === 400
          ? error?.message || "Solicitud inválida"
          : "Error al ejecutar el agente",
      code: error?.code || error?.response?.data?.code || null,
      detail: responseDetail,
      product: error?.product || null,
    });
  }
});

export default router;
