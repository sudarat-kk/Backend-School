import { Request, Response } from "express";
import { conn } from "../dbconn";

// ฟังก์ชันสำหรับดึงข้อมูลแบบประเมินทั้งหมด
export const getAllEvaluations = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    // ดึงข้อมูลทั้งหมดเรียงจากรายการที่สร้างล่าสุด (หรือแก้เป็น WHERE is_active = 1 ถ้าต้องการเฉพาะที่เปิดใช้งาน)
    const sql = `SELECT * FROM evaluation_forms ORDER BY created_at DESC;`;

    const [rows]: any = await conn.query(sql);

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error: any) {
    console.error("Error fetching all evaluations:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลแบบประเมิน",
    });
  }
};

export const getGeneralEvaluation = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { batchId } = req.params;
  const { type } = req.query;

  try {
    const sql = `SELECT form_url FROM evaluation_forms WHERE batch_id = ? AND evaluation_type = ? AND is_active = 1 LIMIT 1;`;
    const [rows]: any = await conn.query(sql, [batchId, type]);

    if (rows.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // ส่งแค่ Array ที่มี form_url
    return res.status(200).json({
      success: true,
      data: [{ form_url: rows[0].form_url }],
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error" });
  }
};

// สร้างฟอร์มประเมินใหม่
export const createEvaluation = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  // เพิ่ม subjectId ที่แนบมาจาก Frontend
  const { formType, googleFormUrl, formName, generationId, subjectId } =
    req.body;

  try {
    const sql = `
      INSERT INTO evaluation_forms 
      (batch_id, subject_id, evaluation_type, form_url, form_name, is_active, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
    `;

    // ใส่ subjectId ลงใน array ของ query parameters
    const [result]: any = await conn.query(sql, [
      generationId || null,
      subjectId || null, // บันทึก subjectId (ถ้าไม่ได้เลือกจะเก็บเป็น null)
      formType,
      googleFormUrl,
      formName,
    ]);

    return res.status(201).json({
      success: true,
      message: "สร้างฟอร์มสำเร็จ",
      data: { id: result.insertId },
    });
  } catch (error: any) {
    console.error("Error createEvaluation:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

// อัปเดตข้อมูลฟอร์มประเมิน
export const updateEvaluation = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  const { id } = req.params;
  // เพิ่ม subjectId ที่แนบมาจาก Frontend
  const { formType, googleFormUrl, formName, generationId, subjectId } =
    req.body;

  try {
    const sql = `
      UPDATE evaluation_forms 
      SET batch_id = ?, subject_id = ?, evaluation_type = ?, form_url = ?, form_name = ?, updated_at = NOW() 
      WHERE id = ?
    `;

    // อัปเดต subjectId ด้วย
    const [result]: any = await conn.query(sql, [
      generationId || null,
      subjectId || null,
      formType,
      googleFormUrl,
      formName,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "ไม่พบข้อมูลที่ต้องการแก้ไข" });
    }

    return res
      .status(200)
      .json({ success: true, message: "อัปเดตข้อมูลสำเร็จ" });
  } catch (error: any) {
    console.error("Error updateEvaluation:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};
