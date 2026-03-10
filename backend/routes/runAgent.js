import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import {
  auditVariableProductsStock,
  updateVariationStock,
  enableManageStockForVariation,
  updateProductPrice,
  applyStockUpdateByColorAndSize,
  planStockUpdateByColorOnly,
  createSimpleProduct,
  createVariableProduct,
  ensureCategoryByName,
  suggestCategoriesByName,
  uploadImageToWordpress
} from "../tools/woocommerce.js";
import {
  updateAgent,
  findAgent,
  savePendingDraft,
  getPendingDraft,
  clearPendingDraft,
  improveAgent,
  repairAgent
} from "../services/masterAgent.js";
import jwt from "jsonwebtoken";
import { findUserById } from "../services/users.js";
import { decryptText } from "../services/crypto.js";



const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "../data/agents.json");

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

function extractOrderedImages(files = []) {
  return files
    .filter((file) => file && file.buffer)
    .map((file, index) => ({
      file,
      position: index + 1,
      isMain: index === 0,
    }));
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

  return (
    text.includes("crear producto variable") ||
    text.includes("producto variable") ||
    (
      text.includes("nombre:") &&
      text.includes("atributos:") &&
      text.includes("variaciones:")
    )
  );
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
  const text = String(message || "");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 4) return false;

  const hasNombre = lines.some((line) => /^nombre\s*:/i.test(line));
  const hasPrecio = lines.some((line) => /^precio\s*:/i.test(line));
  const hasCategoria = lines.some((line) => /^(categoria|categoría)\s*:/i.test(line));
  const hasColor = lines.some((line) => /^color\s*:/i.test(line));
  const hasTalle = lines.some((line) => /^talle\s*:/i.test(line));

  return hasNombre && hasPrecio && hasCategoria && hasColor && hasTalle;
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
    const match = line.match(/^(.+?)\s+([A-Za-z0-9]+)\s+(\d+)$/);

    if (!match) continue;

    const color = normalizeSpaces(match[1]);
    const sizeToken = normalizeSpaces(match[2]);
    const qty = Number(match[3]);

    const normalizedColor = normalizeKeyName(color);

    const normalizedSize = normalizeKeyName(
      /^talle\s+/i.test(sizeToken) ? sizeToken : `Talle ${sizeToken}`
    );

    const key = `${normalizedColor}__${normalizedSize}`;

    stockMap.set(key, qty);
  }

  return stockMap;
}

function buildSupplierVariableVariations({ colors = [], sizes = [], price, stockMap = null }) {
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
  const colorRaw = normalizeSpaces(data.color || "");
  const sizeRaw = normalizeSpaces(data.talle || "");

  const cleanPrice = priceRaw.replace(/[^\d]/g, "");
  const price = cleanPrice ? Number(cleanPrice) : null;

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
          stockMap,
        })
      : [];

  return {
    name,
    price,
    categoryName,
    colors: [...new Set(colors)],
    sizes: [...new Set(sizes)],
    attributes,
    variations,
    hasStockBlock: Boolean(stockRaw),
    stockLinesParsed: stockMap.size,
  };
}
import { requireAdmin } from "../middleware/requireAdmin.js";
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { agentId, message } = req.body;
    const files = req.files || [];
    // ===== MASTER AGENT COMMANDS =====

const lowerMessage = String(message || "").toLowerCase();
if (lowerMessage.startsWith("crear agente:") || lowerMessage.startsWith("crea agente:")) {
  const requestText = message.split(":").slice(1).join(":").trim();

  if (!requestText) {
    return res.json({
      reply: "Pasame qué agente querés crear. Ejemplo: crear agente: un agente que administre cupones de WooCommerce"
    });
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await client.responses.create({
    model: "gpt-5",
    input: [
      {
        role: "system",
        content: `Sos un arquitecto de agentes. Devolvé solo JSON válido con estos campos:
name, role, objective, capabilities, limitations, tools, safety_rules, response_style, example_requests, system_prompt`
      },
      {
        role: "user",
        content: requestText,
      },
    ],
  });

  const text = response.output_text || "";
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return res.json({
      reply: "No pude crear el agente porque la IA no devolvió JSON válido.",
      raw: text
    });
  }

  const rawFile = fs.existsSync(DATA_FILE)
    ? fs.readFileSync(DATA_FILE, "utf-8")
    : "[]";

  const agents = rawFile ? JSON.parse(rawFile) : [];

  const newAgent = {
    id: Date.now().toString(),
    created_at: new Date().toISOString(),
    created_by_master: true,
    ...parsed,
  };

  agents.push(newAgent);
  fs.writeFileSync(DATA_FILE, JSON.stringify(agents, null, 2), "utf-8");

  return res.json({
    reply: `Agente creado correctamente: ${newAgent.name}`,
    agent: newAgent
  });
}

