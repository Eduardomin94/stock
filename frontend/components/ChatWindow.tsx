"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  text: string;
};


type CreateProductForm = {
  nombre: string;
  sku: string;
  colores: string;
  talles: string;
  precio: string;
  precioRebajado: string;
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
  attributes?: { id?: number; name: string; options: string[] }[];
};

type EditActionType =
  | ""
  | "cambiar_precio"
  | "agregar_precio_rebajado"
  | "cambiar_precio_rebajado"
  | "quitar_precio_rebajado"
  | "cambiar_descripcion";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

type CreateStepKey =
  | "fotos"
  | "nombre"
  | "sku"
  | "colores"
  | "talles"
  | "precio"
  | "precioRebajado"
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
    key: "fotos",
    title: "Fotos",
    helper: "Primero agregá las fotos del producto. La primera queda como principal.",
    optional: true,
  },
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
    key: "subcategoria",
    title: "Subcategoría",
    helper: "Si tiene subcategoría, escribila. Si no tiene, dejalo vacío.",
    placeholder: "Ej: Manga corta",
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

function normalizeEditFoundProduct(product: any, variation?: any): EditFoundProduct {
  let regular = product?.regular_price;
  let sale = product?.sale_price;

  if (variation) {
    regular = variation?.regular_price || regular;
    sale = variation?.sale_price || sale;
  }

    return {
  id: Number(product?.id || 0),
  name: String(product?.name || ""),
  sku: String(product?.sku || ""),
  type: String(product?.type || ""),
  regularPrice: String(regular || ""),
  salePrice: String(sale || ""),
  attributes: Array.isArray(product?.attributeOptions)
    ? product.attributeOptions.map((attr: any) => ({
        name: String(attr?.name || ""),
        options: Array.isArray(attr?.options)
          ? attr.options.map((opt: any) => String(opt))
          : [],
      }))
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

  if (text && text !== "{}") {
    return text;
  }

  return "Ocurrió un error al ejecutar la acción.";
}

function buildCreateProductMessage(
  form: CreateProductForm,
  stockByVariationMap: Record<string, string>
) {
  const cleanColors = normalizeCommaField(form.colores);
  const cleanSizes = normalizeCommaField(form.talles);
  const cleanPrice = cleanMoney(form.precio);
  const cleanSalePrice = cleanMoney(form.precioRebajado);
  const shortDescription = form.descripcionCorta.trim();
  const category = form.categoria.trim();
  const subcategory = form.subcategoria.trim();
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
    lines.push(`categoria: ${category}`);
    if (subcategory) lines.push(`subcategoria: ${subcategory}`);
    return lines.join("\n");
  }

  lines.push("crear producto simple");
lines.push(`nombre: ${name}`);
if (sku) lines.push(`sku: ${sku}`);
lines.push(`precio: ${cleanPrice}`);
if (cleanSalePrice) lines.push(`precio_rebajado: ${cleanSalePrice}`);

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
lines.push(`categoria: ${category}`);
if (subcategory) lines.push(`subcategoria: ${subcategory}`);


  return lines.join("\n");
}

export default function ChatWindow() {
  const agentId = "woocommerce-assistant";
  const agentName = "Asistente WooCommerce";
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [imageColorMap, setImageColorMap] = useState<Record<string, string>>({});
  const [stockByVariationMap, setStockByVariationMap] = useState<Record<string, string>>({});
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null);
  const [dragOverFileIndex, setDragOverFileIndex] = useState<number | null>(null);
  const [skuChecking, setSkuChecking] = useState(false);
const [skuStatus, setSkuStatus] = useState<"idle" | "available" | "taken">("idle");
const [skuStatusMessage, setSkuStatusMessage] = useState("");
const skuValidationIdRef = useRef(0);
const skuValidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const [activeAction, setActiveAction] = useState<"create" | "edit" | "delete" | null>(null);
  const [deleteMode, setDeleteMode] = useState<"sku" | "nombre">("sku");
  const [editFoundProduct, setEditFoundProduct] = useState<EditFoundProduct | null>(null);
  const [editActionType, setEditActionType] = useState<EditActionType>("");
  const [createStepIndex, setCreateStepIndex] = useState(0);
  const [createForm, setCreateForm] = useState<CreateProductForm>(initialCreateForm);
  const [editValue, setEditValue] = useState("");
