import { Router } from "express";
import {
  addBatch,
  addCourse,
  getAllBatches,
  getAllCourses,
  getGroupedCourses,
} from "../controller/course.controller";
import {
  addSubject,
  addSubjectGroup,
  getAllSubjectGroups,
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

router.get("/courses/all", getAllCourses);
router.get("/batches/all", getAllBatches);
router.get("/subject-groups/all", getAllSubjectGroups);
export default router;
