import express from "express";
import {
  getCourses,
  getBatchesByCourse,
  getSubjectsByBatch,
} from "../controller/dropdown.controller";

const router = express.Router();

router.get("/dropdown/courses", getCourses);
router.get("/dropdown/batches", getBatchesByCourse);
router.get("/dropdown/subjects", getSubjectsByBatch);

export default router;
