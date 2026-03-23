"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  text: string;
};

// === JOB QUEUE HELPERS ===
type Job = {
  id: string;
  title: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt?: string;
};

async function enqueueJob(body: { agentId: string; message: string; files?: File[]; imageColorMap?: Record<string, string> }) {
  const token = typeof window !== "undefined" ? (localStorage.getItem("token") || "") : "";
  const form = new FormData();
  form.append("agentId", body.agentId);
  form.append("message", body.message);

  (body.files || []).forEach((file) => {
    form.append("images", file);
    const key = getFileKey(file);
    form.append(`imageColor_${key}`, body.imageColorMap?.[key] || "");
  });

  const res = await fetchWithRetry(`${API}/jobs`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  return res.json();
}

async function fetchJobs(): Promise<Job[]> {
  const token = typeof window !== "undefined" ? (localStorage.getItem("token") || "") : "";
  const res = await fetchWithRetry(`${API}/jobs`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.jobs || []);
}
type CategoryItem = {
  id: number;
  name: string;
  parent?: number;
  slug?: string;
  count?: number;
};

type CreateProductForm = {
  nombre: string;
  sku: string;
  colores: string;
  talles: string;
  precio: string;
  precioRebajado: string;
  precioEfectivo: string;
  stockMode: "none" | "same" | "perVariation";
  stockGeneral: string;
  descripcionCorta: string;
  categoria: string;
  subcategoria: string;
};

type EditFoundProduct = {
  id: number;
  name: string;
  sku: string;
  type: string;
  regularPrice?: string;
  salePrice?: string;
  cashPriceGeneral?: string;
  categories?: CategoryItem[];
  images?: { id: number; src: string }[];
  variations?: {
  id: number;
  attributes: { name: string; option: string }[];
  image: { id: number; src: string } | null;
  stock_quantity?: number | string;
stock_status?: "instock" | "outofstock";
stock_touched?: boolean;
status_touched?: boolean;
manage_stock_checked?: boolean;
}[];
  attributes?: { id?: number; name: string; options: string[] }[];
};

function traducirEstado(status: string) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "processing":
      return "En proceso";
    case "completed":
      return "Completado";
    case "failed":
      return "Fallido";
    default:
      return status;
  }
}

function getEstadoBadgeStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    marginTop: 6,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid transparent",
  };

  switch (status) {
    case "processing":
      return { ...base, color: "#facc15", background: "rgba(250, 204, 21, 0.12)", borderColor: "rgba(250, 204, 21, 0.3)" };
    case "completed":
      return { ...base, color: "#22c55e", background: "rgba(34, 197, 94, 0.12)", borderColor: "rgba(34, 197, 94, 0.3)" };
    case "failed":
      return { ...base, color: "#ef4444", background: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.3)" };
    default:
      return { ...base, color: "#cbd5e1", background: "rgba(148, 163, 184, 0.12)", borderColor: "rgba(148, 163, 184, 0.25)" };
  }
}

type EditActionType =
  | ""
  | "cambiar_precio"
  | "agregar_precio_rebajado"
  | "cambiar_precio_rebajado"
  | "quitar_precio_rebajado"
  | "cambiar_precio_efectivo"
  | "cambiar_descripcion"
  | "cambiar_categorias"
  | "cambiar_fotos_variantes"
  | "quitar_fotos_variantes"
  | "mover_producto_fecha";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

type CreateStepKey =
  | "fotos"
  | "nombre"
  | "sku"
  | "colores"
  | "talles"
  | "precio"
  | "precioRebajado"
  | "precioEfectivo"
  | "stock"
  | "descripcionCorta"
  | "categoria"
  | "subcategoria";

const CREATE_STEPS: {
  key: CreateStepKey;
  title: string;
  helper: string;
  placeholder?: string;
  optional?: boolean;
}[] = [
  {
    key: "nombre",
    title: "Nombre",
    helper: "Escribí el nombre del producto.",
    placeholder: "Ej: Remera básica premium",
  },
  {
  key: "sku",
  title: "SKU",
  helper: "Si querés, escribí el SKU (es el artículo). Si no, dejalo vacío.",
  placeholder: "Ej: REM-001",
  optional: true,
},
  {
    key: "colores",
    title: "Colores",
    helper: "Si tiene colores, separalos con coma. Si no tiene, dejalo vacío.",
    placeholder: "Ej: Negro, Blanco, Azul",
    optional: true,
  },
  {
    key: "talles",
    title: "Talles",
    helper: "Si tiene talles, separalos con coma. Si no tiene, dejalo vacío.",
    placeholder: "Ej: S, M, L o Talle 2, Talle 3",
    optional: true,
  },
  {
    key: "precio",
    title: "Precio",
    helper: "Ingresá el precio normal del producto.",
    placeholder: "Ej: 12900",
  },
  {
    key: "precioRebajado",
    title: "Precio rebajado",
    helper: "Si tiene oferta, cargalo acá. Si no tiene, dejalo vacío.",
    placeholder: "Ej: 10900",
    optional: true,
  },
    {
    key: "precioEfectivo",
    title: "Precio en efectivo",
    helper: "Si este usuario usa precio en efectivo, cargalo acá. Si no, dejalo vacío.",
    placeholder: "Ej: 11900",
    optional: true,
  },
    {
  key: "stock",
  title: "Stock",
  helper: "Podés dejarlo disponible sin stock numérico, usar un stock general o cargar stock por variación.",
  placeholder: "Ej: 10",
  optional: true,
},
  {
    key: "descripcionCorta",
    title: "Descripción corta",
    helper: "Podés dejar una descripción breve. Si no tenés, dejalo vacío.",
    placeholder: "Ej: Remera de algodón peinado, calce clásico.",
    optional: true,
  },
  {
    key: "categoria",
    title: "Categoría",
    helper: "Escribí la categoría principal.",
    placeholder: "Ej: Remeras",
  },
  {
    key: "fotos",
    title: "Fotos",
    helper: "Por último, agregá las fotos del producto. La primera queda como principal.",
    optional: true,
  },
];

const initialCreateForm: CreateProductForm = {
  nombre: "",
  sku: "",
  colores: "",
  talles: "",
  precio: "",
  precioRebajado: "",
  precioEfectivo: "",
  stockMode: "none",
  stockGeneral: "",
  descripcionCorta: "",
  categoria: "",
  subcategoria: "",
};

function normalizeCommaField(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function cleanMoney(value: string) {
  return String(value || "").replace(/[^\d]/g, "");
}

function getFileKey(file: File) {
  return `${file.name}-${file.size}`;
}


function getVariationKey(color: string, size: string) {
  return `${String(color || "").trim()}__${String(size || "").trim()}`;
}

function buildCategoryPathMap(categories: CategoryItem[]) {
  const map = new Map<number, CategoryItem>();
  categories.forEach((cat) => map.set(Number(cat.id), cat));

  const pathMap = new Map<number, string>();

  const getPath = (id: number): string => {
    if (pathMap.has(id)) return pathMap.get(id) || "";

    const current = map.get(id);
    if (!current) return "";

    if (!current.parent || !map.has(Number(current.parent))) {
      pathMap.set(id, current.name);
      return current.name;
    }

    const parentPath = getPath(Number(current.parent));
    const next = parentPath ? `${parentPath} > ${current.name}` : current.name;
    pathMap.set(id, next);
    return next;
  };

  categories.forEach((cat) => getPath(Number(cat.id)));
  return pathMap;
}

function normalizeEditFoundProduct(product: any, variation?: any): EditFoundProduct {
  let regular = product?.regular_price;
  let sale = product?.sale_price;

  if (variation) {
    regular = variation?.regular_price || regular;
    sale = variation?.sale_price || sale;
  }

      return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    type: product.type,
    regularPrice: String(regular || ""),
    salePrice: String(sale || ""),
    cashPriceGeneral: String(product?.cash_price_general || ""),
    categories: Array.isArray(product?.categories)
      ? product.categories.map((cat: any) => ({
          id: Number(cat?.id || 0),
          name: String(cat?.name || ""),
          parent: Number(cat?.parent || 0),
        }))
      : [],

  images: Array.isArray(product?.images)
    ? product.images.map((img: any) => ({
        id: Number(img?.id || 0),
        src: String(img?.src || ""),
      }))
    : [],
    variations: Array.isArray(product?.variations)
    ? product.variations
        .map((variationItem: any) => ({
          id: Number(variationItem?.id || 0),
          attributes: Array.isArray(variationItem?.attributes)
            ? variationItem.attributes.map(
                (attr: { name?: string; option?: string }) => ({
                  name: String(attr?.name || "").trim(),
                  option: String(attr?.option || "").trim(),
                })
              )
            : [],
          image:
            variationItem?.image && variationItem.image.src
              ? {
                  id: Number(variationItem.image.id || 0),
                  src: String(variationItem.image.src || ""),
                }
              : null,
          stock_quantity: variationItem?.stock_quantity ?? "",
          stock_status: variationItem?.stock_status || "instock",
          manage_stock_checked: Boolean(variationItem?.manage_stock),
        }))
        .sort(
          (
            a: {
              id: number;
              attributes: { name: string; option: string }[];
              image: { id: number; src: string } | null;
              stock_quantity?: number | string;
              stock_status?: "instock" | "outofstock";
              manage_stock_checked?: boolean;
            },
            b: {
              id: number;
              attributes: { name: string; option: string }[];
              image: { id: number; src: string } | null;
              stock_quantity?: number | string;
              stock_status?: "instock" | "outofstock";
              manage_stock_checked?: boolean;
            }
          ) => {
            const aOptions = (a.attributes || []).map((attr: { option: string }) =>
              String(attr.option || "").trim()
            );
            const bOptions = (b.attributes || []).map((attr: { option: string }) =>
              String(attr.option || "").trim()
            );

            const aColor = String(aOptions[0] || "");
            const bColor = String(bOptions[0] || "");

            const colorCompare = aColor.localeCompare(bColor, "es", { numeric: true });
            if (colorCompare !== 0) {
              return colorCompare;
            }

            const aSizeRaw = String(aOptions[1] || aOptions[0] || "").trim();
            const bSizeRaw = String(bOptions[1] || bOptions[0] || "").trim();

            const normalizeSize = (value: string) =>
              value
                .trim()
                .toUpperCase()
                .replace(/^TALLE\s*/i, "")
                .replace(/^NRO\.?\s*/i, "")
                .replace(/\s+/g, "");

            const aSize = normalizeSize(aSizeRaw);
            const bSize = normalizeSize(bSizeRaw);

            const sizeOrder = [
              "XXXS",
              "XXS",
              "XS",
              "S",
              "M",
              "L",
              "XL",
              "XXL",
              "XXXL",
              "4XL",
              "5XL",
              "6XL",
            ];

            const aSizeIndex = sizeOrder.indexOf(aSize);
            const bSizeIndex = sizeOrder.indexOf(bSize);

            const aIsNumber = /^\d+$/.test(aSize);
            const bIsNumber = /^\d+$/.test(bSize);

            if (aIsNumber && bIsNumber) {
              return Number(aSize) - Number(bSize);
            }

            if (aSizeIndex !== -1 && bSizeIndex !== -1) {
              return aSizeIndex - bSizeIndex;
            }

            if (aIsNumber && !bIsNumber) return -1;
            if (!aIsNumber && bIsNumber) return 1;

            if (aSizeIndex !== -1 && bSizeIndex === -1) return -1;
            if (aSizeIndex === -1 && bSizeIndex !== -1) return 1;

            return aSize.localeCompare(bSize, "es", { numeric: true });
          }
        )
    : [],
};
}

function translateAgentError(message: any) {
  const text =
    typeof message === "string"
      ? message
      : JSON.stringify(message || "");

  const lower = text.toLowerCase();

  if (lower.includes("sku") && lower.includes("duplicado")) {
    return "Ya existe un producto con ese SKU. Probá con otro SKU.";
  }

  if (lower.includes("product_invalid_sku")) {
    return "El SKU ya existe. Usá otro SKU.";
  }

  if (lower.includes("already present")) {
    return "Ya existe un producto con ese SKU.";
  }

  if (text === "INVALID_CONTENT_TYPE") {
    return "El servidor se está iniciando. Probá de nuevo en unos segundos.";
  }

  if (text === "INVALID_JSON") {
    return "El servidor devolvió una respuesta inválida. Probá de nuevo en unos segundos.";
  }

  if (text === "TIMEOUT") {
    return "El servidor tardó demasiado en responder. Probá de nuevo en unos segundos.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("networkerror") ||
    lower.includes("network error")
  ) {
    return "No se pudo conectar con el servidor. Probá de nuevo en unos segundos.";
  }

  if (text.startsWith("HTTP_")) {
    return "El servidor respondió con un error. Probá de nuevo en unos segundos.";
  }

  if (
    lower.includes("<!doctype html") ||
    lower.includes("<html") ||
    lower.includes("<body>")
  ) {
    return "El servidor devolvió una respuesta inválida. Probá de nuevo en unos segundos.";
  }

  if (text && text !== "{}") {
    return text;
  }

  return "Ocurrió un error al ejecutar la acción.";
}

