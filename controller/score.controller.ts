import { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import { conn } from "../dbconn";

// ==========================================
// 1. บันทึกคะแนนหลายวิชา (ของนักเรียน 1 คน)
// ==========================================
export const saveScoresAndCalculate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const connection = await conn.getConnection();
  try {
    const { student_id, batch_id, scores } = req.body;
    if (!student_id || !batch_id || !scores || !Array.isArray(scores)) {
      res.status(400).json({ error: "ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง" });
      return;
    }

    await connection.beginTransaction();

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

    await connection.commit();

    const detailQuery = `
            SELECT sg.group_name, sub.subject_name, sbs.max_score, COALESCE(ss.raw_score, 0) AS raw_score
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

    const summaryQuery = `
            SELECT sg.group_name, sg.credits, SUM(sbs.max_score) AS group_max_score,
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
      message: "บันทึกและคำนวณผลสำเร็จ",
      student_id: student_id,
      batch_id: batch_id,
      subject_details: subjectDetails,
      group_summaries: groupSummaries,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error in saveScoresAndCalculate:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
  } finally {
    connection.release();
  }
};

// ==========================================
// 2. บันทึกคะแนน 1 วิชา (ของนักเรียน 1 คน)
// ==========================================
export const saveSingleScore = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const connection = await conn.getConnection();
  try {
    const { student_id, batch_id, setting_id, raw_score } = req.body;
    if (!student_id || !batch_id || !setting_id || raw_score === undefined) {
      res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
      return;
    }

    await connection.beginTransaction();

    const insertQuery = `
            INSERT INTO student_scores (student_id, setting_id, raw_score)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE raw_score = VALUES(raw_score)
        `;
    await connection.execute(insertQuery, [student_id, setting_id, raw_score]);
    await connection.commit();

    const summaryQuery = `
            SELECT sg.group_name, sg.credits, SUM(sbs.max_score) AS group_max_score,
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

// ==========================================
// 3. อัปเดตคะแนนเต็มรายวิชา (Max Score)
// ==========================================
export const updateSubjectMaxScore = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { setting_id, max_score } = req.body;
    if (!setting_id || max_score === undefined) {
      res
        .status(400)
        .json({ error: "กรุณาระบุ setting_id และ max_score ให้ครบถ้วน" });
      return;
    }

    const updateQuery = `UPDATE subject_batch_settings SET max_score = ? WHERE id = ?`;
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

// ==========================================
// 4. ดึงข้อมูลคะแนนทั้งหมด (ของนักเรียน 1 คน)
// ==========================================
export const getStudentScores = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const studentId = req.params.student_id as string;
    const batchId = req.query.batch_id as string;

    if (!studentId || !batchId) {
      res.status(400).json({ error: "กรุณาระบุ student_id และ batch_id" });
      return;
    }

    const detailQuery = `
            SELECT sg.group_name, sub.subject_name, sbs.max_score, COALESCE(ss.raw_score, 0) AS raw_score
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

    const summaryQuery = `
            SELECT sg.group_name, sg.credits, SUM(sbs.max_score) AS group_max_score,
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

// ==========================================
// 🌟 5. (NEW) แอดมินดึงรายชื่อนักเรียนและคะแนนดิบ 1 วิชา (ทั้งห้อง)
// ==========================================
export const getAdminSubjectScores = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const batch_id = req.query.batch_id;
  const subject_id = req.query.subject_id;

  if (!batch_id || !subject_id) {
    res
      .status(400)
      .json({ success: false, message: "กรุณาส่ง batch_id และ subject_id" });
    return;
  }

  try {
    const settingSql = `SELECT id as setting_id, max_score FROM subject_batch_settings WHERE batch_id = ? AND subject_id = ? LIMIT 1`;
    const [settingRows]: any = await conn.query(settingSql, [
      batch_id,
      subject_id,
    ]);

    if (settingRows.length === 0) {
      res
        .status(404)
        .json({
          success: false,
          message: "ยังไม่ได้ตั้งค่าคะแนนเต็ม (max_score) สำหรับวิชานี้",
        });
      return;
    }

    const setting = settingRows[0];

    const studentSql = `
      SELECT 
        st.id AS student_id, 
        st.student_code, 
        st.rank_name, 
        st.first_name, 
        st.last_name, 
        ss.raw_score 
      FROM students st
      LEFT JOIN student_scores ss ON st.id = ss.student_id AND ss.setting_id = ?
      WHERE st.batch_id = ?
      ORDER BY st.student_code ASC
    `;
    const [studentRows]: any = await conn.query(studentSql, [
      setting.setting_id,
      batch_id,
    ]);

    res.status(200).json({
      success: true,
      max_score: setting.max_score,
      data: studentRows,
    });
  } catch (error) {
    console.error("Get Admin Scores Error:", error);
    res
      .status(500)
      .json({ success: false, message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
  }
};

// ==========================================
// 🌟 6. (NEW) แอดมินบันทึกคะแนนรวดเดียวทั้งห้อง
// ==========================================
export const saveAdminBulkScores = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { batch_id, subject_id, scores } = req.body;

  if (!batch_id || !subject_id || !scores || !Array.isArray(scores)) {
    res
      .status(400)
      .json({ success: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    return;
  }

  const connection = await conn.getConnection();

  try {
    const settingSql = `SELECT id as setting_id FROM subject_batch_settings WHERE batch_id = ? AND subject_id = ? LIMIT 1`;
    const [settingRows]: any = await connection.query(settingSql, [
      batch_id,
      subject_id,
    ]);

    if (settingRows.length === 0) {
      res
        .status(404)
        .json({ success: false, message: "ไม่พบข้อมูลการตั้งค่ารายวิชานี้" });
      return;
    }

    const setting_id = settingRows[0].setting_id;

    await connection.beginTransaction();

    const insertQuery = `
      INSERT INTO student_scores (student_id, setting_id, raw_score) 
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE raw_score = VALUES(raw_score), updated_at = CURRENT_TIMESTAMP
    `;

    for (const scoreItem of scores) {
      await connection.execute(insertQuery, [
        scoreItem.student_id,
        setting_id,
        scoreItem.raw_score,
      ]);
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "บันทึกคะแนนทั้งหมดเรียบร้อยแล้ว",
      saved_count: scores.length,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Save Admin Bulk Scores Error:", error);
    res
      .status(500)
      .json({ success: false, message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
  } finally {
    connection.release();
  }
};