const [editAttributeValues, setEditAttributeValues] = useState<Record<string, string>>({});
const [editSection, setEditSection] = useState<"" | "precio" | "descripcion">("");
  

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const currentCreateStep = activeAction === "create" ? CREATE_STEPS[createStepIndex] : null;
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
      const form = new FormData();
      form.append("agentId", agentId);
      form.append("message", cleanText);

      filesToSend.forEach((file) => {
  form.append("images", file);
  form.append(`imageColor_${getFileKey(file)}`, imageColorMap[getFileKey(file)] || "");
});

      const token = localStorage.getItem("token") || "";

      const res = await fetch(`${API}/run-agent`, {
  method: "POST",
  headers: token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : undefined,
  body: form,
});

const response = await res.json();

if (!res.ok) {
  throw response?.detail || response?.error || response?.message || "Error al ejecutar el agente.";
}

const assistantMessage: Message = {
  role: "assistant",
  text: response.reply || response.error || response.detail || "Sin respuesta del agente.",
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

    const res = await fetch(`${API}/run-agent`, {
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
        data?.detail || data?.error || data?.message || "Error buscando el producto."
      );
    }

    if (data?.product) {
  setEditFoundProduct(
  normalizeEditFoundProduct(data.product, data.variationSample)
);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});

  pushAssistantInfo(
    `Encontré el producto: ${data.product.name}. Ahora elegí qué querés editar.`
  );
  console.log("Producto encontrado:", data.product);
} 

