import { Router } from "express";
import { adminLogin, studentLogin } from "../controller/authController";
// Import ฟังก์ชัน login ที่เราเพิ่งสร้าง

const router = Router();

// สร้าง Route สำหรับ Login (ต้องใช้ POST เพราะมีการส่งข้อมูลรหัสผ่าน)
router.post("/student-login", studentLogin);
router.post("/admin/login", adminLogin);

export default router;