function buildCreateProductMessage(
  form: CreateProductForm,
  stockByVariationMap: Record<string, string>,
  selectedCategoryIds: number[] = []
) {
  const cleanColors = normalizeCommaField(form.colores);
  const cleanSizes = normalizeCommaField(form.talles);
  const cleanPrice = cleanMoney(form.precio);
  const cleanSalePrice = cleanMoney(form.precioRebajado);
  const cleanCashPrice = cleanMoney(form.precioEfectivo);
  const shortDescription = form.descripcionCorta.trim();
  const category = form.categoria.trim();
  const subcategory = form.subcategoria.trim();
  const categoryIds = Array.from(
    new Set(
      (Array.isArray(selectedCategoryIds) ? selectedCategoryIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
  const name = form.nombre.trim();
  const sku = form.sku.trim();

  const colorList = cleanColors
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const sizeList = cleanSizes
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const lines: string[] = [];

  if (cleanColors || cleanSizes) {
    lines.push("crear producto variable");
    lines.push(`nombre: ${name}`);
    if (sku) lines.push(`sku: ${sku}`);
    lines.push(`precio: ${cleanPrice}`);
    if (cleanSalePrice) lines.push(`precio_rebajado: ${cleanSalePrice}`);
    if (cleanCashPrice) lines.push(`precio_efectivo: ${cleanCashPrice}`);

    lines.push("atributos:");
    if (cleanColors) lines.push(`Color: ${cleanColors}`);
    if (cleanSizes) lines.push(`Talle: ${cleanSizes}`);

    if (form.stockMode === "same") {
  const cleanQty = String(form.stockGeneral || "").trim();

  if (cleanQty) {
    let stockLines: string[] = [];

    if (colorList.length > 0 && sizeList.length > 0) {
      stockLines = colorList.flatMap((color) =>
        sizeList.map((talle) => `${color} ${talle} ${cleanQty}`)
      );
    } else if (colorList.length > 0) {
      stockLines = colorList.map((color) => `${color} ${cleanQty}`);
    } else if (sizeList.length > 0) {
      stockLines = sizeList.map((talle) => `${talle} ${cleanQty}`);
    }

    if (stockLines.length > 0) {
      lines.push("stock:");
      lines.push(...stockLines);
    }
  }
}

    if (form.stockMode === "perVariation") {
  const stockLines = Object.entries(stockByVariationMap)
    .map(([key, qty]) => {
      const [color, talle] = key.split("__");
      const cleanColor = String(color || "").trim();
      const cleanTalle = String(talle || "").trim();
      const cleanQty = String(qty || "").trim();

      if (!cleanQty) return "";

      if (cleanColor && cleanTalle) {
        return `${cleanColor} ${cleanTalle} ${cleanQty}`;
      }

      if (cleanColor) {
        return `${cleanColor} ${cleanQty}`;
      }

      if (cleanTalle) {
        return `${cleanTalle} ${cleanQty}`;
      }

      return "";
    })
    .filter(Boolean);

  if (stockLines.length > 0) {
    lines.push("stock:");
    lines.push(...stockLines);
  }
}

    if (shortDescription) lines.push(`descripcion_corta: ${shortDescription}`);
    if (categoryIds.length > 0) {
      lines.push(`categorias_ids: ${categoryIds.join(", ")}`);
    } else {
      lines.push(`categoria: ${category}`);
      if (subcategory) lines.push(`subcategoria: ${subcategory}`);
    }
    return lines.join("\n");
  }

  lines.push("crear producto simple");
lines.push(`nombre: ${name}`);
if (sku) lines.push(`sku: ${sku}`);
lines.push(`precio: ${cleanPrice}`);
if (cleanSalePrice) lines.push(`precio_rebajado: ${cleanSalePrice}`);
if (cleanCashPrice) lines.push(`precio_efectivo: ${cleanCashPrice}`);

if (form.stockMode === "none") {
  lines.push("stock_estado: disponible");
} else if (form.stockMode === "same") {
  const cleanQty = String(form.stockGeneral || "").trim();
  if (cleanQty) {
    lines.push(`stock: ${cleanQty}`);
  } else {
    lines.push("stock_estado: disponible");
  }
}

if (shortDescription) lines.push(`descripcion_corta: ${shortDescription}`);
if (categoryIds.length > 0) {
  lines.push(`categorias_ids: ${categoryIds.join(", ")}`);
} else {
  lines.push(`categoria: ${category}`);
  if (subcategory) lines.push(`subcategoria: ${subcategory}`);
}


  return lines.join("\n");
}

function getButtonClass(
  variant: "primary" | "secondary" | "ghost" | "danger" = "secondary",
  active = false
) {
  const classes = ["saas-btn"];

  if (variant === "primary") classes.push("saas-btn-primary");
  if (variant === "secondary") classes.push("saas-btn-secondary");
  if (variant === "ghost") classes.push("saas-btn-ghost");
  if (variant === "danger") classes.push("saas-btn-danger");
  if (active) classes.push("saas-btn-active");

  return classes.join(" ");
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status?: number) {
  return status === 502 || status === 503 || status === 504;
}

function shouldRetryRequestError(error: any) {
  if (!error) return false;

  if (error?.name === "AbortError" || error?.name === "TypeError") {
    return true;
  }

  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("failed") ||
    message.includes("timeout") ||
    message.includes("load failed")
  );
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: {
    retries?: number;
    delayMs?: number;
    timeoutMs?: number;
  }
): Promise<Response> {
  const retries = options?.retries ?? 2;
  const delayMs = options?.delayMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 20000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (isRetryableStatus(response.status) && attempt < retries) {
        await delay(delayMs);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt >= retries || !shouldRetryRequestError(error)) {
        throw error;
      }

      await delay(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("REQUEST_FAILED");
}

async function safeFetchJson(url: string, options: RequestInit, retries = 1) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetchWithRetry(
      url,
      {
        ...options,
        signal: controller.signal,
      },
      { retries, delayMs: 1500, timeoutMs: 20000 }
    );

    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    if (!res.ok) {
      let parsed: any = null;

      if (contentType.includes("application/json")) {
        try {
          parsed = JSON.parse(rawText);
        } catch {}
      }

      throw new Error(
        parsed?.detail ||
          parsed?.error ||
          parsed?.message ||
          `HTTP_${res.status}`
      );
    }

    if (!contentType.includes("application/json")) {
      throw new Error("INVALID_CONTENT_TYPE");
    }

    let data: any = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new Error("INVALID_JSON");
    }

    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("TIMEOUT");
    }

    const message =
      typeof error?.message === "string" ? error.message : String(error || "");

    const canRetry =
      retries > 0 &&
      (
        message === "INVALID_CONTENT_TYPE" ||
        message === "INVALID_JSON" ||
        message === "TIMEOUT" ||
        message.toLowerCase().includes("fetch") ||
        message.toLowerCase().includes("network")
      );

    if (canRetry) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return safeFetchJson(url, options, retries - 1);
    }

    throw error;
  }
}

export default function ChatWindow() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showJobs, setShowJobs] = useState(false);

  const agentId = "woocommerce-assistant";
  const agentName = "Asistente WooCommerce";
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshingEditProduct, setRefreshingEditProduct] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [userMe, setUserMe] = useState<{ usa_precio_efectivo?: boolean } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [imageColorMap, setImageColorMap] = useState<Record<string, string>>({});
  const [stockByVariationMap, setStockByVariationMap] = useState<Record<string, string>>({});
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null);
  const [dragOverFileIndex, setDragOverFileIndex] = useState<number | null>(null);
  const [draggedProductImageIndex, setDraggedProductImageIndex] = useState<number | null>(null);
const [dragOverProductImageIndex, setDragOverProductImageIndex] = useState<number | null>(null);
  const [skuChecking, setSkuChecking] = useState(false);
const [skuStatus, setSkuStatus] = useState<"idle" | "available" | "taken">("idle");
const [skuStatusMessage, setSkuStatusMessage] = useState("");
const skuValidationIdRef = useRef(0);
const skuValidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const [activeAction, setActiveAction] = useState<"create" | "edit" | "delete" | null>(null);
  const [deleteMode, setDeleteMode] = useState<"sku" | "nombre">("sku");
  const [editFoundProduct, setEditFoundProduct] = useState<EditFoundProduct | null>(null);
  const [editCandidates, setEditCandidates] = useState<EditFoundProduct[]>([]);
  const [editActionType, setEditActionType] = useState<EditActionType>("");
const [createStepIndex, setCreateStepIndex] = useState(0);
const [createForm, setCreateForm] = useState<CreateProductForm>(initialCreateForm);
const [editValue, setEditValue] = useState("");
const [editAttributeValues, setEditAttributeValues] = useState<Record<string, string[]>>({});
const [selectedEditCombinations, setSelectedEditCombinations] = useState<Record<string, string>[]>([]);
const [editSection, setEditSection] = useState<"" | "precio" | "stock" | "fotos" | "descripcion" | "categorias">("");
const [categoryOptions, setCategoryOptions] = useState<CategoryItem[]>([]);
const [categoriesLoading, setCategoriesLoading] = useState(false);
const [categoriesError, setCategoriesError] = useState("");
const [createSelectedCategoryIds, setCreateSelectedCategoryIds] = useState<number[]>([]);
const [editSelectedCategoryIds, setEditSelectedCategoryIds] = useState<number[]>([]);
const [moveProductMode, setMoveProductMode] = useState<"before" | "after">("before");
const [moveTargetSearch, setMoveTargetSearch] = useState("");
const [moveTargetProduct, setMoveTargetProduct] = useState<EditFoundProduct | null>(null);


  

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const composerAreaRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const editActionFieldRef = useRef<HTMLElement | null>(null);

  const storageKey = useMemo(() => {
    if (typeof window === "undefined") return "";
    const userRaw = localStorage.getItem("user");
    let userId = "guest";

    if (userRaw) {
      try {
        const user = JSON.parse(userRaw);
        userId = user?.id || "guest";
      } catch {}
    }

    return `chat_history_${userId}_${agentId}`;
  }, [agentId]);

  const CREATE_STEPS_VISIBLE = CREATE_STEPS.filter((step) => {
  if (step.key === "precioEfectivo" && !userMe?.usa_precio_efectivo) {
    return false;
  }
  return true;
});

const currentCreateStep =
  activeAction === "create" ? CREATE_STEPS_VISIBLE[createStepIndex] : null;
  const isCreateStepPhotos = currentCreateStep?.key === "fotos";

const hasColors = (createForm.colores || "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean).length > 0;

const hasSizes = (createForm.talles || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean).length > 0;
  const isVariableProductDraft = hasColors || hasSizes;

const hasEditSalePrice = Boolean(String(editFoundProduct?.salePrice || "").trim());
const editAttributes = editFoundProduct?.attributes || [];
const hasEditAttributes = editAttributes.length > 0;
const categoryPathMap = useMemo(() => buildCategoryPathMap(categoryOptions), [categoryOptions]);

async function loadCategories() {
  if (categoriesLoading) return;

  try {
    setCategoriesLoading(true);
    setCategoriesError("");

    const form = new FormData();
    form.append("agentId", agentId);
    form.append("message", "__list_categories__");

    const token = localStorage.getItem("token") || "";

    const res = await fetchWithRetry(`${API}/run-agent`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.detail || data?.error || data?.message || "No pude cargar las categorías.");
    }

    setCategoryOptions(Array.isArray(data?.categories) ? data.categories : []);
  } catch (error: any) {
    setCategoriesError(error?.message || "No pude cargar las categorías.");
  } finally {
    setCategoriesLoading(false);
  }
}

const editAttributeCombinations = (() => {
  if (!hasEditAttributes) return [];

  const build = (
    attrs: { name: string; options: string[] }[],
    index = 0,
    current: Record<string, string> = {}
  ): Record<string, string>[] => {
    if (index >= attrs.length) return [current];

    const attr = attrs[index];
    const results: Record<string, string>[] = [];

    for (const option of attr.options) {
      results.push(
        ...build(attrs, index + 1, {
          ...current,
          [attr.name]: option,
        })
      );
    }

    return results;
  };

  return build(editAttributes);
})();

function getCombinationKey(values: Record<string, string>) {
  return Object.entries(values)
    .map(([name, value]) => `${name}:${value}`)
    .join(" | ");
}

function isCombinationSelected(values: Record<string, string>) {
  const key = getCombinationKey(values);

  return selectedEditCombinations.some(
    (item) => getCombinationKey(item) === key
  );
}

function toggleCombination(values: Record<string, string>) {
  const key = getCombinationKey(values);

  setSelectedEditCombinations((prev) =>
    prev.some((item) => getCombinationKey(item) === key)
      ? prev.filter((item) => getCombinationKey(item) !== key)
      : [...prev, values]
  );
}

