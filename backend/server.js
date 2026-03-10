import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import createAgentRoute from "./routes/createAgents.js";
import listAgentsRoute from "./routes/listAgents.js";
import runAgentRoute from "./routes/runAgent.js";
import testWooAuditRoute from "./routes/testWooAudit.js";
import testEnableManageStockDryRunRoute from "./routes/testEnableManageStockDryRun.js";
import testEnableManageStockRoute from "./routes/testEnableManageStock.js";
import testUpdateVariationStockRoute from "./routes/testUpdateVariationStock.js";
import testFindVariableProductRoute from "./routes/testFindVariableProduct.js";
import testPlanStockByColorSizeRoute from "./routes/testPlanStockByColorSize.js";
import testApplyStockByColorSizeRoute from "./routes/testApplyStockByColorSize.js";
import testPlanStockByColorOnlyRoute from "./routes/testPlanStockByColorOnly.js";
import testCreateSimpleProductRoute from "./routes/testCreateSimpleProduct.js";
import testCreateVariableProductRoute from "./routes/testCreateVariableProduct.js";
import registerRoute from "./routes/register.js";
import loginRoute from "./routes/login.js";


dotenv.config();
console.log("OPENAI_API_KEY cargada:", process.env.OPENAI_API_KEY ? "SI" : "NO");
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.use(cors({
  origin: [
  "http://localhost:3000",
  "https://tonicastock.com",
  "https://www.tonicastock.com",
  "https://stock-three-psi.vercel.app"
],
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.get("/", (_req, res) => {
  res.send("Servidor de agentes funcionando");
});

app.use("/register", registerRoute);
app.use("/login", loginRoute);
app.use("/create-agent", createAgentRoute);
app.use("/agents", listAgentsRoute);
app.use("/run-agent", runAgentRoute);
app.use("/test-woo-audit", testWooAuditRoute);
app.use("/test-enable-manage-stock-dry-run", testEnableManageStockDryRunRoute);
app.use("/test-enable-manage-stock", testEnableManageStockRoute);
app.use("/test-update-variation-stock", testUpdateVariationStockRoute);
app.use("/test-find-variable-product", testFindVariableProductRoute);
app.use("/test-plan-stock-by-color-size", testPlanStockByColorSizeRoute);
app.use("/test-apply-stock-by-color-size", testApplyStockByColorSizeRoute);
app.use("/test-plan-stock-by-color-only", testPlanStockByColorOnlyRoute);
app.use("/test-create-simple-product", testCreateSimpleProductRoute);
app.use("/test-create-variable-product", testCreateVariableProductRoute);
app.get("/master-audit-agents", (_req, res) => {

  try {

    const report = auditAgents();

    res.json({
      ok: true,
      report
    });

  } catch (error) {

    res.status(500).json({
      error: "Error auditando agentes",
      detail: error.message
    });

  }

});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});