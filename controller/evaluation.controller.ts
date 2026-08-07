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

// สร้างฟอร์มประเมินใหม่ (พร้อมบันทึกคำถามและตัวเลือก)
export const createEvaluation = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  // 1. รับข้อมูลโครงสร้างใหม่จาก Frontend (ตัด googleFormUrl ทิ้งไป รับ questions เข้ามาแทน)
  const { formType, formName, generationId, subjectId, questions } = req.body;

  // เช็คว่ามีคำถามส่งมาด้วยไหม
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อ" });
  }

  // ดึง connection ออกมาเพื่อทำ Transaction (ป้องกันข้อมูลบันทึกไม่ครบ)
  const connection = await conn.getConnection();

  try {
    await connection.beginTransaction();

    // 2. บันทึก "หัวฟอร์ม" ลงตาราง evaluation_forms (เอา form_url ออก)
    const sqlForm = `
      INSERT INTO evaluation_forms 
      (batch_id, subject_id, evaluation_type, form_name, is_active, created_at, updated_at) 
      VALUES (?, ?, ?, ?, 1, NOW(), NOW())
    `;
    const [formResult]: any = await connection.query(sqlForm, [
      generationId || null,
      subjectId || null,
      formType,
      formName,
    ]);

    const formId = formResult.insertId; // ได้ ID ของฟอร์มมาเพื่อใช้ผูกกับคำถาม

    // 3. วนลูปบันทึก "คำถาม" และ "ตัวเลือก"
    for (const [index, q] of questions.entries()) {
      // 3.1 บันทึกคำถามลงตาราง evaluation_questions
      const sqlQuestion = `
        INSERT INTO evaluation_questions 
        (form_id, question_text, question_type, order_num) 
        VALUES (?, ?, ?, ?)
      `;
      const [questionResult]: any = await connection.query(sqlQuestion, [
        formId,
        q.question_text,
        q.question_type || "choice",
        index + 1, // ให้ลำดับข้อเรียงตาม Array ที่ส่งมา
      ]);

      const questionId = questionResult.insertId; // ได้ ID ของคำถามมาผูกกับตัวเลือก

      // 3.2 ถ้าคำถามนี้เป็นแบบมีตัวเลือก (choice) ให้วนลูปบันทึกตัวเลือกลง evaluation_choices
      if (
        q.question_type === "choice" &&
        q.choices &&
        Array.isArray(q.choices)
      ) {
        const choiceValues = q.choices.map((c: any, cIndex: number) => [
          questionId,
          c.choice_text,
          c.score_value,
          cIndex + 1,
        ]);

        if (choiceValues.length > 0) {
          const sqlChoices = `
            INSERT INTO evaluation_choices (question_id, choice_text, score_value, order_num) 
            VALUES ?
          `;
          await connection.query(sqlChoices, [choiceValues]);
        }
      }
    }

    // ถ้าทุกอย่างผ่านฉลุย ให้ Commit ยืนยันการบันทึกข้อมูล
    await connection.commit();
    return res.status(201).json({
      success: true,
      message: "สร้างชุดแบบประเมินสำเร็จ",
      data: { form_id: formId },
    });
  } catch (error: any) {
    await connection.rollback(); // ถ้าระหว่างเซฟคำถามพัง ให้ยกเลิกการสร้างฟอร์มนี้ทิ้งไปเลย
    console.error("Error createEvaluation:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  } finally {
    connection.release();
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
