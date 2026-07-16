import { Request, Response } from "express";
import { conn } from "../dbconn";

export const getSubjectsByBatch = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  // แก้ตรงนี้จาก void เป็น Response
  const { batchId } = req.params;

  try {
    const sql = `
      SELECT 
        sg.id AS group_id,
        sg.group_name,
        s.id AS subject_id,
        s.subject_name
      FROM subject_groups sg
      LEFT JOIN subjects s ON sg.id = s.group_id
      WHERE sg.batch_id = ?
      ORDER BY sg.id ASC, s.id ASC;
    `;

    const [rows]: any = await conn.query(sql, [batchId]);

    // เช็คข้อมูลว่าง
    if (rows.length === 0) {
      return res.status(200).json({
        // เติม return
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
        });
      }
    });

    return res.status(200).json({
      // เติม return
      success: true,
      data: Object.values(groupsMap),
    });
  } catch (error: any) {
    console.error("Database Error:", error);

    return res.status(500).json({
      // เติม return
      success: false,
      message: "เกิดข้อผิดพลาดที่ฐานข้อมูล",
      errorDetails: error.message,
    });
  }
};
