import { Router } from "express";
import { getGroupedCourses } from "../controller/course.controller";
import { getSubjectsByBatch } from "../controller/subject.controller";

const router = Router();

// กำหนด Endpoint เป็น GET /courses
router.get("/courses", getGroupedCourses);
router.get("/subjects/:batchId", getSubjectsByBatch);

export default router;