function getVariationCombination(
  variation: {
    id: number;
    attributes: { name: string; option: string }[];
    image: { id: number; src: string } | null;
  }
) {
  
<style jsx global>{`
.chat-window-saas button {
  transition: transform 0.16s ease, box-shadow 0.22s ease, filter 0.22s ease;
}

@media (hover: hover) and (pointer: fine) {
  .chat-window-saas button:hover {
    transform: translateY(-1px) scale(1.01);
    box-shadow: 0 10px 24px rgba(0,0,0,0.22);
  }
}

.chat-window-saas button:active {
  transform: scale(0.98);
}
`}</style>

return (variation.attributes || []).reduce<Record<string, string>>((acc, attr) => {
    const attrName = String(attr?.name || "").trim();
    const attrOption = String(attr?.option || "").trim();

    if (attrName && attrOption) {
      acc[attrName] = attrOption;
    }

    return acc;
  }, {});
}


  async function sendToAgent(messageToSend: string, filesOverride?: File[]) {
    const filesToSend = filesOverride ?? selectedFiles;
    const cleanText = messageToSend.trim();

    if ((!cleanText && filesToSend.length === 0) || loading) return;

    const previewText =
      cleanText || `Adjuntaste ${filesToSend.length} imagen${filesToSend.length === 1 ? "" : "es"}.`;

    const userMessage: Message = {
      role: "user",
      text: previewText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setText("");
    setLoading(true);

    try {
      const shouldQueue =
        activeAction === "create" ||
        activeAction === "delete" ||
        cleanText.startsWith("__edit_product_action__:");

      const response = shouldQueue
        ? await enqueueJob({
            agentId,
            message: cleanText,
            files: filesToSend,
            imageColorMap,
          })
        : await (async () => {
            const form = new FormData();
            form.append("agentId", agentId);
            form.append("message", cleanText);

            filesToSend.forEach((file) => {
              form.append("images", file);
              form.append(`imageColor_${getFileKey(file)}`, imageColorMap[getFileKey(file)] || "");
            });

            const token = localStorage.getItem("token") || "";

            return safeFetchJson(
              `${API}/run-agent`,
              {
                method: "POST",
                headers: token
                  ? {
                      Authorization: `Bearer ${token}`,
                    }
                  : undefined,
                body: form,
              },
              1
            );
          })();

const assistantText =
  shouldQueue
    ? typeof response?.job?.title === "string"
      ? `${response.job.title}. Podés seguir trabajando.`
      : "Proceso agregado a la cola."
    : typeof response?.reply === "string"
      ? response.reply.trim()
      : typeof response?.error === "string"
        ? response.error.trim()
        : typeof response?.detail === "string"
          ? response.detail.trim()
          : "";

if (!assistantText) {
  throw new Error("INVALID_JSON");
}

if (
  assistantText.startsWith("<!DOCTYPE html") ||
  assistantText.startsWith("<html") ||
  assistantText.includes("<body>")
) {
  throw new Error("INVALID_CONTENT_TYPE");
}

const assistantMessage: Message = {
  role: "assistant",
  text: assistantText,
};

      setMessages((prev) => [...prev, assistantMessage]);
      setSelectedFiles([]);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
  const rawMessage =
    typeof error === "string"
      ? error
      : typeof error?.message === "string"
        ? error.message
        : JSON.stringify(error || "");

  const assistantMessage: Message = {
    role: "assistant",
    text: translateAgentError(rawMessage),
  };

  setMessages((prev) => [...prev, assistantMessage]);
} finally {
      setLoading(false);
    }
  }

 async function handleSend(filesOverride?: File[]) {
  if (activeAction === "edit") {
    const raw = text.trim();

  if (!raw) {
    pushAssistantInfo("Escribí el nombre o el SKU del producto.");
    return;
  }

  if (raw.startsWith("__edit_product_action__:")) {
    await sendToAgent(raw, filesOverride);
    setText("");
    return;
  }
  setMessages((prev) => [
    ...prev,
    {
      role: "user",
      text: raw,
    },
  ]);

  setText("");

  const mode = raw.includes(" ") ? "nombre" : "sku";
  const command = `__search_edit_product__:${mode}|${raw}`;
  const token = localStorage.getItem("token") || "";

  setLoading(true);

  try {
    const form = new FormData();
    form.append("agentId", agentId);
    form.append("message", command);

    const data = await safeFetchJson(
  `${API}/run-agent`,
  {
    method: "POST",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
    body: form,
  },
  1
);

    if (data?.product) {
  setEditFoundProduct(
    normalizeEditFoundProduct(data.product, data.variationSample)
  );
  setEditCandidates([]);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  setSelectedEditCombinations([]);
  setMoveTargetSearch("");
setMoveTargetProduct(null);
setMoveProductMode("before");

  pushAssistantInfo(
    `Encontré el producto: ${data.product.name}. Ahora elegí qué querés editar.`
  );
}

else if (Array.isArray(data?.products) && data.products.length === 1) {
  setEditFoundProduct(normalizeEditFoundProduct(data.products[0]));
  setEditCandidates([]);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  setSelectedEditCombinations([]);
setMoveTargetSearch("");
setMoveTargetProduct(null);
setMoveProductMode("before");

  pushAssistantInfo(
    `Encontré el producto: ${data.products[0].name}. Ahora elegí qué querés editar.`
  );
}

else if (Array.isArray(data?.products) && data.products.length > 1) {
  const normalized = data.products.map((item: any) =>
    normalizeEditFoundProduct(item)
  );

  setEditFoundProduct(null);
  setEditCandidates(normalized);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  setSelectedEditCombinations([]);
  setMoveTargetSearch("");
setMoveTargetProduct(null);
setMoveProductMode("before");

  pushAssistantInfo("Encontré varios productos exactos. Elegí uno de la lista.");
}

else if (Array.isArray(data?.candidates) && data.candidates.length === 1) {
  const fullProduct = await loadEditProductDetails(
    normalizeEditFoundProduct(data.candidates[0])
  );

  setEditFoundProduct(fullProduct);
  setEditCandidates([]);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  setSelectedEditCombinations([]);
  setMoveTargetSearch("");
setMoveTargetProduct(null);
setMoveProductMode("before");

  pushAssistantInfo(
    `Encontré el producto: ${fullProduct.name}. Ahora elegí qué querés editar.`
  );
}

else if (Array.isArray(data?.candidates) && data.candidates.length > 1) {
  const normalized = data.candidates.map((item: any) =>
    normalizeEditFoundProduct(item)
  );

  setEditFoundProduct(null);
  setEditCandidates(normalized);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  setSelectedEditCombinations([]);
  setMoveTargetSearch("");
setMoveTargetProduct(null);
setMoveProductMode("before");

  pushAssistantInfo("Encontré varios productos parecidos. Elegí uno de la lista.");
}

else {
  setEditFoundProduct(null);
  setEditCandidates([]);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  setSelectedEditCombinations([]);
  setMoveTargetSearch("");
setMoveTargetProduct(null);
setMoveProductMode("before");

  pushAssistantInfo("No encontré ese producto.");
}
  } catch (err: any) {
    pushAssistantInfo(
      err?.message || "Hubo un error buscando el producto."
    );
  } finally {
    setLoading(false);
  }

  return;
}

  if (activeAction === "delete") {
    const raw = text.trim();

    if (!raw) {
      pushAssistantInfo(
        deleteMode === "sku"
          ? "Escribí al menos un SKU."
          : "Escribí al menos un nombre."
      );
      return;
    }

    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const message =
      deleteMode === "sku"
        ? `eliminar producto\nsku: ${lines.join(", ")}`
        : lines.length === 1
          ? `eliminar producto\nnombre: ${lines[0]}`
          : `eliminar producto\nnombre:\n${lines.join("\n")}`;

    await sendToAgent(message, filesOverride);
    setText("");
    return;
  }

  await sendToAgent(text, filesOverride);
}

  function mergeFiles(newFiles: File[]) {
  setSelectedFiles((prev) => {
    const map = new Map<string, File>();

    [...prev, ...newFiles].forEach((file) => {
      const key = getFileKey(file);
      map.set(key, file);
    });

    return Array.from(map.values());
  });
}

function moveSelectedFile(fromIndex: number, toIndex: number) {
  setSelectedFiles((prev) => {
    const next = [...prev];

    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= next.length ||
      toIndex >= next.length ||
      fromIndex === toIndex
    ) {
      return prev;
    }

    const [movedItem] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, movedItem);

    return next;
  });
}

  function pushAssistantInfo(textMessage: string) {
    setMessages((prev) => [...prev, { role: "assistant", text: textMessage }]);
  }

  async function checkSkuExists(sku: string) {
  const cleanSku = String(sku || "").trim();

  if (!cleanSku) {
    return { exists: false, product: null };
  }

  const form = new FormData();
  form.append("agentId", agentId);
  form.append("message", `__check_sku__:${cleanSku}`);

  const token = localStorage.getItem("token") || "";

  const response = await safeFetchJson(
  `${API}/run-agent`,
  {
    method: "POST",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
    body: form,
  },
  1
);

  return {
    exists: Boolean(response?.exists),
    product: response?.product || null,
  };
}

async function validateSkuLive(rawSku: string) {
  const cleanSku = String(rawSku || "").trim();

  if (skuValidationTimeoutRef.current) {
    clearTimeout(skuValidationTimeoutRef.current);
  }

  const currentValidationId = ++skuValidationIdRef.current;

  if (!cleanSku) {
    setSkuChecking(false);
    setSkuStatus("idle");
    setSkuStatusMessage("");
    return;
  }

  setSkuChecking(true);
  setSkuStatus("idle");
  setSkuStatusMessage("Validando SKU...");

  skuValidationTimeoutRef.current = setTimeout(async () => {
    try {
      const result = await checkSkuExists(cleanSku);

      if (currentValidationId !== skuValidationIdRef.current) {
        return;
      }

      if (result.exists) {
        setSkuStatus("taken");
        setSkuStatusMessage(
          result.product?.name
            ? `Ese SKU ya está usado por "${result.product.name}".`
            : "Ese SKU ya está en uso."
        );
      } else {
        setSkuStatus("available");
        setSkuStatusMessage("SKU disponible.");
      }
    } catch {
      if (currentValidationId !== skuValidationIdRef.current) {
        return;
      }

      setSkuStatus("idle");
      setSkuStatusMessage("No pude validar el SKU ahora.");
    } finally {
      if (currentValidationId === skuValidationIdRef.current) {
        setSkuChecking(false);
      }
    }
  }, 400);
}

function resetSkuValidationState() {
  setSkuChecking(false);
  setSkuStatus("idle");
  setSkuStatusMessage("");

  if (skuValidationTimeoutRef.current) {
    clearTimeout(skuValidationTimeoutRef.current);
    skuValidationTimeoutRef.current = null;
  }
}


async function sendEditPayload(payload: any) {
  const message = `__edit_product_action__:${JSON.stringify(payload)}`;
  const data = await enqueueJob({
    agentId,
    message,
    files: [],
  });

  if (!data?.ok && !data?.job) {
    throw new Error(data?.detail || data?.error || data?.message || "Error editando producto");
  }

  return {
    queued: true,
    job: data?.job || null,
    reply: data?.job?.title || "Edición enviada a la cola.",
  };
}

async function sendEditPayloadWithFiles(payload: any, files: File[]) {
  const message = `__edit_product_action__:${JSON.stringify(payload)}`;
  const data = await enqueueJob({
    agentId,
    message,
    files,
  });

  if (!data?.ok && !data?.job) {
    throw new Error(data?.detail || data?.error || data?.message || "Error editando producto");
  }

  return {
    queued: true,
    job: data?.job || null,
    reply: data?.job?.title || "Edición enviada a la cola.",
  };
}

async function loadEditProductDetails(candidate: EditFoundProduct) {
  const mode = candidate.sku?.trim() ? "sku" : "nombre";
  const value = candidate.sku?.trim() || candidate.name?.trim();

  if (!value) {
    throw new Error("No pude identificar el producto.");
  }

  const form = new FormData();
  form.append("agentId", agentId);
  form.append("message", `__search_edit_product__:${mode}|${value}`);

  const token = localStorage.getItem("token") || "";

  const res = await fetchWithRetry(`${API}/run-agent`, {
    method: "POST",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
    body: form,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data?.detail || data?.error || data?.message || "No pude cargar el producto."
    );
  }

  if (data?.product) {
    return normalizeEditFoundProduct(data.product, data.variationSample);
  }

  if (Array.isArray(data?.products) && data.products.length === 1) {
    return normalizeEditFoundProduct(data.products[0], data.variationSample);
  }

  if (Array.isArray(data?.candidates) && data.candidates.length === 1) {
    return normalizeEditFoundProduct(data.candidates[0], data.variationSample);
  }

  throw new Error("No pude cargar el detalle completo del producto.");
}

  function startCreateProduct() {
  setActiveAction("create");
  setEditFoundProduct(null);
  setEditCandidates([]);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  setCreateForm(initialCreateForm);
  setCreateStepIndex(0);
  setText("");
  setStockByVariationMap({});
  resetSkuValidationState();

  pushAssistantInfo(
    "Vamos a crear un producto paso por paso. Orden: fotos, nombre, SKU, colores, talles, precio, precio rebajado, precio en efectivo, stock, descripción corta y categoría."
  );
}





  function scrollChatToBottom() {
    const el = chatScrollRef.current;
    if (!el) return;

    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth",
    });
  }

  function revealChat() {
    chatScrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });

    setTimeout(() => {
      scrollChatToBottom();
    }, 120);
  }

  function scrollToComposer(focus = false) {
    composerAreaRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });

    if (focus) {
      setTimeout(() => {
        composerRef.current?.focus();
      }, 180);
    }
  }

  function scrollToEditActionField() {
    const el = editActionFieldRef.current;
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setTimeout(() => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
      }
    }, 180);
  }


  function cancelCreateProduct() {
  setActiveAction(null);
  setCreateStepIndex(0);
  setCreateForm(initialCreateForm);
  setText("");
  setStockByVariationMap({});
  setCreateSelectedCategoryIds([]);
  resetSkuValidationState();
}


  function saveCurrentCreateStepValue() {
    if (!currentCreateStep || currentCreateStep.key === "fotos") return true;

    const rawValue = text.trim();
    const isOptional = Boolean(currentCreateStep.optional);

    if (!rawValue && !isOptional) {
      if (currentCreateStep.key === "categoria" && createSelectedCategoryIds.length > 0) {
        return true;
      }
      return false;
    }

    setCreateForm((prev) => {
            switch (currentCreateStep.key) {
        case "nombre":
          return { ...prev, nombre: rawValue };
        case "sku":
          return { ...prev, sku: rawValue };
        case "colores":
          return { ...prev, colores: rawValue };
        case "talles":
          return { ...prev, talles: rawValue };
        case "precio":
          return { ...prev, precio: rawValue };
        case "precioRebajado":
          return { ...prev, precioRebajado: rawValue };
        case "precioEfectivo":
          return { ...prev, precioEfectivo: rawValue };
        case "stock":
          return prev;
        case "descripcionCorta":
          return { ...prev, descripcionCorta: rawValue };
        case "categoria":
          return { ...prev, categoria: rawValue };
        case "subcategoria":
          return { ...prev, subcategoria: rawValue };
        default:
          return prev;
      }
    });

    setText("");
    return true;
  }

  function loadCurrentStepValue(stepIndex: number) {
    const step = CREATE_STEPS_VISIBLE[stepIndex];
    if (!step || step.key === "fotos") {
      setText("");
      return;
    }

      setText(
  step.key === "nombre"
    ? createForm.nombre
    : step.key === "sku"
      ? createForm.sku
      : step.key === "colores"
        ? createForm.colores
        : step.key === "talles"
          ? createForm.talles
          : step.key === "precio"
            ? createForm.precio
            : step.key === "precioRebajado"
              ? createForm.precioRebajado
              : step.key === "precioEfectivo"
                ? createForm.precioEfectivo
                : step.key === "stock"
                  ? ""
                  : step.key === "descripcionCorta"
                    ? createForm.descripcionCorta
                    : step.key === "categoria"
                      ? createForm.categoria
                      : createForm.subcategoria
);
  }

