import { Router } from "express";
import {
  createEvaluation,
  getAllEvaluations,
  getGeneralEvaluation,
  updateEvaluation,
} from "../controller/evaluation.controller";

const router = Router();

// สร้าง Endpoint GET /evaluation-forms
router.get("/evaluation-forms", getAllEvaluations);

router.get("/general-evaluation/:batchId", getGeneralEvaluation);
// POST: /api/evaluations/ - สร้างใหม่
router.post("/evaluation", createEvaluation);
// PUT: /api/evaluations/:id - อัปเดตข้อมูล
router.put("/evaluation/:id", updateEvaluation);

export default router;
