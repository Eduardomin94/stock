import express from "express";
import { createSimpleProduct } from "../tools/woocommerce.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      baseUrl,
      consumerKey,
      consumerSecret,
      name,
      regularPrice,
      description,
      shortDescription,
      categories,
      stockQuantity,
      manageStock,
    } = req.body;

    if (!baseUrl || !consumerKey || !consumerSecret || !name || regularPrice == null) {
      return res.status(400).json({
        error: "Faltan baseUrl, consumerKey, consumerSecret, name o regularPrice",
      });
    }

    const result = await createSimpleProduct({
      baseUrl,
      consumerKey,
      consumerSecret,
      name,
      regularPrice,
      description,
      shortDescription,
      categories: Array.isArray(categories) ? categories : [],
      stockQuantity: stockQuantity == null ? null : Number(stockQuantity),
      manageStock: manageStock === undefined ? true : Boolean(manageStock),
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Error en /test-create-simple-product:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      error: "Error al crear producto simple",
      detail: error?.response?.data || error.message,
    });
  }
});

export default router;