if (lowerMessage.includes("arregla agente")) {
  const targetIdMatch = message.match(/agentid\s*=\s*(\d+)/i);

  if (!targetIdMatch) {
    return res.json({
      reply: "Necesito el agentId. Ejemplo: arregla agente agentId=123"
    });
  }

  const targetId = targetIdMatch[1];
  const targetAgent = findAgent(targetId);

  if (!targetAgent) {
    return res.json({
      reply: "No encontré ese agente."
    });
  }

  const repaired = repairAgent(targetAgent);
  const updated = updateAgent(targetId, {
    ...repaired.agent,
    repaired_by_master: true
  });

  if (!repaired.repaired) {
    return res.json({
      reply: "El agente ya estaba sano. No hizo falta repararlo.",
      agent: updated
    });
  }

  return res.json({
    reply: `El agente fue reparado automáticamente. Campos corregidos: ${repaired.missing.join(", ")}`,
    agent: updated
  });
}

if (lowerMessage.includes("mejora agente")) {

  const targetIdMatch = message.match(/agentid\s*=\s*(\d+)/i);

  if (!targetIdMatch) {
    return res.json({
      reply: "Necesito el agentId. Ejemplo: mejora agente agentId=123"
    });
  }

  const targetId = targetIdMatch[1];

  const targetAgent = findAgent(targetId);

  if (!targetAgent) {
    return res.json({
      reply: "No encontré ese agente."
    });
  }

  const improved = await improveAgent(targetAgent);

  const updated = updateAgent(targetId, improved);

  return res.json({
    reply: "El agente fue mejorado automáticamente por el agente maestro.",
    agent: updated
  });
}

    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({
        error: "Falta 'agentId' en el body",
      });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Falta 'message' en el body",
      });
    }

    if (!fs.existsSync(DATA_FILE)) {
      return res.status(404).json({
        error: "No existe el archivo de agentes",
      });
    }

    const rawFile = fs.readFileSync(DATA_FILE, "utf-8");
    const agents = rawFile ? JSON.parse(rawFile) : [];
    const agent = agents.find((a) => a.id === agentId);

    if (!agent) {
      return res.status(404).json({
        error: "Agente no encontrado",
      });
    }

      let toolContext = "";

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

    const user = findUserById(decoded.userId);

    if (user) {
  baseUrl = user.store_url;
  consumerKey = decryptText(user.consumer_key);
  consumerSecret = decryptText(user.consumer_secret);
}
  } catch (error) {
    return res.status(401).json({
      error: "Token inválido o vencido",
    });
  }
}

const detectedIntent = detectCommerceIntent(message);

const pendingDraft = getPendingDraft(agentId);

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

  const result = await createSimpleProduct({
    baseUrl,
    consumerKey,
    consumerSecret,
    name: pendingDraft.name,
    regularPrice: pendingDraft.regularPrice,
    description: pendingDraft.description || "",
    shortDescription: pendingDraft.shortDescription || "",
    categories,
    stockQuantity: pendingDraft.stockQuantity,
    manageStock: true,
  });

  clearPendingDraft(agentId);

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
      `Perfecto. Ahora mandame el producto completo de nuevo y dejá esa categoría al final o en una línea sola. Ejemplo:\ncrear producto simple\nnombre: Remera básica\nprecio: 15000\nstock: 5\n${message.trim()}`,
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
      const regularPriceRaw = extractField(message, "precio");
      const stockQuantityRaw = extractField(message, "stock");
      const categoryName = extractField(message, "categoria") || extractLooseCategoryValue(message);

      const regularPrice = regularPriceRaw ? Number(regularPriceRaw) : null;
      const stockQuantity = stockQuantityRaw ? Number(stockQuantityRaw) : null;
      const description = extractField(message, "descripcion");
      const shortDescription = extractField(message, "descripcion_corta");

    if (!name || regularPrice == null || Number.isNaN(regularPrice)) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      "Para crear un producto simple pasame al menos: nombre y precio.",
  });
}

