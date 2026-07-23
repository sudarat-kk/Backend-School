import { Router } from "express";
import {
  getAdminSubjectScores,
  getscore,
  getStudentScores,
  processGroupGrades,
  saveAdminBulkScores,
  saveBatchScores,
  updateSubjectMaxScore,
} from "../controller/score.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

router.put("/settings/max-score", updateSubjectMaxScore);
router.get("/students/:student_id/scores", verifyToken, getStudentScores);
router.get("/admin/scores", getAdminSubjectScores);
router.post("/admin/scores/bulk", saveAdminBulkScores);
router.get("/score/process-group", processGroupGrades);
router.get("/score/process-batch", getscore);
router.post("/scores/special-bulk", saveBatchScores);

export default router;
