import express from "express";
import multer from "multer";
import {
  addStudent,
  deleteStudent,
  getStudents,
  updateStudent,
  uploadStudent,
  resequenceStudents,
} from "../controller/studentController";

const router = express.Router();

// ตั้งค่า Multer สำหรับรับไฟล์ที่อัปโหลดมาเก็บไว้ชั่วคราวในโฟลเดอร์ uploads/
const upload = multer({ dest: "uploads/" });

// กำหนด Endpoint: POST /api/students/upload (สมมติว่า prefix คือ /api/students)
// ชื่อ 'csvFile' ตรงนี้จะต้องตรงกับชื่อฟิลด์ FormData ที่ส่งมาจาก Angular (formData.append('csvFile', ...))
router.post("/students/upload", upload.single("csvFile"), uploadStudent);
router.get("/students", getStudents);
router.post("/students/add", addStudent);
router.put("/students/resequence/:batch_id", resequenceStudents);
router.put("/students/:id", updateStudent);
router.delete("/students/:id", deleteStudent);

export default router;
