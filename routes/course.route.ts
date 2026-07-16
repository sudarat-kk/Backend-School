import { Router } from "express";
import { getGroupedCourses } from "../controller/course.controller";
import {
  getGeneralEvaluation,
  getSubjectsByBatch,
} from "../controller/subject.controller";

const router = Router();

// กำหนด Endpoint เป็น GET /courses
router.get("/courses", getGroupedCourses);
router.get("/subjects/:batchId", getSubjectsByBatch);
router.get("/general-evaluation/:batchId", getGeneralEvaluation);

export default router;
