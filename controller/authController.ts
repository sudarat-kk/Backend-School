import { Request, Response } from "express";
import { conn } from "../dbconn";
import bcrypt from "bcrypt"; // ถ้าตอนบันทึกรหัสคุณใช้ bcrypt เข้ารหัสไว้
import jwt from "jsonwebtoken"; // สำหรับสร้าง Token

export const studentLogin = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { batch_id, student_code, password } = req.body;

  try {
    // 1. ค้นหานักเรียนจากรหัสและรุ่น
    const sql = `SELECT * FROM students WHERE student_code = ? AND batch_id = ? LIMIT 1`;
    const [rows]: any = await conn.query(sql, [student_code, batch_id]);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "ไม่พบข้อมูลนักเรียนในรุ่นนี้ หรือรหัสนักเรียนไม่ถูกต้อง",
      });
    }

    const student = rows[0];

    // 2. ตรวจสอบรหัสผ่าน (เลข 4 ตัวท้าย)
    // กรณีไม่ได้เข้ารหัส (เก็บเป็น plain text)
    // const isMatch = (password === student.password);

    const isMatch = password === student.password;

    // กรณีใช้ bcrypt เข้ารหัสไว้ (แนะนำ)
    // const isMatch = await bcrypt.compare(password, student.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "รหัสผ่าน (เลข 4 ตัวท้ายบัตร ปชช.) ไม่ถูกต้อง",
      });
    }

    // 3. สร้าง Token เพื่อให้นักเรียนเอาไปใช้ดูคะแนน
    const secretKey = process.env.JWT_SECRET || "SIGNAL";

    const token = jwt.sign(
      {
        student_id: student.id,
        student_code: student.student_code,
        batch_id: student.batch_id,
      },
      secretKey, // เปลี่ยนมาใช้ตัวแปรนี้แทนการพิมพ์ข้อความตรงๆ
      { expiresIn: "2h" },
    );

    return res.status(200).json({
      success: true,
      message: "เข้าสู่ระบบสำเร็จ",
      token: token,
      studentData: {
        first_name: student.first_name,
        last_name: student.last_name,
        rank_name: student.rank_name,
      },
    });
  } catch (error: any) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์",
    });
  }
};
