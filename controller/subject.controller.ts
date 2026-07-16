import { Request, Response } from "express";
import { conn } from "../dbconn";

export const getSubjectsByBatch = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { batchId } = req.params;

  try {
    // แก้ SQL โดยเพิ่ม LEFT JOIN กับตาราง evaluation_forms
    const sql = `
      SELECT 
        sg.id AS group_id,
        sg.group_name,
        s.id AS subject_id,
        s.subject_name,
        ef.form_url  -- ดึงฟิลด์ url ของฟอร์มออกมา
      FROM subject_groups sg
      LEFT JOIN subjects s ON sg.id = s.group_id
      -- JOIN เพื่อหาฟอร์มของวิชานี้ ในรุ่นนี้ ที่เป็นประเภท 'instructor'
      LEFT JOIN evaluation_forms ef ON s.id = ef.subject_id 
           AND ef.batch_id = sg.batch_id 
           AND ef.evaluation_type = 'instructor'
      WHERE sg.batch_id = ?
      ORDER BY sg.id ASC, s.id ASC;
    `;

    const [rows]: any = await conn.query(sql, [batchId]);

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ไม่พบข้อมูลวิชาสำหรับ Batch นี้",
        data: [],
      });
    }

    const groupsMap: Record<number, any> = {};

    rows.forEach((row: any) => {
      if (!groupsMap[row.group_id]) {
        groupsMap[row.group_id] = {
          group_name: row.group_name,
          subjects: [],
        };
      }

      if (row.subject_id) {
        groupsMap[row.group_id].subjects.push({
          subject_id: row.subject_id,
          subject_name: row.subject_name,
          form_url: row.form_url || null, // เพิ่มบรรทัดนี้ เพื่อแนบลิงก์ฟอร์มไปด้วย (ถ้าไม่มีจะเป็น null)
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: Object.values(groupsMap),
    });
  } catch (error: any) {
    console.error("Database Error:", error);

    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดที่ฐานข้อมูล",
      errorDetails: error.message,
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