async function nextCreateStep() {
  if (!currentCreateStep) return;

  if (currentCreateStep.key === "sku") {
    const cleanSku = text.trim();

    if (!cleanSku) {
      // SKU opcional, puede seguir vacío
    } else if (skuChecking) {
      pushAssistantInfo("Esperá un momento, todavía se está validando el SKU.");
      return;
    } else if (skuStatus === "taken") {
      pushAssistantInfo(skuStatusMessage || "Ese SKU ya está en uso. Probá con otro SKU.");
      return;
    } else if (skuStatus !== "available") {
      pushAssistantInfo("Todavía no pude validar ese SKU. Esperá un momento.");
      return;
    }
  }

  if (!saveCurrentCreateStepValue()) {
    pushAssistantInfo(`Falta completar: ${currentCreateStep.title}.`);
    return;
  }

  const nextIndex = createStepIndex + 1;

  if (nextIndex >= CREATE_STEPS_VISIBLE.length) {
    return;
  }

  setCreateStepIndex(nextIndex);
  setText("");
}


  function previousCreateStep() {
    if (createStepIndex === 0) return;

    if (!isCreateStepPhotos) {
      saveCurrentCreateStepValue();
    }

    const prevIndex = createStepIndex - 1;
    setCreateStepIndex(prevIndex);
    loadCurrentStepValue(prevIndex);
  }

  async function submitCreateProduct() {
    if (activeAction !== "create") return;

    if (!saveCurrentCreateStepValue()) {
      if (currentCreateStep) {
        pushAssistantInfo(`Falta completar: ${currentCreateStep.title}.`);
      }
      return;
    }

        const finalForm = {
      ...createForm,
      ...(currentCreateStep?.key === "nombre" ? { nombre: text.trim() } : {}),
      ...(currentCreateStep?.key === "sku" ? { sku: text.trim() } : {}),
      ...(currentCreateStep?.key === "colores" ? { colores: text.trim() } : {}),
      ...(currentCreateStep?.key === "talles" ? { talles: text.trim() } : {}),
      ...(currentCreateStep?.key === "precio" ? { precio: text.trim() } : {}),
      ...(currentCreateStep?.key === "precioRebajado" ? { precioRebajado: text.trim() } : {}),
      ...(currentCreateStep?.key === "precioEfectivo" ? { precioEfectivo: text.trim() } : {}),
      ...(currentCreateStep?.key === "descripcionCorta" ? { descripcionCorta: text.trim() } : {}),
      ...(currentCreateStep?.key === "categoria" ? { categoria: text.trim() } : {}),
      ...(currentCreateStep?.key === "subcategoria" ? { subcategoria: text.trim() } : {}),
    };

    const missingRequired: string[] = [];

    if (!finalForm.nombre.trim()) missingRequired.push("Nombre");
    if (!cleanMoney(finalForm.precio)) missingRequired.push("Precio");
    if (!finalForm.categoria.trim() && createSelectedCategoryIds.length === 0) missingRequired.push("Categoría");

    if (missingRequired.length > 0) {
      pushAssistantInfo(`Faltan estos datos para crear el producto: ${missingRequired.join(", ")}.`);
      return;
    }

    const builtMessage = buildCreateProductMessage(finalForm, stockByVariationMap, createSelectedCategoryIds);

    await sendToAgent(builtMessage, selectedFiles);

    setActiveAction(null);
    setCreateStepIndex(0);
    setCreateForm(initialCreateForm);
    setText("");
    setStockByVariationMap({});
    setCreateSelectedCategoryIds([]);
  }

useEffect(() => {
  async function loadStoreInfo() {
    try {
      const token = localStorage.getItem("token") || "";

      const res = await fetchWithRetry(`${API}/me`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

const data = await res.json();
      console.log("ME RESPONSE", data);
      setUserMe(data || null);

      const rawUrl = String(data?.store_url || "").trim();
      setStoreUrl(rawUrl);

      if (!rawUrl) {
        setStoreName("");
        return;
      }

      const clean = rawUrl
  .replace(/^https?:\/\//, "")
  .replace(/^www\./, "")
  .replace(/\/wp-json\/wc\/v3.*$/, "")
  .replace(/\/$/, "");

// 👉 dominio
const domain = clean;

// 👉 nombre "lindo"
const baseName = domain.split(".")[0];
const prettyName =
  baseName.charAt(0).toUpperCase() + baseName.slice(1);

// 👉 combinamos ambos
setStoreName(`${prettyName} (${domain})`);
    } catch {
      setStoreName("");
      setStoreUrl("");
    }
  }

  loadStoreInfo();
}, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const j = await fetchJobs();
        setJobs(j);
      } catch {}
      t = setTimeout(load, 3000);
    };

    load();

    return () => {
      if (t) clearTimeout(t);
    };
  }, []);
  
  useEffect(() => {
    if (!storageKey) return;

    try {
      const saved = localStorage.getItem(storageKey);



      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        } else {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    if (
      (activeAction === "create" && currentCreateStep?.key === "categoria") ||
      activeAction === "edit"
    ) {
      if (categoryOptions.length === 0 && !categoriesLoading) {
        loadCategories();
      }
    }
  }, [activeAction, currentCreateStep?.key]);

  useEffect(() => {
    setEditSelectedCategoryIds(
      Array.isArray(editFoundProduct?.categories)
        ? editFoundProduct.categories.map((cat) => Number(cat.id)).filter((id) => Number.isFinite(id) && id > 0)
        : []
    );
  }, [editFoundProduct]);

  useEffect(() => {
    if (activeAction !== "create" || !currentCreateStep) return;

    if (currentCreateStep.key === "fotos") {
      setText("");
      return;
    }

    loadCurrentStepValue(createStepIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAction, createStepIndex]);

  useEffect(() => {
  if (!isVariableProductDraft && createForm.stockMode === "perVariation") {
    setCreateForm((prev) => ({
      ...prev,
      stockMode: "none",
      stockGeneral: "",
    }));

    setStockByVariationMap({});
  }
}, [isVariableProductDraft, createForm.stockMode]);




  useEffect(() => {
    const timer = setTimeout(() => {
      revealChat();
    }, 120);

    return () => clearTimeout(timer);
  }, [messages, loading]);

  useEffect(() => {
    if (!activeAction) return;

    const timer = setTimeout(() => {
      scrollToComposer(true);
    }, 180);

    return () => clearTimeout(timer);
  }, [activeAction, createStepIndex, deleteMode]);

  useEffect(() => {
    if (!editActionType) return;

    const timer = setTimeout(() => {
      scrollToEditActionField();
    }, 180);

    return () => clearTimeout(timer);
  }, [editActionType]);

  useEffect(() => {
    if (!loading) return;

    const timer = setTimeout(() => {
      revealChat();
    }, 60);

    return () => clearTimeout(timer);
  }, [loading]);


  return (
    <div
      style={{
        border: "1px solid #182235",
        borderRadius: 20,
        background: "linear-gradient(180deg, #0b1220 0%, #09101c 100%)",
        minHeight: 620,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "18px 20px",
          borderBottom: "1px solid #182235",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
  <div
    style={{
      fontSize: 12,
      color: "#94a3b8",
    }}
  >
    {storeName ? `Tienda en edición: ${storeName}` : "Tienda en edición"}
  </div>

  <div
    style={{
      fontWeight: 700,
      fontSize: 18,
    }}
  >
    Chat con {agentName}
  </div>
</div>

        <button
          type="button"
          onClick={() => {
            setMessages([]);
            if (storageKey) {
              localStorage.removeItem(storageKey);
            }
          }}
          style={{
  border: "1px solid #2b3950",
  background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
  color: "#e5e7eb",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 10px 25px rgba(0,0,0,0.35)";
  el.style.borderColor = "#3b82f6";
  el.style.background = "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.borderColor = "#2b3950";
  el.style.background = "linear-gradient(180deg, #111827 0%, #0f172a 100%)";
}}
        >
          Limpiar chat
        </button>
      </div>

      <div
        style={{
          padding: "14px 16px 0 16px",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button type="button" onClick={startCreateProduct} style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}>
          Crear producto
        </button>

        <button
  type="button"
  onClick={() => {
    setActiveAction("edit");
    setEditFoundProduct(null);
    setEditCandidates([]);
    setEditActionType("");
    setEditValue("");
    setEditSection("");
    setEditAttributeValues({});
    setSelectedEditCombinations([]);
    setMoveTargetSearch("");
    setMoveTargetProduct(null);
    setMoveProductMode("before");
    setText("");
    pushAssistantInfo(
      "Decime el producto que querés editar. Podés escribir el SKU o el nombre."
    );
  }}
  style={{
    border: "1px solid #2b3950",
    background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
    color: "#e5e7eb",
    borderRadius: 14,
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: 14,
    transition: "all 0.2s ease",
  }}
  onMouseEnter={(e) => {
    const el = e.currentTarget;
    el.style.transform = "translateY(-1px)";
    el.style.boxShadow = "0 10px 25px rgba(0,0,0,0.35)";
    el.style.borderColor = "#3b82f6";
    el.style.background = "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)";
  }}
  onMouseLeave={(e) => {
    const el = e.currentTarget;
    el.style.transform = "translateY(0)";
    el.style.boxShadow = "none";
    el.style.borderColor = "#2b3950";
    el.style.background = "linear-gradient(180deg, #111827 0%, #0f172a 100%)";
  }}
>
  Editar producto
</button>

        <button
  type="button"
  onClick={() => {
    setActiveAction("delete");
    setDeleteMode("sku");
    setEditFoundProduct(null);
    setEditCandidates([]);
    setEditActionType("");
    setEditValue("");
    setEditSection("");
    setEditAttributeValues({});
    setSelectedEditCombinations([]);
    setMoveTargetSearch("");
    setMoveTargetProduct(null);
    setMoveProductMode("before");
    setText("");
    pushAssistantInfo(
      "Elegí si querés eliminar por SKU o por nombre. También podés pasar varios."
    );
  }}
  style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
>
  Eliminar producto
</button>
      </div>

      <div
  ref={chatScrollRef}
  style={{
    flex: 1,
    minHeight: 260,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowY: "auto",
  }}
>

        {messages.length === 0 && activeAction === null && (
  <div
    style={{
      color: "#94a3b8",
      fontSize: 15,
      padding: "8px 4px",
    }}
  >
    Elegí una acción para empezar.
  </div>
)}

{messages.length === 0 && activeAction !== null && (
  <div
    style={{
      color: "#94a3b8",
      fontSize: 15,
      padding: "8px 4px",
    }}
  >
    Ya podés empezar.
  </div>
)}


        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "12px 14px",
              borderRadius: 16,
              background: message.role === "user" ? "#2563eb" : "#111827",
              color: "white",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              border: message.role === "user" ? "none" : "1px solid #1f2937",
            }}
          >
            {message.text}
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "80%",
              padding: "12px 14px",
              borderRadius: 16,
              background: "#111827",
              color: "white",
              border: "1px solid #1f2937",
            }}
          >
            Pensando...
          </div>
        )}
      </div>

      {activeAction && (
      <div
        ref={composerAreaRef}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);

          const files = Array.from(e.dataTransfer.files || []).filter((file) =>
            file.type.startsWith("image/")
          );

          if (files.length > 0) {
            mergeFiles(files);
          }
        }}
        style={{
          borderTop: "1px solid #182235",
          padding: 16,
          background: isDragging ? "rgba(37,99,235,0.12)" : "rgba(3,7,18,0.55)",
        }}
      >
        {selectedFiles.length > 0 && (
  <>
    <div
      style={{
        color: "#94a3b8",
        fontSize: 13,
        marginBottom: 6,
      }}
    >
      Arrastrá las fotos para ordenar. La primera será la principal.
    </div>

    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 12,
      }}
    >
            {selectedFiles.map((file, index) => (
              <div
  key={getFileKey(file)}
  draggable
  onDragStart={() => {
  setDraggedFileIndex(index);
}}
onDragOver={(e) => {
  e.preventDefault();
  setDragOverFileIndex(index);
}}
onDragLeave={() => {
  setDragOverFileIndex((prev) => (prev === index ? null : prev));
}}
onDrop={() => {
  if (draggedFileIndex === null) return;
  moveSelectedFile(draggedFileIndex, index);
  setDraggedFileIndex(null);
  setDragOverFileIndex(null);
}}
onDragEnd={() => {
  setDraggedFileIndex(null);
  setDragOverFileIndex(null);
}}
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 999,
    background: "#111827",
    border: "1px solid #243041",
    fontSize: 13,
    color: "#d1d5db",
    cursor: "grab",
opacity: draggedFileIndex === index ? 0.65 : 1,
boxShadow: dragOverFileIndex === index ? "0 0 0 2px #3b82f6 inset" : "none",
  }}
>
                <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 8,
  }}
