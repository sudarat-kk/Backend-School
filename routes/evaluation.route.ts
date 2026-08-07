import { Router } from "express";
import {
  createEvaluation,
  getAllEvaluations,
  getEvaluationQuestions,
  getGeneralEvaluation,
  submitEvaluationAnswer,
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
router.get("/forms/:batchId/questions", getEvaluationQuestions);
// ส่งคำตอบ (ใช้ HTTP POST)
router.post("/forms/submit", submitEvaluationAnswer);

export default router;