if (!categoryName) {
  savePendingDraft(agentId, {
    type: "simple_product",
    name,
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

if (categoryName) {

  const categoryResult = await ensureCategoryByName({
    baseUrl,
    consumerKey,
    consumerSecret,
    name: categoryName,
  });

  categories = [categoryResult.category.id];

}

let uploadedImages = [];

if (files.length > 0) {

  const orderedImages = extractOrderedImages(files);

  for (const image of orderedImages) {

    const uploaded = await uploadImageToWordpress({
      baseUrl,
      consumerKey,
      consumerSecret,
      buffer: image.file.buffer,
      filename: image.file.originalname,
    });

    uploadedImages.push({
      id: uploaded.id,
      position: image.position
    });

  }

}

    const result = await createSimpleProduct({
  baseUrl,
  consumerKey,
  consumerSecret,
  name,
  regularPrice,
  description,
  shortDescription,
  categories,
  images: uploadedImages,
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
  const description = extractField(message, "descripcion");
  const shortDescription = extractField(message, "descripcion_corta");
  const categories = extractMultiValueField(message, "categorias").map(Number);
  const attributesRaw = String(message || "").match(/atributos\s*:\s*([\s\S]*?)\nvariaciones\s*:/i)?.[1]?.trim() || "";
  const variationsRaw = String(message || "").match(/variaciones\s*:\s*([\s\S]*)$/i)?.[1]?.trim() || "";

  const attributes = parseVariableAttributesText(attributesRaw);
  const variations = parseVariableVariationsText(variationsRaw);

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
      "Faltan los atributos. Usá el formato:\natributos:\nColor: Negro, Blanco\nTalle: S, M, L",
  });
}

if (variations.length === 0) {
  return res.json({
    agentId: agent.id,
    agentName: agent.name,
    usedTool: false,
    reply:
      "Faltan las variaciones. Usá el formato:\nvariaciones:\nColor: Negro, Talle: M | precio: 10000 | stock: 5",
  });
}

let uploadedImages = [];

if (files.length > 0) {
  const orderedImages = extractOrderedImages(files);

  for (const image of orderedImages) {
    const uploaded = await uploadImageToWordpress({
      baseUrl,
      consumerKey,
      consumerSecret,
      buffer: image.file.buffer,
      filename: image.file.originalname,
    });

    uploadedImages.push({
      id: uploaded.id,
      color: image.file.originalname.split(".")[0].trim(),
      position: image.position,
    });
  }
}

  const result = await createVariableProduct({
    baseUrl,
    consumerKey,
    consumerSecret,
    name,
    description,
    shortDescription,
    categories: categories.filter((n) => Number.isFinite(n)),
    attributes,
    variations,
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

  const categoryResult = await ensureCategoryByName({
    baseUrl,
    consumerKey,
    consumerSecret,
    name: parsed.categoryName,
  });

  let uploadedImages = [];

  if (files.length > 0) {
    const orderedImages = extractOrderedImages(files);

    for (const image of orderedImages) {
      const uploaded = await uploadImageToWordpress({
        baseUrl,
        consumerKey,
        consumerSecret,
        buffer: image.file.buffer,
        filename: image.file.originalname,
      });

      uploadedImages.push({
        id: uploaded.id,
        color: image.file.originalname.split(".")[0].trim(),
        position: image.position,
      });
    }
  }

  const result = await createVariableProduct({
    baseUrl,
    consumerKey,
    consumerSecret,
    name: parsed.name,
    description: "",
    shortDescription: "",
    categories: [categoryResult.category.id],
    attributes: parsed.attributes,
    variations: parsed.variations,
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
  const orderedImages = extractOrderedImages(files);

  for (const image of orderedImages) {
    const uploaded = await uploadImageToWordpress({
      baseUrl,
      consumerKey,
      consumerSecret,
      buffer: image.file.buffer,
      filename: image.file.originalname,
    });

    uploadedImages.push({
      id: uploaded.id,
      color: image.file.originalname.split(".")[0].trim(),
      position: image.position,
    });
  }
}



  const result = await createVariableProduct({
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

      const result = await applyStockUpdateByColorAndSize({
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

      const result = await enableManageStockForVariation({
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

      const result = await updateVariationStock({
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

      const result = await updateProductPrice({
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
    res.status(500).json({
      error: "Error al ejecutar el agente",
      detail: error?.response?.data || error.message,
    });
  }
});

export default router;