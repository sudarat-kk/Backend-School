import express from "express";
import cors from "cors"; // 1. Import cors เข้ามา
import courseRoutes from "./routes/course.route";

const app = express();

// 2. เรียกใช้ middleware cors ก่อนที่จะเรียก routes
// (อนุญาตให้ทุกโดเมนสามารถเรียก API นี้ได้)
app.use(cors());

// Middleware สำหรับอ่าน JSON
app.use(express.json());

// Routes
app.use("/api", courseRoutes);

export default app;
