import express from "express";
import {
  getCourses,
  getBatchesByCourse,
  getSubjectsByBatch,
  getSubjectGroupsByBatch,
} from "../controller/dropdown.controller";

const router = express.Router();

router.get("/dropdown/courses", getCourses);
router.get("/dropdown/batches", getBatchesByCourse);
router.get("/dropdown/subjects", getSubjectsByBatch);
router.get("/dropdown/subject-groups", getSubjectGroupsByBatch);

export default router;
