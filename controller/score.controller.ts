import { Request, Response } from "express";

import { RowDataPacket } from "mysql2";
import { conn } from "../dbconn";

export const saveScoresAndCalculate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // ดึง Connection ออกมาทำ Transaction (เผื่อมีอันไหนพัง จะได้ยกเลิกทั้งหมด)
  const connection = await conn.getConnection();

  try {
    // 1. รับค่าที่ Frontend ส่งมา
    const { student_id, batch_id, scores } = req.body;

    // เช็คว่าส่งข้อมูลมาครบไหม
    if (!student_id || !batch_id || !scores || !Array.isArray(scores)) {
      res.status(400).json({ error: "ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง" });
      return;
    }

    // เริ่มต้น Transaction
    await connection.beginTransaction();

    // 2. ลูปบันทึกคะแนนทีละวิชา
    // ใช้ ON DUPLICATE KEY UPDATE เพื่อให้รองรับทั้งการ "เพิ่มใหม่" และ "แก้ไขคะแนนเดิม"
    const insertQuery = `
            INSERT INTO student_scores (student_id, setting_id, raw_score)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE raw_score = VALUES(raw_score)
        `;

    for (const score of scores) {
      await connection.execute(insertQuery, [
        student_id,
        score.setting_id,
        score.raw_score,
      ]);
    }

    // ยืนยันการบันทึกข้อมูล
    await connection.commit();

    // ==========================================
    // 3. ดึงข้อมูลคะแนน "รายวิชาย่อย" (เอาไปโชว์รายละเอียด)
    // ==========================================
    const detailQuery = `
            SELECT 
                sg.group_name,
                sub.subject_name,
                sbs.max_score,
                COALESCE(ss.raw_score, 0) AS raw_score
            FROM subject_batch_settings sbs
            JOIN subjects sub ON sbs.subject_id = sub.id
            JOIN subject_groups sg ON sub.group_id = sg.id
            LEFT JOIN student_scores ss ON sbs.id = ss.setting_id AND ss.student_id = ?
            WHERE sbs.batch_id = ?
            ORDER BY sg.id, sub.id;
        `;
    const [subjectDetails] = await connection.execute<RowDataPacket[]>(
      detailQuery,
      [student_id, batch_id],
    );

    // ==========================================
    // 4. ดึงข้อมูลคะแนน "รวมตามกลุ่มวิชา" (เอาไปตัดเกรด)
    // ==========================================
    const summaryQuery = `
            SELECT 
                sg.group_name,
                sg.credits,
                SUM(sbs.max_score) AS group_max_score,
                COALESCE(SUM(ss.raw_score), 0) AS group_raw_score,
                COALESCE((SUM(ss.raw_score) / SUM(sbs.max_score)) * 100, 0) AS group_percentage
            FROM subject_groups sg
            JOIN subjects sub ON sg.id = sub.group_id
            JOIN subject_batch_settings sbs ON sub.id = sbs.subject_id
            LEFT JOIN student_scores ss ON sbs.id = ss.setting_id AND ss.student_id = ?
            WHERE sg.batch_id = ?
            GROUP BY sg.id;
        `;
    const [groupSummaries] = await connection.execute<RowDataPacket[]>(
      summaryQuery,
      [student_id, batch_id],
    );

    // 5. ส่งผลลัพธ์กลับไปให้ Frontend
    res.status(200).json({
      message: "บันทึกและคำนวณผลสำเร็จ",
      student_id: student_id,
      batch_id: batch_id,
      subject_details: subjectDetails,
      group_summaries: groupSummaries,
    });
  } catch (error) {
    // ถ้ามีข้อผิดพลาดระหว่างทาง ให้ Rollback (ยกเลิกการบันทึก) กลับไปสถานะเดิม
    await connection.rollback();
    console.error("Error in saveScoresAndCalculate:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
  } finally {
    // คืน Connection กลับเข้า Pool เสมอ
    connection.release();
  }
};
// POST: บันทึกคะแนนรายวิชา (Single Subject)
export const saveSingleScore = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const connection = await conn.getConnection();

  try {
    // รับค่ามาแบบไม่ต้องมี Array 'scores' แล้ว
    const { student_id, batch_id, setting_id, raw_score } = req.body;

    if (!student_id || !batch_id || !setting_id || raw_score === undefined) {
      res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
      return;
    }

    await connection.beginTransaction();

    // 1. บันทึกหรืออัปเดตแค่วิชาเดียว
    const insertQuery = `
            INSERT INTO student_scores (student_id, setting_id, raw_score)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE raw_score = VALUES(raw_score)
        `;

    await connection.execute(insertQuery, [student_id, setting_id, raw_score]);

    await connection.commit();

    // ==========================================
    // 2. ดึงข้อมูลสรุปผลล่าสุด กลับไปให้ Frontend อัปเดตหน้าจอ
    // ==========================================
    const summaryQuery = `
            SELECT 
                sg.group_name,
                sg.credits,
                SUM(sbs.max_score) AS group_max_score,
                COALESCE(SUM(ss.raw_score), 0) AS group_raw_score,
                COALESCE((SUM(ss.raw_score) / SUM(sbs.max_score)) * 100, 0) AS group_percentage
            FROM subject_groups sg
            JOIN subjects sub ON sg.id = sub.group_id
            JOIN subject_batch_settings sbs ON sub.id = sbs.subject_id
            LEFT JOIN student_scores ss ON sbs.id = ss.setting_id AND ss.student_id = ?
            WHERE sg.batch_id = ?
            GROUP BY sg.id;
        `;

    const [groupSummaries] = await connection.execute<RowDataPacket[]>(
      summaryQuery,
      [student_id, batch_id],
    );

    res.status(200).json({
      message: "บันทึกคะแนนรายวิชาสำเร็จ",
      updated_summaries: groupSummaries,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error saving single score:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
  } finally {
    connection.release();
  }
};

// PUT: ให้แอดมินแก้ไขคะแนนเต็มรายวิชา (Max Score)
export const updateSubjectMaxScore = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // รับค่า id ของการตั้งค่าวิชา (setting_id) และคะแนนเต็มค่าใหม่ (max_score)
    const { setting_id, max_score } = req.body;

    if (!setting_id || max_score === undefined) {
      res
        .status(400)
        .json({ error: "กรุณาระบุ setting_id และ max_score ให้ครบถ้วน" });
      return;
    }

    // อัปเดตตาราง subject_batch_settings
    const updateQuery = `
            UPDATE subject_batch_settings 
            SET max_score = ? 
            WHERE id = ?
        `;

    const [result]: any = await conn.execute(updateQuery, [
      max_score,
      setting_id,
    ]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: "ไม่พบรายวิชาที่ต้องการอัปเดต" });
      return;
    }

    res.status(200).json({
      message: "อัปเดตคะแนนเต็มสำเร็จ",
      setting_id: setting_id,
      new_max_score: max_score,
    });
  } catch (error) {
    console.error("Error updating max score:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตคะแนนเต็ม" });
  }
};
// GET: ดึงข้อมูลคะแนนทั้งหมดของนักเรียน 1 คน เพื่อแสดงผลตอนโหลดหน้าเว็บ
export const getStudentScores = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // เติม as string เพื่อแก้ Error ของ TypeScript ตอนส่งตัวแปรเข้าฐานข้อมูล
    const studentId = req.params.student_id as string;
    const batchId = req.query.batch_id as string;

    if (!studentId || !batchId) {
      res.status(400).json({ error: "กรุณาระบุ student_id และ batch_id" });
      return;
    }

    // 1. ดึงข้อมูลรายวิชาย่อย (โชว์คะแนนดิบ)
    const detailQuery = `
            SELECT 
                sg.group_name,
                sub.subject_name,
                sbs.max_score,
                COALESCE(ss.raw_score, 0) AS raw_score
            FROM subject_batch_settings sbs
            JOIN subjects sub ON sbs.subject_id = sub.id
            JOIN subject_groups sg ON sub.group_id = sg.id
            LEFT JOIN student_scores ss ON sbs.id = ss.setting_id AND ss.student_id = ?
            WHERE sbs.batch_id = ?
            ORDER BY sg.id, sub.id;
        `;
    const [subjectDetails] = await conn.execute<RowDataPacket[]>(detailQuery, [
      studentId,
      batchId,
    ]);

    // 2. ดึงข้อมูลสรุปรวมกลุ่มวิชา (โชว์เกรดรวม)
    const summaryQuery = `
            SELECT 
                sg.group_name,
                sg.credits,
                SUM(sbs.max_score) AS group_max_score,
                COALESCE(SUM(ss.raw_score), 0) AS group_raw_score,
                COALESCE((SUM(ss.raw_score) / SUM(sbs.max_score)) * 100, 0) AS group_percentage
            FROM subject_groups sg
            JOIN subjects sub ON sg.id = sub.group_id
            JOIN subject_batch_settings sbs ON sub.id = sbs.subject_id
            LEFT JOIN student_scores ss ON sbs.id = ss.setting_id AND ss.student_id = ?
            WHERE sg.batch_id = ?
            GROUP BY sg.id;
        `;
    const [groupSummaries] = await conn.execute<RowDataPacket[]>(summaryQuery, [
      studentId,
      batchId,
    ]);

    // ส่งข้อมูลทั้ง 2 ก้อนกลับไปให้ Frontend
    res.status(200).json({
      message: "ดึงข้อมูลสำเร็จ",
      student_id: studentId,
      batch_id: batchId,
      subject_details: subjectDetails,
      group_summaries: groupSummaries,
    });
  } catch (error) {
    console.error("Error fetching student scores:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
};
