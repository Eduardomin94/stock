import express from "express";
import { prepareEnableManageStockForVariations } from "../tools/woocommerce.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { baseUrl, consumerKey, consumerSecret, limit } = req.body;

    if (!baseUrl || !consumerKey || !consumerSecret) {
      return res.status(400).json({
        error: "Faltan baseUrl, consumerKey o consumerSecret",
      });
    }

    const result = await prepareEnableManageStockForVariations({
      baseUrl,
      consumerKey,
      consumerSecret,
      limit: Number(limit) || 50,
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Error en /test-enable-manage-stock-dry-run:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      error: "Error al preparar dry-run de manage_stock",
      detail: error?.response?.data || error.message,
    });
  }
});

export default router;