import express from "express";
import { updateVariationStock } from "../tools/woocommerce.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      baseUrl,
      consumerKey,
      consumerSecret,
      productId,
      variationId,
      quantity,
    } = req.body;

    if (
      !baseUrl ||
      !consumerKey ||
      !consumerSecret ||
      !productId ||
      !variationId ||
      quantity === undefined
    ) {
      return res.status(400).json({
        error: "Faltan baseUrl, consumerKey, consumerSecret, productId, variationId o quantity",
      });
    }

    const result = await updateVariationStock({
      baseUrl,
      consumerKey,
      consumerSecret,
      productId: Number(productId),
      variationId: Number(variationId),
      quantity: Number(quantity),
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Error en /test-update-variation-stock:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      error: "Error al actualizar stock de la variación",
      detail: error?.response?.data || error.message,
    });
  }
});

export default router;