>
  <img
  src={URL.createObjectURL(file)}
  alt={file.name}
  draggable={false}
  style={{
    width: 44,
    height: 44,
    objectFit: "cover",
    borderRadius: 8,
    border: "1px solid #334155",
    display: "block",
    pointerEvents: "none",
    userSelect: "none",
  }}
/>

  <span>{index === 0 ? "Principal" : `Foto ${index + 1}`}</span>
</div>

               <select
  value={imageColorMap[getFileKey(file)] || ""}
    onMouseDown={(e) => e.stopPropagation()}
  onChange={(e) => {
    const key = getFileKey(file);
    const value = e.target.value;

    setImageColorMap((prev) => ({
      ...prev,
      [key]: value,
    }));
  }}
  style={{
    marginLeft: 10,
    background: "#020617",
    color: "#fff",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "4px 6px",
    fontSize: 12,
  }}
>
  <option value="">Sin color</option>
  {(createForm.colores || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((color) => {
      const currentFileKey = getFileKey(file);
      const currentSelectedColor = imageColorMap[currentFileKey] || "";

      const colorAlreadyUsedInAnotherImage = Object.entries(imageColorMap).some(
        ([fileKey, selectedColor]) =>
          fileKey !== currentFileKey && selectedColor === color
      );

      return (
        <option
          key={color}
          value={color}
          disabled={colorAlreadyUsedInAnotherImage && currentSelectedColor !== color}
        >
          {color}
        </option>
      );
    })}
</select>

                <button
                  type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
  const removedFile = selectedFiles[index];
  const removedKey = getFileKey(removedFile);

  const nextFiles = selectedFiles.filter((_, i) => i !== index);
  setSelectedFiles(nextFiles);

  setImageColorMap((prev) => {
    const next = { ...prev };
    delete next[removedKey];
    return next;
  });

  if (nextFiles.length === 0 && fileInputRef.current) {
    fileInputRef.current.value = "";
  }
}}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#93c5fd",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 13,
                  }}
                >
                  quitar
                </button>
              </div>
            ))}
          </div>
  </>
)}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "end",
          }}
          className="chat-input-grid"
        >
          <div
            style={{
              border: "1px solid #243041",
              borderRadius: 16,
              background: "#030712",
              padding: 12,
            }}
          >
            {isCreateStepPhotos ? (
  <div style={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}>
    Agregá las fotos con el botón o arrastralas acá. Cuando termines, tocá <b>Siguiente</b>.
  </div>
) : (
  <>
    {currentCreateStep?.key === "stock" && (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "#e5e7eb",
        fontSize: 14,
      }}
    >
      <input
        type="radio"
        name="stockMode"
        checked={createForm.stockMode === "none"}
        onChange={() => {
  setCreateForm((prev) => ({
    ...prev,
    stockMode: "none",
    stockGeneral: "",
  }));
  setStockByVariationMap({});
}}
      />
        Disponible
    </label>

    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "#e5e7eb",
        fontSize: 14,
      }}
    >
      <input
        type="radio"
        name="stockMode"
        checked={createForm.stockMode === "same"}
        onChange={() => {
  setCreateForm((prev) => ({
    ...prev,
    stockMode: "same",
  }));
  setStockByVariationMap({});
}}
      />
Stock general
    </label>

    {isVariableProductDraft && (
  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      color: "#e5e7eb",
      fontSize: 14,
    }}
  >
    <input
      type="radio"
      name="stockMode"
      checked={createForm.stockMode === "perVariation"}
      onChange={() => {
        setCreateForm((prev) => ({
          ...prev,
          stockMode: "perVariation",
          stockGeneral: "",
        }));
      }}
    />
    Stock por variación
  </label>
)}

  </div>
)}

