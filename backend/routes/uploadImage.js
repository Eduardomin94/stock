import express from "express";
import multer from "multer";
import path from "path";

const router = express.Router();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base = path
      .basename(file.originalname || "image", ext)
      .replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({ storage });

router.post("/", upload.array("images"), (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];

  const imageUrls = files.map((file) => {
    return `${req.protocol}://${req.get("host")}/uploads/${file.filename}`;
  });

  res.json({ images: imageUrls });
});

export default router;