else if (Array.isArray(data?.products) && data.products.length === 1) {
  setEditFoundProduct(normalizeEditFoundProduct(data.products[0]));
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  pushAssistantInfo(
    `Encontré el producto: ${data.products[0].name}. Ahora elegí qué querés editar.`
  );
  console.log("Producto encontrado único:", data.products[0]);
} else if (Array.isArray(data?.products) && data.products.length > 1) {
  setEditFoundProduct(null);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});

  pushAssistantInfo(
    `Encontré ${data.products.length} productos. Decime el SKU exacto del que querés editar.`
  );
  console.log("Coincidencias exactas:", data.products);
} else if (Array.isArray(data?.candidates) && data.candidates.length === 1) {
  setEditFoundProduct(normalizeEditFoundProduct(data.candidates[0]));
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  pushAssistantInfo(
    `Encontré el producto: ${data.candidates[0].name}. Ahora elegí qué querés editar.`
  );
  console.log("Candidato único:", data.candidates[0]);
} else if (Array.isArray(data?.candidates) && data.candidates.length > 1) {
  setEditFoundProduct(null);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});

  pushAssistantInfo(
    `Encontré varios productos parecidos. Decime el SKU exacto del que querés editar.`
  );
  console.log("Coincidencias aproximadas:", data.candidates);
} else {
  setEditFoundProduct(null);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});

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

  const res = await fetch(`${API}/run-agent`, {
    method: "POST",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
    body: form,
  });

  const response = await res.json();

  if (!res.ok) {
    throw response?.detail || response?.error || response?.message || "No se pudo validar el SKU.";
  }

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


  function startCreateProduct() {
  setActiveAction("create");
  setEditFoundProduct(null);
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
    "Vamos a crear un producto paso por paso. Orden: fotos, nombre, SKU, colores, talles, precio, precio rebajado, stock, descripción corta, categoría y subcategoría."
  );
}



  function cancelCreateProduct() {
  setActiveAction(null);
  setCreateStepIndex(0);
  setCreateForm(initialCreateForm);
  setText("");
  setStockByVariationMap({});
  resetSkuValidationState();
}


  function saveCurrentCreateStepValue() {
    if (!currentCreateStep || currentCreateStep.key === "fotos") return true;

    const rawValue = text.trim();
    const isOptional = Boolean(currentCreateStep.optional);

    if (!rawValue && !isOptional) {
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
    const step = CREATE_STEPS[stepIndex];
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

  if (nextIndex >= CREATE_STEPS.length) {
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
      ...(currentCreateStep?.key === "descripcionCorta" ? { descripcionCorta: text.trim() } : {}),
      ...(currentCreateStep?.key === "categoria" ? { categoria: text.trim() } : {}),
      ...(currentCreateStep?.key === "subcategoria" ? { subcategoria: text.trim() } : {}),
    };

    const missingRequired: string[] = [];

    if (!finalForm.nombre.trim()) missingRequired.push("Nombre");
    if (!cleanMoney(finalForm.precio)) missingRequired.push("Precio");
    if (!finalForm.categoria.trim()) missingRequired.push("Categoría");

    if (missingRequired.length > 0) {
      pushAssistantInfo(`Faltan estos datos para crear el producto: ${missingRequired.join(", ")}.`);
      return;
    }

    const builtMessage = buildCreateProductMessage(finalForm, stockByVariationMap);

    await sendToAgent(builtMessage, selectedFiles);

    setActiveAction(null);
    setCreateStepIndex(0);
    setCreateForm(initialCreateForm);
    setText("");
    setStockByVariationMap({});
  }

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
        <div
          style={{
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          Chat con {agentName}
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
            border: "1px solid #243041",
            background: "#0f172a",
            color: "#e5e7eb",
            borderRadius: 12,
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: 13,
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
        <button type="button" onClick={startCreateProduct} style={quickActionPrimaryStyle}>
          Crear producto
        </button>

        <button
  type="button"
  onClick={() => {
    setActiveAction("edit");
    setEditFoundProduct(null);
    setEditActionType("");
    setEditValue("");
    setEditSection("");
    setEditAttributeValues({});
    setText("");
    pushAssistantInfo(
      "Decime el producto que querés editar. Podés escribir el SKU o el nombre."
    );
  }}
  style={quickActionSecondaryStyle}
>
  Editar producto
</button>

        <button
  type="button"
  onClick={() => {
  setActiveAction("delete");
  setDeleteMode("sku");
  setEditFoundProduct(null);
  setEditActionType("");
  setEditValue("");
  setEditSection("");
  setEditAttributeValues({});
  setText("");
  pushAssistantInfo(
    "Elegí si querés eliminar por SKU o por nombre. También podés pasar varios."
  );
}}
  style={quickActionSecondaryStyle}
>
  Eliminar producto
</button>
      </div>

      <div
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
          if (createStepIndex < CREATE_STEPS.length - 1) {
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
</div>

    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
  <button
    type="button"
    onClick={() => {
      setEditSection("precio");
      setEditActionType("");
      setEditValue("");
      setEditAttributeValues({});
    }}
    style={quickActionSecondaryStyle}
  >
    Precio
  </button>

  <button
    type="button"
    onClick={() => {
      setEditSection("descripcion");
      setEditActionType("cambiar_descripcion");
      setEditValue("");
    }}
    style={quickActionSecondaryStyle}
  >
    Descripción
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
  }}
  style={quickActionSecondaryStyle}
>
  Cambiar precio
</button>

    {!hasEditSalePrice ? (
  <button
    type="button"
    onClick={() => {
      setEditActionType("agregar_precio_rebajado");
      setEditValue("");
    }}
    style={quickActionSecondaryStyle}
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
      }}
      style={quickActionSecondaryStyle}
    >
      Cambiar precio rebajado
    </button>

    <button
      type="button"
      onClick={() => {
        setEditActionType("quitar_precio_rebajado");
        setEditValue("");
      }}
      style={quickActionSecondaryStyle}
    >
      Quitar precio rebajado
    </button>
  </>
)}
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

