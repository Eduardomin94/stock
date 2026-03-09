import express from "express";
import { findVariableProductWithVariations } from "../tools/woocommerce.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { baseUrl, consumerKey, consumerSecret, search } = req.body;

    if (!baseUrl || !consumerKey || !consumerSecret || !search) {
      return res.status(400).json({
        error: "Faltan baseUrl, consumerKey, consumerSecret o search",
      });
    }

    const result = await findVariableProductWithVariations({
      baseUrl,
      consumerKey,
      consumerSecret,
      search,
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Error en /test-find-variable-product:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      error: "Error al buscar producto variable",
      detail: error?.response?.data || error.message,
    });
  }
});

export default router;