{currentCreateStep?.key === "stock" && createForm.stockMode === "same" && (
  <div style={{ marginBottom: 10 }}>
    <input
      type="number"
      min="0"
      value={createForm.stockGeneral}
      onChange={(e) =>
        setCreateForm((prev) => ({
          ...prev,
          stockGeneral: e.target.value,
        }))
      }
      placeholder="Ej: 10"
      style={{
        width: "100%",
        border: "1px solid #334155",
        background: "#020617",
        color: "white",
        borderRadius: 10,
        padding: "10px 12px",
        outline: "none",
        fontSize: 14,
      }}
    />
  </div>
)}

       {currentCreateStep?.key === "stock" ? (
  <>
    {createForm.stockMode === "perVariation" && (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
        {(() => {
  const colors = (createForm.colores || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const sizes = (createForm.talles || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (colors.length > 0 && sizes.length > 0) {
    return colors.flatMap((color) =>
      sizes.map((talle) => {
        const variationKey = getVariationKey(color, talle);

        return (
          <div
            key={variationKey}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div style={{ color: "#e5e7eb", fontSize: 14 }}>
              {color} / {talle}
            </div>

            <input
              type="number"
              min="0"
              value={stockByVariationMap[variationKey] || ""}
              onChange={(e) =>
                setStockByVariationMap((prev) => ({
                  ...prev,
                  [variationKey]: e.target.value,
                }))
              }
              placeholder="Stock"
              style={{
                width: "100%",
                border: "1px solid #334155",
                background: "#020617",
                color: "white",
                borderRadius: 10,
                padding: "8px 10px",
                outline: "none",
                fontSize: 14,
              }}
            />
          </div>
        );
      })
    );
  }

  if (colors.length > 0) {
    return colors.map((color) => {
      const variationKey = getVariationKey(color, "");

      return (
        <div
          key={variationKey}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 120px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ color: "#e5e7eb", fontSize: 14 }}>{color}</div>

          <input
            type="number"
            min="0"
            value={stockByVariationMap[variationKey] || ""}
            onChange={(e) =>
              setStockByVariationMap((prev) => ({
                ...prev,
                [variationKey]: e.target.value,
              }))
            }
            placeholder="Stock"
            style={{
              width: "100%",
              border: "1px solid #334155",
              background: "#020617",
              color: "white",
              borderRadius: 10,
              padding: "8px 10px",
              outline: "none",
              fontSize: 14,
            }}
          />
        </div>
      );
    });
  }

  if (sizes.length > 0) {
    return sizes.map((talle) => {
      const variationKey = getVariationKey("", talle);

      return (
        <div
          key={variationKey}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 120px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ color: "#e5e7eb", fontSize: 14 }}>{talle}</div>

          <input
            type="number"
            min="0"
            value={stockByVariationMap[variationKey] || ""}
            onChange={(e) =>
              setStockByVariationMap((prev) => ({
                ...prev,
                [variationKey]: e.target.value,
              }))
            }
            placeholder="Stock"
            style={{
              width: "100%",
              border: "1px solid #334155",
              background: "#020617",
              color: "white",
              borderRadius: 10,
              padding: "8px 10px",
              outline: "none",
              fontSize: 14,
            }}
          />
        </div>
      );
    });
  }

  return null;
})()}

        {(createForm.colores || "").split(",").map((c) => c.trim()).filter(Boolean).length === 0 &&
 (createForm.talles || "").split(",").map((t) => t.trim()).filter(Boolean).length === 0 && (
  <div style={{ color: "#94a3b8", fontSize: 13 }}>
    Para cargar stock por variación primero completá colores o talles.
  </div>
)}
      </div>
    )}
  </>
) : (
  <textarea
  ref={composerRef}
  value={text}
  onChange={(e) => {
    const value = e.target.value;
    setText(value);

    if (currentCreateStep?.key === "sku") {
      validateSkuLive(value);
    }
  }}
    onKeyDown={(e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();

        if (activeAction === "create") {
  if (createStepIndex < CREATE_STEPS_VISIBLE.length - 1) {
    nextCreateStep();
  } else {
    submitCreateProduct();
  }
  return;
}

        handleSend();
      }
    }}
    placeholder={
  activeAction === "delete"
    ? deleteMode === "sku"
      ? "Ej: REM-001\nREM-002"
      : "Ej: Remera básica negra\nRemera básica blanca"
    : currentCreateStep?.placeholder || "Escribí tu mensaje..."
}
    rows={3}
    style={{
      width: "100%",
      resize: "none",
      border: "none",
      background: "transparent",
      color: "white",
      outline: "none",
      fontSize: 15,
      lineHeight: 1.5,
      marginBottom: 10,
    }}
  />
)}
{(activeAction === "create" && currentCreateStep?.key === "categoria") && (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
    <div style={{ color: "#cbd5e1", fontSize: 13 }}>
      También podés marcar categorías existentes:
    </div>

    {categoriesError && <div style={{ color: "#fca5a5", fontSize: 13 }}>{categoriesError}</div>}
    {categoriesLoading && <div style={{ color: "#94a3b8", fontSize: 13 }}>Cargando categorías...</div>}

    <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
      {categoryOptions.map((category) => {
        const checked = createSelectedCategoryIds.includes(Number(category.id));
        const label = categoryPathMap.get(Number(category.id)) || category.name;

        return (
          <label
            key={category.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: checked ? "#2563eb" : "#020617",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                setCreateSelectedCategoryIds((prev) =>
                  prev.includes(Number(category.id))
                    ? prev.filter((id) => id !== Number(category.id))
                    : [...prev, Number(category.id)]
                )
              }
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  </div>
)}

{currentCreateStep?.key === "sku" && skuStatusMessage && (
  <div
    style={{
      marginTop: 6,
      fontSize: 13,
      color:
        skuStatus === "taken"
          ? "#f87171"
          : skuStatus === "available"
          ? "#4ade80"
          : "#94a3b8",
    }}
  >
    {skuChecking ? "Validando SKU..." : skuStatusMessage}
  </div>
)}
  </>
)}
{activeAction === "edit" && !editFoundProduct && editCandidates.length > 0 && (
  <div
    style={{
      marginTop: 12,
      marginBottom: 12,
      padding: 12,
      borderRadius: 14,
      border: "1px solid #334155",
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    <div style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 14 }}>
      Elegí el producto correcto
    </div>

    <div style={{ color: "#94a3b8", fontSize: 13 }}>
      Encontré estos productos parecidos:
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {editCandidates.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          onClick={async () => {
  try {
    setLoading(true);

    const fullProduct = await loadEditProductDetails(candidate);

    setEditFoundProduct(fullProduct);
    setEditCandidates([]);
    setEditActionType("");
    setEditValue("");
    setEditSection("");
    setEditAttributeValues({});
    setSelectedEditCombinations([]);
    setMoveTargetSearch("");
setMoveTargetProduct(null);
setMoveProductMode("before");

    pushAssistantInfo(`Elegiste: ${fullProduct.name}. Ahora elegí qué querés editar.`);
  } catch (error: any) {
    pushAssistantInfo(
      error?.message || "No pude cargar el detalle completo del producto."
    );
  } finally {
    setLoading(false);
  }
}}
          style={{
            textAlign: "left",
            border: "1px solid #334155",
            background: "#020617",
            color: "#e5e7eb",
            borderRadius: 12,
            padding: "10px 12px",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          <div style={{ fontWeight: 700 }}>{candidate.name}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            SKU: {candidate.sku || "(sin SKU)"} · Tipo: {candidate.type || "-"}
          </div>
        </button>
      ))}
    </div>
  </div>
)}

{activeAction === "edit" && editFoundProduct && (
  <div
    style={{
      marginTop: 12,
      marginBottom: 12,
      padding: 12,
      borderRadius: 14,
      border: "1px solid #334155",
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    <div style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 14 }}>
      Editando: {editFoundProduct.name}
      {editFoundProduct.sku ? ` (SKU: ${editFoundProduct.sku})` : ""}
    </div>

    <div
  style={{
    color: "#94a3b8",
    fontSize: 12,
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
  }}
>
  <div>
    Precio normal: {editFoundProduct.regularPrice || "(vacío)"}
  </div>

  <div>
  Precio de oferta: {editFoundProduct.salePrice || "(vacío)"}
</div>

{userMe?.usa_precio_efectivo && (
  <div>
    Precio en efectivo: {editFoundProduct.cashPriceGeneral || "(vacío)"}
  </div>
)}
<div>
  Categorías: {Array.isArray(editFoundProduct.categories) && editFoundProduct.categories.length > 0 ? editFoundProduct.categories.map((cat) => cat.name).join(", ") : "(sin categorías)"}
</div>
</div>


    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
  <button
    type="button"
    onClick={() => {
      setEditSection("precio");
      setEditActionType("");
      setEditValue("");
      setEditAttributeValues({});
      setSelectedEditCombinations([]);
      setMoveTargetSearch("");
      setMoveTargetProduct(null);
      setMoveProductMode("before");
    }}
    style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
  >
    Precio
  </button>

  <button
    type="button"
    onClick={() => {
      setEditSection("fotos");
      setEditActionType("");
      setEditValue("");
      setEditAttributeValues({});
      setSelectedEditCombinations([]);
      setMoveTargetSearch("");
      setMoveTargetProduct(null);
      setMoveProductMode("before");
    }}
    style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
  >
    Fotos
  </button>

  <button
    type="button"
    onClick={() => {
      setEditSection("stock");
      setEditActionType("");
      setEditValue("");
      setEditAttributeValues({});
      setSelectedEditCombinations([]);
      setMoveTargetSearch("");
      setMoveTargetProduct(null);
      setMoveProductMode("before");
    }}
    style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
  >
    Stock
  </button>

  <button
    type="button"
    onClick={() => {
      setEditSection("descripcion");
      setEditActionType("cambiar_descripcion");
      setEditValue("");
      setEditAttributeValues({});
      setSelectedEditCombinations([]);
      setMoveTargetSearch("");
      setMoveTargetProduct(null);
      setMoveProductMode("before");
    }}
    style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
  >
    Descripción
  </button>

  <button
    type="button"
    onClick={() => {
      setEditSection("categorias");
      setEditActionType("cambiar_categorias");
      setEditValue("");
      setEditAttributeValues({});
      setSelectedEditCombinations([]);
      setMoveTargetSearch("");
      setMoveTargetProduct(null);
      setMoveProductMode("before");
      if (categoryOptions.length === 0) loadCategories();
    }}
    style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
  >
    Categorías
  </button>

  <button
    type="button"
    onClick={() => {
      setEditSection("");
      setEditActionType("mover_producto_fecha");
      setEditValue("");
      setEditAttributeValues({});
      setSelectedEditCombinations([]);
      setMoveTargetSearch("");
      setMoveTargetProduct(null);
      setMoveProductMode("before");
    }}
    style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
  >
    Posición
  </button>
</div>

{editSection === "precio" && (
  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
    <button
  type="button"
  onClick={() => {
  setEditActionType("cambiar_precio");
  setEditValue("");
  setEditAttributeValues({});
  setSelectedEditCombinations([])
}}
  style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
>
  Cambiar precio
</button>


{userMe?.usa_precio_efectivo && (
  <button
    type="button"
    onClick={() => {
      setEditActionType("cambiar_precio_efectivo");
      setEditValue(editFoundProduct?.cashPriceGeneral || "");
      setSelectedEditCombinations([]);
    }}
    style={{
      border: "1px solid #2563eb",
      background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
      color: "white",
      borderRadius: 14,
      padding: "10px 14px",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 700,
      transition: "all 0.2s ease",
    }}
    onMouseEnter={(e) => {
      const el = e.currentTarget;
      el.style.transform = "translateY(-1px)";
      el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
      el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
    }}
    onMouseLeave={(e) => {
      const el = e.currentTarget;
      el.style.transform = "translateY(0)";
      el.style.boxShadow = "none";
      el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
    }}
  >
    Cambiar precio en efectivo
  </button>
)}

    {!hasEditSalePrice ? (
  <button
    type="button"
    onClick={() => {
  setEditActionType("agregar_precio_rebajado");
  setEditValue("");
  setSelectedEditCombinations([])
}}
    style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
  >
    Agregar precio rebajado
  </button>
) : (
  <>
    <button
      type="button"
      onClick={() => {
  setEditActionType("cambiar_precio_rebajado");
  setEditValue("");
  setSelectedEditCombinations([])
}}
      style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
    >
      Cambiar precio rebajado
    </button>

    <button
      type="button"
      onClick={() => {
        setEditActionType("quitar_precio_rebajado");
        setEditValue("");
      }}
      style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
    >
      Quitar precio rebajado
    </button>
  </>
)}
  </div>
)}

{editActionType === "cambiar_precio_efectivo" && (
  <div
    style={{
      width: "100%",
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      border: "1px solid #334155",
      background: "#020617",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <div style={{ color: "#cbd5e1", fontSize: 13 }}>
      Precio en efectivo
    </div>

    <input
      type="number"
      min="0"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      placeholder="Ej: 11900"
      style={{
        width: "100%",
        border: "1px solid #334155",
        background: "#020617",
        color: "white",
        borderRadius: 10,
        padding: "10px 12px",
        outline: "none",
        fontSize: 14,
      }}
    />
  </div>
)}

{editSection === "stock" && (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      border: "1px solid #334155",
      background: "#020617",
    }}
  >
    <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    gap: 10,
    alignItems: "center",
    marginBottom: 4,
    color: "#cbd5e1",
    fontSize: 13,
  }}
>
  <div></div>
  <div></div>
  <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>
    Marcar para manejar stock numérico
  </div>
</div>

    {Array.isArray(editFoundProduct?.variations) &&
    editFoundProduct.variations.length > 0 ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {editFoundProduct.variations.map((variation, index) => {
          const variationLabel =
            variation.attributes.map((attr) => attr.option).join(" / ") ||
            `Variación ${variation.id}`;

          const isChecked = Boolean(variation.manage_stock_checked);

          return (
            <div
              key={variation.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #334155",
                background: "#0f172a",
              }}
            >
              <div style={{ color: "#e5e7eb", fontSize: 14 }}>
                {variationLabel}
              </div>

              {isChecked ? (
                <input
                  type="number"
                  min="0"
                  value={variation.stock_quantity ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;

                    setEditFoundProduct((prev) => {
                      if (!prev) return prev;

                      const nextVariations = [...(prev.variations || [])];
                      nextVariations[index] = {
                        ...nextVariations[index],
                        stock_quantity: value,
                        stock_touched: true,
                        manage_stock_checked: true,
                        stock_status:
                          Number(value) > 0 ? "instock" : "outofstock",
                      };

                      return {
                        ...prev,
                        variations: nextVariations,
                      };
                    });
                  }}
                  placeholder="Stock"
                  style={{
                    width: 120,
                    border: "1px solid #334155",
                    background: "#020617",
                    color: "white",
                    borderRadius: 10,
                    padding: "8px 10px",
                    outline: "none",
                    fontSize: 14,
                  }}
                />
              ) : (
                <select
                  value={variation.stock_status || "instock"}
                  onChange={(e) => {
                    const value = e.target.value as "instock" | "outofstock";

                    setEditFoundProduct((prev) => {
                      if (!prev) return prev;

                      const nextVariations = [...(prev.variations || [])];
                      nextVariations[index] = {
                        ...nextVariations[index],
                        stock_status: value,
                        status_touched: true,
                        manage_stock_checked: false,
                      };

                      return {
                        ...prev,
                        variations: nextVariations,
                      };
                    });
                  }}
                  style={{
                    width: 120,
                    border: "1px solid #334155",
                    background: "#020617",
                    color: "white",
                    borderRadius: 10,
                    padding: "8px 10px",
                    outline: "none",
                    fontSize: 14,
                  }}
                >
                  <option value="instock">Disponible</option>
                  <option value="outofstock">Agotado</option>
                </select>
              )}

              <input
  type="checkbox"
  checked={isChecked}
  onChange={(e) => {
    const checked = e.target.checked;

    setEditFoundProduct((prev) => {
      if (!prev) return prev;

      const nextVariations = [...(prev.variations || [])];
      nextVariations[index] = {
        ...nextVariations[index],
        manage_stock_checked: checked,
        stock_touched: checked ? true : false,
        status_touched: !checked ? true : false,
        stock_quantity: checked
          ? nextVariations[index].stock_quantity ?? ""
          : "",
        stock_status:
          nextVariations[index].stock_status || "instock",
      };

      return {
        ...prev,
        variations: nextVariations,
      };
    });
  }}
  style={{
    width: 16,
    height: 16,
    cursor: "pointer",
  }}
/>
            </div>
          );
        })}
      </div>
    ) : (
      <input
        type="number"
        min="0"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        placeholder="Ej: 5"
        style={{
          width: "100%",
          border: "1px solid #334155",
          background: "#020617",
          color: "white",
          borderRadius: 10,
          padding: "10px 12px",
          outline: "none",
          fontSize: 14,
        }}
      />
    )}

    <button
      type="button"
      onClick={async () => {
        if (!editFoundProduct?.id) return;

        const hasVariations =
          Array.isArray(editFoundProduct?.variations) &&
          editFoundProduct.variations.length > 0;

        if (hasVariations) {
  const hasSomethingToSave = (editFoundProduct.variations || []).some(
    (variation) =>
      (variation.manage_stock_checked &&
        String(variation.stock_quantity ?? "").trim() !== "") ||
      (!variation.manage_stock_checked &&
        String(variation.stock_status || "").trim() !== "")
  );

  if (!hasSomethingToSave) {
    pushAssistantInfo("Completá al menos una variación.");
    return;
  }
} else {
          if (!String(editValue || "").trim()) {
            pushAssistantInfo("Escribí una cantidad.");
            return;
          }
        }

        try {
          setLoading(true);

          const response = await sendEditPayload({
  action: "cambiar_stock",
  productId: editFoundProduct.id,
      productName: editFoundProduct.name,
  manageStock: true,
  stockQuantity:
    Array.isArray(editFoundProduct?.variations) &&
    editFoundProduct.variations.length > 0
      ? undefined
      : Number(editValue || 0),
  selectedCombinations:
    Array.isArray(editFoundProduct?.variations) &&
    editFoundProduct.variations.length > 0
      ? editFoundProduct.variations.map((variation) =>
          variation.attributes.map((attr) => attr.option)
        )
      : selectedEditCombinations,
  variations:
    Array.isArray(editFoundProduct?.variations) &&
    editFoundProduct.variations.length > 0
      ? editFoundProduct.variations.map((variation) => ({
          id: variation.id,
          stock_quantity: variation.manage_stock_checked
            ? Number(variation.stock_quantity || 0)
            : undefined,
          stock_status: variation.manage_stock_checked
            ? Number(variation.stock_quantity || 0) > 0
              ? "instock"
              : "outofstock"
            : variation.stock_status || "instock",
          manage_stock: Boolean(variation.manage_stock_checked),
        }))
      : undefined,
});

setLoading(false);

pushAssistantInfo(
  response?.reply || "Stock actualizado correctamente."
);

setEditValue("");

if (!response?.queued) {
setRefreshingEditProduct(true);

setTimeout(async () => {
  try {
    const form = new FormData();
    form.append("agentId", agentId);

    const mode = editFoundProduct?.sku ? "sku" : "nombre";
    const value = editFoundProduct?.sku || editFoundProduct?.name;

    form.append("message", `__search_edit_product__:${mode}|${value}`);

    const token = localStorage.getItem("token") || "";

    const res = await fetchWithRetry(`${API}/run-agent`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    const refreshed = await res.json();

    if (refreshed?.product) {
      setEditFoundProduct(
        normalizeEditFoundProduct(refreshed.product, refreshed.variationSample)
      );
    }
  } catch {
  } finally {
    setRefreshingEditProduct(false);
  }
}, 0);
}
        } catch (error: any) {
          pushAssistantInfo(
            error?.message || "No pude cambiar el stock."
          );
        } finally {
          setLoading(false);
        }
      }}
      style={wizardPrimaryButtonStyle}
    >
      Guardar stock
    </button>
  </div>
)}

{editSection === "fotos" && (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      border: "1px solid #334155",
      background: "#020617",
    }}
  >
    <div style={{ color: "#cbd5e1", fontSize: 13 }}>
  Podés agregar fotos al producto o asignar una foto a variantes específicas.
</div>