{editActionType === "cambiar_precio" && hasEditAttributes && (
  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
    {editAttributes.map((attr) => (
      <select
        key={attr.name}
        value={editAttributeValues[attr.name] || ""}
        onChange={(e) =>
          setEditAttributeValues((prev) => ({
            ...prev,
            [attr.name]: e.target.value,
          }))
        }
        style={{
          flex: 1,
          minWidth: 220,
          border: "1px solid #334155",
          background: "#020617",
          color: "white",
          borderRadius: 10,
          padding: "10px",
        }}
      >
        <option value="">Todos: {attr.name}</option>
        {attr.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    ))}
  </div>
)}

        <button
          type="button"
          onClick={async () => {
            if (!editFoundProduct?.id || !editActionType) {
  pushAssistantInfo("Falta elegir una acción.");
  return;
}

if (editActionType !== "quitar_precio_rebajado" && !editValue.trim()) {
  pushAssistantInfo("Completá el valor antes de guardar.");
  return;
}

            const token = localStorage.getItem("token") || "";

            try {
              setLoading(true);

              const payload =
editActionType === "cambiar_precio"
  ? {
      action: "cambiar_precio",
      productId: editFoundProduct.id,
      regularPrice: editValue.trim(),
      attributes: editAttributeValues,
    }
    : editActionType === "agregar_precio_rebajado"
    ? {
        action: "agregar_precio_rebajado",
        productId: editFoundProduct.id,
        salePrice: editValue.trim(),
        attributes: editAttributeValues,
      }
    : editActionType === "cambiar_precio_rebajado"
  ? {
      action: "cambiar_precio_rebajado",
      productId: editFoundProduct.id,
      salePrice: editValue.trim(),
      attributes: editAttributeValues,
    }
    : editActionType === "quitar_precio_rebajado"
    ? {
        action: "quitar_precio_rebajado",
        productId: editFoundProduct.id,
      }
    : {
        action: "cambiar_descripcion",
        productId: editFoundProduct.id,
        description: editValue.trim(),
      };

              const form = new FormData();
              form.append("agentId", agentId);
              form.append("message", `__edit_product_action__:${JSON.stringify(payload)}`);

              const res = await fetch(`${API}/run-agent`, {
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
                  data?.detail || data?.error || data?.message || "Error editando el producto."
                );
              }

              pushAssistantInfo(data?.reply || "Producto actualizado correctamente.");

// 🔥 volver a buscar el producto actualizado
try {
  const form = new FormData();
  form.append("agentId", agentId);

  const mode = editFoundProduct?.sku ? "sku" : "nombre";
  const value = editFoundProduct?.sku || editFoundProduct?.name;

  form.append("message", `__search_edit_product__:${mode}|${value}`);

  const token = localStorage.getItem("token") || "";

  const res = await fetch(`${API}/run-agent`, {
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
}
} catch {}

setEditValue("");
setEditSection("");
setEditActionType("");
setEditAttributeValues({});
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
        Paso {createStepIndex + 1} de {CREATE_STEPS.length}
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
        {CREATE_STEPS.map((step, index) => {
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

      {createStepIndex < CREATE_STEPS.length - 1 ? (
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: "1px solid #243041",
                    background: "#0f172a",
                    color: "#e5e7eb",
                    borderRadius: 12,
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  + Agregar fotos
                </button>

                <span style={{ color: "#94a3b8", fontSize: 13 }}>
                  {activeAction === "create"
                    ? `Creando producto · Paso ${createStepIndex + 1} de ${CREATE_STEPS.length}`
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
                height: 56,
                minWidth: 120,
                padding: "0 20px",
                borderRadius: 14,
                border: "none",
                background: loading ? "#374151" : "#2563eb",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Enviar
            </button>
          )}
        </div>
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
  border: "1px solid #243041",
  background: "#111827",
  color: "#e5e7eb",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
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

