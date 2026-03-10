import express from "express";
import { applyStockUpdateByColorAndSize } from "../tools/woocommerce.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { baseUrl, consumerKey, consumerSecret, productSearch, lines } = req.body;

    if (!baseUrl || !consumerKey || !consumerSecret || !productSearch || !Array.isArray(lines)) {
      return res.status(400).json({
        error: "Faltan baseUrl, consumerKey, consumerSecret, productSearch o lines[]",
      });
    }

    const result = await applyStockUpdateByColorAndSize({
      baseUrl,
      consumerKey,
      consumerSecret,
      productSearch,
      lines,
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Error en /test-apply-stock-by-color-size:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      error: "Error al aplicar stock por color y talle",
      detail: error?.response?.data || error.message,
    });
  }
});

export default router;