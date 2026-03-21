// runAgent.js (modificado)

function translateStockStatus(status) {
  if (status === "instock") return "Disponible";
  if (status === "outofstock") return "Agotado";
  return status || "";
}

function buildStockReply(result) {
  const variationLines = Array.isArray(result.results)
    ? result.results
        .map((item) => {
          const label = item.attributes_text || `Variación #${item.variation_id}`;

          if (item.manage_stock) {
            return `- ${label}: ${item.stock_quantity} unidades`;
          }

          return `- ${label}: ${translateStockStatus(item.stock_status)}`;
        })
        .join("\n")
    : "";

  if (result.updated_count === 0) {
    return `No hubo cambios en las variaciones de ${result.name}.`;
  }

  return result.updated_count === 1
    ? `Se actualizó 1 variación de ${result.name}:\n${variationLines}`
    : `Se actualizaron ${result.updated_count} variaciones de ${result.name}:\n${variationLines}`;
}

module.exports = {
  buildStockReply,
};
