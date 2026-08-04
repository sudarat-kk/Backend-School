import { Router } from "express";
import {
  addBatch,
  addCourse,
  getGroupedCourses,
} from "../controller/course.controller";
import {
  addSubject,
  addSubjectGroup,
  getSubjectsByBatch,
} from "../controller/subject.controller";

const router = Router();

// กำหนด Endpoint เป็น GET /courses
router.get("/courses", getGroupedCourses);
router.get("/subjects/:batchId", getSubjectsByBatch);
router.post("/courses", addCourse);
router.post("/batches", addBatch);
router.post("/subject-groups", addSubjectGroup);
router.post("/subjects", addSubject);

export default router;
