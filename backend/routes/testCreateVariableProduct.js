import express from "express";
import { createVariableProduct } from "../tools/woocommerce.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      baseUrl,
      consumerKey,
      consumerSecret,
      name,
      description,
      shortDescription,
      attributes,
      variations,
      categories
    } = req.body;

    if (!baseUrl || !consumerKey || !consumerSecret || !name) {
      return res.status(400).json({
        error: "Faltan baseUrl, consumerKey, consumerSecret o name"
      });
    }

    const result = await createVariableProduct({
      baseUrl,
      consumerKey,
      consumerSecret,
      name,
      description,
      shortDescription,
      attributes: Array.isArray(attributes) ? attributes : [],
      variations: Array.isArray(variations) ? variations : [],
      categories: Array.isArray(categories) ? categories : []
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Error en /test-create-variable-product:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      error: "Error al crear producto variable",
      detail: error?.response?.data || error.message
    });
  }
});

export default router;