{Array.isArray(editFoundProduct?.variations) && editFoundProduct.variations.length > 0 && (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      marginBottom: 12,
    }}
  >
    <div style={{ color: "#94a3b8", fontSize: 13 }}>
      Fotos asignadas por variante
    </div>

    <div style={{ color: "#94a3b8", fontSize: 12 }}>
      Marcá las variantes para asignarles una foto nueva o para quitarles la foto actual.
    </div>

  <div style={{ color: "#cbd5e1", fontSize: 13 }}>
      Seleccioná las variantes desde la lista de arriba. Después podés asignarles una foto o quitárselas.
    </div>

    <div style={{ color: "#94a3b8", fontSize: 12 }}>
      Seleccionadas: {selectedEditCombinations.length}
    </div>

    <button
      type="button"
      onClick={() => {
        fileInputRef.current?.click();
      }}
      style={wizardPrimaryButtonStyle}
    >
      Cargar foto para variante/s
    </button>

    <button
      type="button"
      onClick={async () => {
        if (!editFoundProduct?.id || selectedFiles.length === 0) {
          pushAssistantInfo("Seleccioná una foto primero.");
          return;
        }

        if (selectedEditCombinations.length === 0) {
          pushAssistantInfo("Seleccioná variantes.");
          return;
        }

        try {
          setLoading(true);

          const response = await sendEditPayloadWithFiles(
            {
              action: "cambiar_fotos_variantes",
              productId: editFoundProduct.id,
      productName: editFoundProduct.name,
              selectedCombinations: selectedEditCombinations.map((combo) =>
                Object.values(combo)
              ),
            },
            [selectedFiles[0]]
          );

          pushAssistantInfo(
            response?.reply || "Foto asignada correctamente a las variantes seleccionadas."
          );

          if (!response?.queued) {
            const fullProduct = await loadEditProductDetails(editFoundProduct);
            setEditFoundProduct(fullProduct);
          }
          setSelectedEditCombinations([]);
          setSelectedFiles([]);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        } catch (error: any) {
          pushAssistantInfo(error?.message || "Error.");
        } finally {
          setLoading(false);
        }
      }}
      style={wizardPrimaryButtonStyle}
    >
      Asignar foto a variantes
    </button>

    <button
      type="button"
      onClick={async () => {
        if (!editFoundProduct?.id) {
          pushAssistantInfo("Falta producto.");
          return;
        }

        if (selectedEditCombinations.length === 0) {
          pushAssistantInfo("Seleccioná variantes.");
          return;
        }

        try {
          setLoading(true);

          const response = await sendEditPayload({
            action: "quitar_fotos_variantes",
            productId: editFoundProduct.id,
      productName: editFoundProduct.name,
            selectedCombinations: selectedEditCombinations.map((combo) =>
              Object.values(combo)
            ),
          });

          pushAssistantInfo(
            response?.reply || "Foto eliminada de las variantes."
          );

          if (!response?.queued) {
            const fullProduct = await loadEditProductDetails(editFoundProduct);
            setEditFoundProduct(fullProduct);
          }
          setSelectedEditCombinations([]);
        } catch (error: any) {
          pushAssistantInfo(
            error?.message || "No pude quitar la foto."
          );
        } finally {
          setLoading(false);
        }
      }}
      style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
    >
      Quitar foto de variantes
    </button>


    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {editFoundProduct.variations.map((variation) => {
        const combo = getVariationCombination(variation);
        const checked = isCombinationSelected(combo);

        return (
          <label
            key={variation.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 12,
              border: checked ? "1px solid #2563eb" : "1px solid #334155",
              background: checked ? "rgba(37,99,235,0.18)" : "#0f172a",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleCombination(combo)}
            />

            {variation.image?.src ? (
              <img
                src={variation.image.src}
                alt={`Variación ${variation.id}`}
                style={{
                  width: 64,
                  height: 64,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #334155",
                }}
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "#020617",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  fontSize: 12,
                }}
              >
                Sin foto
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 600 }}>
                {variation.attributes.map((attr) => attr.option).join(" / ") || `Variación ${variation.id}`}
              </div>

              <div style={{ color: "#94a3b8", fontSize: 12 }}>
                ID variante: {variation.id}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  </div>
)}

    {Array.isArray(editFoundProduct?.images) && editFoundProduct.images.length === 0 && (
  <div style={{ color: "#94a3b8", fontSize: 13 }}>
    Este producto no tiene fotos cargadas.
  </div>
)}

    {Array.isArray(editFoundProduct?.images) && editFoundProduct.images.length > 0 && (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
    {editFoundProduct.images.map((img, index) => (
      <div
        key={img.id}
        draggable
        onDragStart={() => {
          setDraggedProductImageIndex(index);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverProductImageIndex(index);
        }}
        onDragLeave={() => {
          setDragOverProductImageIndex((prev) => (prev === index ? null : prev));
        }}
        onDrop={async () => {
          if (
            draggedProductImageIndex === null ||
            draggedProductImageIndex === index ||
            !editFoundProduct?.id
          ) {
            return;
          }

          const currentImages = [...(editFoundProduct.images || [])];
          const [movedItem] = currentImages.splice(draggedProductImageIndex, 1);
          currentImages.splice(index, 0, movedItem);

          setEditFoundProduct((prev) =>
            prev
              ? {
                  ...prev,
                  images: currentImages,
                }
              : prev
          );

          setDraggedProductImageIndex(null);
          setDragOverProductImageIndex(null);

          try {
            setLoading(true);

            const response = await sendEditPayload({
              action: "ordenar_fotos_producto",
              productId: editFoundProduct.id,
      productName: editFoundProduct.name,
              orderedImageIds: currentImages.map((item) => item.id),
            });

            pushAssistantInfo(
              response?.reply || "Fotos reordenadas correctamente."
            );
          } catch (error: any) {
            pushAssistantInfo(
              error?.message || "No pude reordenar las fotos."
            );
          } finally {
            setLoading(false);
          }
        }}
        onDragEnd={() => {
          setDraggedProductImageIndex(null);
          setDragOverProductImageIndex(null);
        }}
        style={{
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 8,
          background: "#0f172a",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: 120,
          cursor: "grab",
          opacity: draggedProductImageIndex === index ? 0.65 : 1,
          boxShadow:
            dragOverProductImageIndex === index ? "0 0 0 2px #3b82f6 inset" : "none",
        }}
      >
        <img
          src={img.src}
          alt={`Imagen ${img.id}`}
          style={{
            width: "100%",
            height: 100,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid #334155",
          }}
        />

        <div style={{ color: "#94a3b8", fontSize: 12 }}>
          {index === 0 ? "Principal" : `Foto ${index + 1}`}
        </div>

        <button
          type="button"
          onClick={async () => {
            if (!editFoundProduct?.id) return;

            try {
              setLoading(true);

              const response = await sendEditPayload({
                action: "eliminar_fotos_producto",
                productId: editFoundProduct.id,
      productName: editFoundProduct.name,
                imageIds: [img.id],
              });

              pushAssistantInfo(
                response?.reply || "Foto eliminada correctamente."
              );

              setEditFoundProduct((prev) =>
                prev
                  ? {
                      ...prev,
                      images: (prev.images || []).filter((item) => item.id !== img.id),
                    }
                  : prev
              );
            } catch (error: any) {
              pushAssistantInfo(
                error?.message || "No pude eliminar la foto."
              );
            } finally {
              setLoading(false);
            }
          }}
          style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
        >
          Eliminar
        </button>
      </div>
    ))}
  </div>
)}

    <button
  type="button"
  onClick={async () => {
    if (!editFoundProduct?.id || selectedFiles.length === 0) {
      pushAssistantInfo("Agregá al menos una foto.");
      return;
    }

    try {
      setLoading(true);

      const response = await sendEditPayloadWithFiles(
        {
          action: "agregar_fotos_producto",
          productId: editFoundProduct.id,
      productName: editFoundProduct.name,
        },
        selectedFiles
      );

      pushAssistantInfo(
        response?.reply || "Fotos agregadas correctamente."
      );

      const mode = editFoundProduct?.sku ? "sku" : "nombre";
const value = editFoundProduct?.sku || editFoundProduct?.name;

if (value && !response?.queued) {
  const form = new FormData();
  form.append("agentId", agentId);
  form.append("message", `__search_edit_product__:${mode}|${value}`);

  const token = localStorage.getItem("token") || "";

  const refreshRes = await fetchWithRetry(`${API}/run-agent`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  const refreshed = await refreshRes.json();

  if (refreshed?.product) {
    setEditFoundProduct(
      normalizeEditFoundProduct(refreshed.product, refreshed.variationSample)
    );
  }
}

setSelectedFiles([]);
if (fileInputRef.current) {
  fileInputRef.current.value = "";
}
    } catch (error: any) {
      pushAssistantInfo(
        error?.message || "No pude agregar las fotos."
      );
    } finally {
      setLoading(false);
    }
  }}
  style={wizardPrimaryButtonStyle}
>
  Agregar fotos al producto
</button>

{Array.isArray(editFoundProduct?.variations) && editFoundProduct.variations.length > 0 && (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      marginTop: 12,
      paddingTop: 12,
      borderTop: "1px solid #334155",
    }}
  >
  
  </div>
)}

  </div>
)}

    {editSection === "categorias" && (
  <div
    style={{
      width: "100%",
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      border: "1px solid #334155",
      background: "#020617",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    <div style={{ color: "#cbd5e1", fontSize: 13 }}>Marcá las categorías para este producto.</div>
    {categoriesError && <div style={{ color: "#fca5a5", fontSize: 13 }}>{categoriesError}</div>}
    {categoriesLoading && <div style={{ color: "#94a3b8", fontSize: 13 }}>Cargando categorías...</div>}
    <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
      {categoryOptions.map((category) => {
        const checked = editSelectedCategoryIds.includes(Number(category.id));
        const label = categoryPathMap.get(Number(category.id)) || category.name;
        return (
          <label
            key={category.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: checked ? "#2563eb" : "#020617",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                setEditSelectedCategoryIds((prev) =>
                  prev.includes(Number(category.id))
                    ? prev.filter((id) => id !== Number(category.id))
                    : [...prev, Number(category.id)]
                )
              }
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  </div>
)}

{editActionType && (
      <div
        style={{
          marginTop: 8,
          padding: 12,
          borderRadius: 12,
          border: "1px solid #334155",
          background: "#020617",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ color: "#cbd5e1", fontSize: 13 }}>
  {editActionType === "cambiar_precio" && "Escribí el nuevo precio. Opcional: filtrá por atributos globales."}
  {editActionType === "agregar_precio_rebajado" && "Escribí el precio rebajado."}
  {editActionType === "cambiar_precio_rebajado" && "Escribí el nuevo precio rebajado."}
  {editActionType === "quitar_precio_rebajado" && "Confirmá que querés quitar el precio rebajado."}
  {editActionType === "cambiar_descripcion" && "Escribí la nueva descripción."}
  {editActionType === "cambiar_categorias" && "Marcá las categorías y guardá."}
  {editActionType === "mover_producto_fecha" && "Elegí si querés poner este producto antes o después de otro producto."}
  {editActionType === "cambiar_precio_efectivo" && "Escribí el nuevo precio en efectivo."}
</div>

{editActionType === "cambiar_descripcion" ? (
  <textarea
    value={editValue}
    onChange={(e) => setEditValue(e.target.value)}
    placeholder="Nueva descripción"
    rows={4}
    style={{
      width: "100%",
      resize: "vertical",
      border: "1px solid #334155",
      background: "#020617",
      color: "white",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      fontSize: 14,
      lineHeight: 1.5,
    }}
  />
) : editActionType === "quitar_precio_rebajado" ? (
  <div
    style={{
      color: "#94a3b8",
      fontSize: 14,
      padding: "10px 12px",
      border: "1px solid #334155",
      borderRadius: 10,
      background: "#020617",
    }}
  >
    Este producto tiene precio rebajado cargado. Tocá “Guardar cambio” para quitarlo.
  </div>
) : editActionType === "cambiar_categorias" ? (
  <div
    style={{
      color: "#94a3b8",
      fontSize: 14,
      padding: "10px 12px",
      border: "1px solid #334155",
      borderRadius: 10,
      background: "#020617",
    }}
  >
    Tocá “Guardar cambio” para actualizar las categorías marcadas.
  </div>
) : editActionType === "mover_producto_fecha" ? (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => setMoveProductMode("before")}
        style={{
          ...quickActionSecondaryStyle,
          background: moveProductMode === "before" ? "#2563eb" : "#111827",
          border: moveProductMode === "before" ? "1px solid #2563eb" : "1px solid #243041",
        }}
      >
        Antes de
      </button>

      <button
        type="button"
        onClick={() => setMoveProductMode("after")}
        style={{
          ...quickActionSecondaryStyle,
          background: moveProductMode === "after" ? "#2563eb" : "#111827",
          border: moveProductMode === "after" ? "1px solid #2563eb" : "1px solid #243041",
        }}
      >
        Después de
      </button>
    </div>

    <input
      type="text"
      value={moveTargetSearch}
      onChange={(e) => setMoveTargetSearch(e.target.value)}
      placeholder="Nombre o SKU del producto de referencia"
      style={{
        width: "100%",
        border: "1px solid #334155",
        background: "#020617",
        color: "white",
        borderRadius: 10,
        padding: "10px 12px",
        outline: "none",
        fontSize: 14,
      }}
    />

    <button
      type="button"
      onClick={async () => {
        const raw = moveTargetSearch.trim();

        if (!raw) {
          pushAssistantInfo("Escribí el producto de referencia.");
          return;
        }

        try {
          setLoading(true);

          const mode = raw.includes(" ") ? "nombre" : "sku";
          const form = new FormData();
          form.append("agentId", agentId);
          form.append("message", `__search_edit_product__:${mode}|${raw}`);

          const token = localStorage.getItem("token") || "";

          const res = await fetchWithRetry(`${API}/run-agent`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: form,
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(
              data?.detail || data?.error || data?.message || "Error buscando producto."
            );
          }

          if (data?.product) {
            const found = normalizeEditFoundProduct(data.product, data.variationSample);

            if (Number(found.id) === Number(editFoundProduct?.id)) {
              pushAssistantInfo("Elegí otro producto distinto como referencia.");
              return;
            }

            setMoveTargetProduct(found);
            pushAssistantInfo(`Producto de referencia encontrado: ${found.name}.`);
            return;
          }

          if (Array.isArray(data?.products) && data.products.length === 1) {
            const found = normalizeEditFoundProduct(data.products[0], data.variationSample);

            if (Number(found.id) === Number(editFoundProduct?.id)) {
              pushAssistantInfo("Elegí otro producto distinto como referencia.");
              return;
            }

            setMoveTargetProduct(found);
            pushAssistantInfo(`Producto de referencia encontrado: ${found.name}.`);
            return;
          }

          pushAssistantInfo("No pude encontrar un único producto de referencia. Probá con el SKU exacto.");
        } catch (error: any) {
          pushAssistantInfo(error?.message || "No pude buscar el producto de referencia.");
        } finally {
          setLoading(false);
        }
      }}
      style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
    >
      Buscar producto de referencia
    </button>

    {moveTargetProduct && (
      <div
        style={{
          border: "1px solid #334155",
          background: "#0f172a",
          borderRadius: 12,
          padding: "10px 12px",
          color: "#e5e7eb",
          fontSize: 14,
        }}
      >
        Referencia: {moveTargetProduct.name}
        {moveTargetProduct.sku ? ` (SKU: ${moveTargetProduct.sku})` : ""}
      </div>
    )}
  </div>
) : (
  <input
    type="number"
    value={editValue}
    onChange={(e) => setEditValue(e.target.value)}
    placeholder="Ej: 25000"
    style={{
      width: "100%",
      border: "1px solid #334155",
      background: "#020617",
      color: "white",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      fontSize: 14,
    }}
  />
)}

{editActionType !== "mover_producto_fecha" && (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
    <div style={{ fontSize: 12, color: "#94a3b8" }}>
      Seleccioná las variaciones a modificar:
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {editAttributeCombinations.map((combo, index) => {
        const checked = isCombinationSelected(combo);

        return (
          <label
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: checked ? "#2563eb" : "#020617",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleCombination(combo)}
            />

            <span>
              {Object.entries(combo)
                .map(([_, v]) => `${v}`)
                .join(" / ")}
            </span>
          </label>
        );
      })}
    </div>
  </div>
)}

        <button
          type="button"
          onClick={async () => {
  if (!editFoundProduct?.id || !editActionType) {
  pushAssistantInfo("Falta elegir una acción.");
  return;
}

if (
  editActionType !== "quitar_precio_rebajado" &&
  editActionType !== "mover_producto_fecha" &&
  editActionType !== "cambiar_categorias" &&
  !editValue.trim()
) {
  pushAssistantInfo("Completá el valor antes de guardar.");
  return;
}

if (editActionType === "mover_producto_fecha" && !moveTargetProduct?.id) {
  pushAssistantInfo("Buscá y elegí el producto de referencia.");
  return;
}

if (editActionType === "cambiar_categorias" && editSelectedCategoryIds.length === 0) {
  pushAssistantInfo("Marcá al menos una categoría.");
  return;
}

  try {
    setLoading(true);

    const payload =
  editActionType === "cambiar_categorias"
  ? {
      action: "cambiar_categorias",
      productId: editFoundProduct.id,
      productName: editFoundProduct.name,
      categoryIds: editSelectedCategoryIds,
    }
  : editActionType === "cambiar_precio"
  ? {
      action: "cambiar_precio",
      productId: editFoundProduct.id,
      productName: editFoundProduct.name,
      regularPrice: editValue.trim(),
      selectedCombinations: selectedEditCombinations.map((combo) =>
        Object.values(combo)
      ),
    }
    : editActionType === "agregar_precio_rebajado"
    ? {
        action: "agregar_precio_rebajado",
        productId: editFoundProduct.id,
      productName: editFoundProduct.name,
        salePrice: editValue.trim(),
        selectedCombinations: selectedEditCombinations.map((combo) =>
          Object.values(combo)
        ),
      }
    : editActionType === "cambiar_precio_rebajado"
    ? {
        action: "cambiar_precio_rebajado",
        productId: editFoundProduct.id,
      productName: editFoundProduct.name,
        salePrice: editValue.trim(),
        selectedCombinations: selectedEditCombinations.map((combo) =>
          Object.values(combo)
        ),
      }
    : editActionType === "quitar_precio_rebajado"
    ? {
        action: "quitar_precio_rebajado",
        productId: editFoundProduct.id,
      productName: editFoundProduct.name,
        selectedCombinations: selectedEditCombinations.map((combo) =>
          Object.values(combo)
        ),
      }
      : editActionType === "cambiar_precio_efectivo"
? {
    action: "cambiar_precio_efectivo",
    productId: editFoundProduct.id,
      productName: editFoundProduct.name,
    cashPriceGeneral: editValue.trim(),
    selectedCombinations: selectedEditCombinations.map((combo) =>
      Object.values(combo)
    ),
  }
    : editActionType === "mover_producto_fecha"
    ? {
        action: "mover_producto_fecha",
        productId: editFoundProduct.id,
      productName: editFoundProduct.name,
        targetProductId: moveTargetProduct?.id,
        position: moveProductMode,
      }
    : {
        action: "cambiar_descripcion",
        productId: editFoundProduct.id,
      productName: editFoundProduct.name,
        description: editValue.trim(),
      };

      

console.log("PAYLOAD PRECIO", payload);

if (
  (editActionType === "cambiar_precio" ||
    editActionType === "agregar_precio_rebajado" ||
    editActionType === "cambiar_precio_rebajado" ||
    editActionType === "cambiar_precio_efectivo") &&
  !Number(editValue)
) {
  pushAssistantInfo("El precio debe ser un número válido.");
  return;
}

const response = await sendEditPayload(payload);

setLoading(false);

pushAssistantInfo(
  response?.reply || "Producto actualizado correctamente."
);

if (!response?.queued) {
setRefreshingEditProduct(true);

setTimeout(async () => {
  try {
    const form = new FormData();
    form.append("agentId", agentId);

    const mode = editFoundProduct?.sku ? "sku" : "nombre";
    const value = editFoundProduct?.sku || editFoundProduct?.name;

    form.append("message", `__search_edit_product__:${mode}|${value}`);

    const token = localStorage.getItem("token") || "";

    const res = await fetchWithRetry(`${API}/run-agent`, {
      method: "POST",
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : undefined,
      body: form,
    });

    const refreshed = await res.json();

    if (refreshed?.product) {
      setEditFoundProduct(
        normalizeEditFoundProduct(refreshed.product, refreshed.variationSample)
      );
      setEditCandidates([]);
    }
  } catch {
  } finally {
    setRefreshingEditProduct(false);
  }
}, 0);
}

setEditValue("");
setEditSection("");
setEditActionType("");
setEditAttributeValues({});
setSelectedEditCombinations([]);
setMoveTargetSearch("");
setMoveTargetProduct(null);
setMoveProductMode("before");
            } catch (error: any) {
              pushAssistantInfo(
                error?.message || "No pude editar el producto."
              );
            } finally {
              setLoading(false);
            }
          }}
          style={wizardPrimaryButtonStyle}
        >
          Guardar cambio
        </button>
      </div>
    )}
  </div>
)}
{activeAction === "delete" && (
  <div
    style={{
      marginTop: 12,
      marginBottom: 12,
      padding: 12,
      borderRadius: 14,
      border: "1px solid #334155",
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    <div style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 14 }}>
      Eliminar producto
    </div>

    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "#e5e7eb",
          fontSize: 14,
        }}
      >
        <input
          type="radio"
          name="deleteMode"
          checked={deleteMode === "sku"}
          onChange={() => {
            setDeleteMode("sku");
            setText("");
          }}
        />
        Por SKU
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "#e5e7eb",
          fontSize: 14,
        }}
      >
        <input
          type="radio"
          name="deleteMode"
          checked={deleteMode === "nombre"}
          onChange={() => {
            setDeleteMode("nombre");
            setText("");
          }}
        />
        Por nombre
      </label>
    </div>

    <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.5 }}>
      {deleteMode === "sku"
        ? "Escribí uno o varios SKU, uno por línea."
        : "Escribí uno o varios nombres, uno por línea."}
    </div>
  </div>
)}

