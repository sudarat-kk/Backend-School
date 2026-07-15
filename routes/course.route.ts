import { Router } from "express";
import { getGroupedCourses } from "../controller/course.controller";

const router = Router();

// กำหนด Endpoint เป็น GET /courses
router.get("/courses", getGroupedCourses);

export default router;
