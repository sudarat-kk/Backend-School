import { Router } from "express";
import {
  getAdminSubjectScores,
  getStudentScores,
  saveAdminBulkScores,
  saveScoresAndCalculate,
  saveSingleScore,
  updateSubjectMaxScore,
} from "../controller/score.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

// สร้าง Endpoint เป็น POST /api/scores/bulk
router.post("/scores/bulk", saveScoresAndCalculate);
router.post("/scores/single", saveSingleScore);
router.put("/settings/max-score", updateSubjectMaxScore);
router.get("/students/:student_id/scores", verifyToken, getStudentScores);
router.get("/admin/scores", getAdminSubjectScores);
router.post("/admin/scores/bulk", saveAdminBulkScores);
export default router;