{activeAction === "create" && currentCreateStep && (
  <div
    style={{
      marginTop: 12,
      marginBottom: 12,
      padding: 12,
      borderRadius: 14,
      border: "1px solid #1d4ed8",
      background: "rgba(37,99,235,0.10)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      flexWrap: "wrap",
    }}
  >
    <div>
      <div style={{ color: "#93c5fd", fontSize: 12, marginBottom: 4 }}>
        Paso {createStepIndex + 1} de {CREATE_STEPS_VISIBLE.length}
      </div>

      <div style={{ fontWeight: 700, fontSize: 15 }}>
        {currentCreateStep.title}
      </div>

      <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 4 }}>
        {currentCreateStep.helper}
      </div>

            <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginTop: 10,
        }}
      >
        {CREATE_STEPS_VISIBLE.map((step, index) => {
          const isCurrent = index === createStepIndex;
          const isDone = index < createStepIndex;

          return (
            <div
              key={step.key}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: isCurrent
                  ? "#2563eb"
                  : isDone
                  ? "rgba(34,197,94,0.15)"
                  : "#0f172a",
                color: isCurrent ? "#ffffff" : isDone ? "#86efac" : "#94a3b8",
                border: isCurrent
                  ? "1px solid #2563eb"
                  : isDone
                  ? "1px solid rgba(34,197,94,0.45)"
                  : "1px solid #334155",
              }}
            >
              {step.title}
            </div>
          );
        })}
      </div>

    </div>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      
{activeAction === "create" && isCreateStepPhotos && (
  <div style={{ marginBottom: 10 }}>
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      style={{
        border: "1px solid #2b3950",
        background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
        color: "#e5e7eb",
        borderRadius: 14,
        padding: "10px 14px",
        cursor: "pointer",
        fontSize: 14,
        transition: "all 0.2s ease",
      }}
    >
      Cargar fotos
    </button>
  </div>
)}

      <button
        type="button"
        onClick={cancelCreateProduct}
        style={wizardSecondaryButtonStyle}
      >
        Cancelar
      </button>

      <button
        type="button"
        onClick={previousCreateStep}
        disabled={createStepIndex === 0}
        style={{
          ...wizardSecondaryButtonStyle,
          opacity: createStepIndex === 0 ? 0.55 : 1,
          cursor: createStepIndex === 0 ? "not-allowed" : "pointer",
        }}
      >
        Anterior
      </button>

      {createStepIndex < CREATE_STEPS_VISIBLE.length - 1 ? (
        <button
          type="button"
          onClick={nextCreateStep}
          style={wizardPrimaryButtonStyle}
        >
          Siguiente
        </button>
      ) : (
        <button
          type="button"
          onClick={submitCreateProduct}
          style={wizardPrimaryButtonStyle}
        >
          Crear producto
        </button>
      )}
    </div>
  </div>
)}


              <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {(false) && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
  border: "1px solid #2b3950",
  background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
  color: "#e5e7eb",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 10px 25px rgba(0,0,0,0.35)";
  el.style.borderColor = "#3b82f6";
  el.style.background = "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.borderColor = "#2b3950";
  el.style.background = "linear-gradient(180deg, #111827 0%, #0f172a 100%)";
}}
                  >
                    {activeAction === "create" ? "Cargar fotos" : "+ Agregar fotos"}
                  </button>
                )}

                <span style={{ color: "#94a3b8", fontSize: 13 }}>
                  {activeAction === "create"
                    ? `Creando producto · Paso ${createStepIndex + 1} de ${CREATE_STEPS_VISIBLE.length}`
                    : "Arrastrá fotos acá · Enter envía · Shift + Enter baja de línea"}

                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []).filter((file) =>
                    file.type.startsWith("image/")
                  );
                  mergeFiles(files);
                }}
                style={{ display: "none" }}
              />
            </div>
          </div>

          {activeAction !== "create" && (
            <button
              onClick={() => handleSend()}
              disabled={loading}
              style={{
  border: "1px solid #2563eb",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  borderRadius: 14,
  padding: "0 20px",
  height: 56,
  minWidth: 120,
  cursor: loading ? "not-allowed" : "pointer",
  fontSize: 15,
  fontWeight: 600,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  if (loading) return;
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 12px 30px rgba(37,99,235,0.4)";
  el.style.background = "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)";
}}
onMouseLeave={(e) => {
  if (loading) return;
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)";
}}
            >
              Enviar
            </button>
          )}
        </div>
      </div>
      )}

      <button
        type="button"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 50,
          border: "1px solid #2b3950",
          background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
          color: "#e5e7eb",
          borderRadius: 14,
          padding: "10px 14px",
          cursor: "pointer",
          fontSize: 14,
        }}
        onClick={() => setShowJobs((v) => !v)}
      >
        Procesos
      </button>

      {showJobs && (
        <div
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            height: "100%",
            width: 320,
            background: "#111",
            color: "#fff",
            padding: 12,
            overflowY: "auto",
            zIndex: 49,
            boxShadow: "-8px 0 24px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Historial</h3>
            <button
              type="button"
              onClick={() => setShowJobs(false)}
              style={{
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e5e7eb",
                borderRadius: 10,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>
          </div>
          <button
  type="button"
  onClick={async () => {
    try {
      const token = localStorage.getItem("token") || "";

await fetchWithRetry(`${API}/jobs`, {
  method: "DELETE",
  headers: token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : undefined,
});

   
      pushAssistantInfo("Historial borrado correctamente.");
    } catch {
      pushAssistantInfo("No se pudo borrar el historial.");
    }
  }}
  style={{
  width: "100%",
  marginBottom: 12,
  border: "1px solid #7f1d1d",
  background: "linear-gradient(180deg, #b91c1c 0%, #991b1b 100%)",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 600,
  transition: "all 0.2s ease",
}}
onMouseEnter={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
  el.style.boxShadow = "0 10px 25px rgba(239,68,68,0.35)";
  el.style.background = "linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)";
}}
onMouseLeave={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(0)";
  el.style.boxShadow = "none";
  el.style.background = "linear-gradient(180deg, #b91c1c 0%, #991b1b 100%)";
}}
onMouseDown={(e) => {
  const el = e.currentTarget;
  el.style.transform = "scale(0.96)";
}}
onMouseUp={(e) => {
  const el = e.currentTarget;
  el.style.transform = "translateY(-1px)";
}}
>
  🗑️ Borrar historial
</button>
          {jobs.length === 0 ? (
            <div style={{ fontSize: 14, color: "#94a3b8" }}>Todavía no hay procesos.</div>
          ) : (
            jobs.map((j) => (
              <div
                key={j.id}
                style={{
                  marginBottom: 10,
                  fontSize: 14,
                  padding: 10,
                  border: "1px solid #1f2937",
                  borderRadius: 12,
                  background: "#0b1220",
                }}
              >
                <div style={{ fontWeight: 600 }}>{j.title}</div>
                <div style={getEstadoBadgeStyle(j.status)}>{traducirEstado(j.status)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const quickActionPrimaryStyle: React.CSSProperties = {
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "white",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const quickActionSecondaryStyle: React.CSSProperties = {
  border: "1px solid #2b3950",
  background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
  color: "#e5e7eb",
  borderRadius: 14,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  transition: "all 0.2s ease",
};

const wizardPrimaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#2563eb",
  color: "white",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const wizardSecondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#e5e7eb",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
};
