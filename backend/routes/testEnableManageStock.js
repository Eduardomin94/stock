import express from "express";
import { enableManageStockForVariation } from "../tools/woocommerce.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { baseUrl, consumerKey, consumerSecret, productId, variationId } = req.body;

    if (!baseUrl || !consumerKey || !consumerSecret || !productId || !variationId) {
      return res.status(400).json({
        error: "Faltan baseUrl, consumerKey, consumerSecret, productId o variationId",
      });
    }

    const result = await enableManageStockForVariation({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId: Number(productId),
      variationId: Number(variationId),
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Error en /test-enable-manage-stock:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      error: "Error al activar manage_stock en la variación",
      detail: error?.response?.data || error.message,
    });
  }
});

export default router;