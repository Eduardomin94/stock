import express from "express";
import { auditVariableProductsStock } from "../tools/woocommerce.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { baseUrl, consumerKey, consumerSecret } = req.body;

    if (!baseUrl || !consumerKey || !consumerSecret) {
      return res.status(400).json({
        error: "Faltan baseUrl, consumerKey o consumerSecret",
      });
    }

    const result = await auditVariableProductsStock({
      baseUrl,
      consumerKey,
      consumerSecret,
    });

    res.json(result);
  } catch (error) {
    console.error("Error en /test-woo-audit:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Error al auditar WooCommerce",
      detail: error?.response?.data || error.message,
    });
  }
});

export default router;