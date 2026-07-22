import { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import { conn } from "../dbconn";

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
      res.status(404).json({
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

//ตัดเกรด
export const processGroupGrades = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const batchId = req.query.batch_id;
  const groupId = req.query.group_id;

  if (!batchId || !groupId) {
    res.status(400).json({
      success: false,
      message: "กรุณาระบุ batch_id และ group_id ให้ครบถ้วน",
    });
    return;
  }

  try {
    // 1. ดึงเกณฑ์การตัดเกรด
    let [criteria]: any = await conn.query(
      `SELECT grade_name, grade_point, min_percent FROM grading_criteria 
       WHERE batch_id = ? OR batch_id IS NULL ORDER BY min_percent DESC`,
      [batchId],
    );

    if (criteria.length === 0) {
      criteria = [
        { grade_name: "A", grade_point: 4.0, min_percent: 91 },
        { grade_name: "B+", grade_point: 3.5, min_percent: 86 },
        { grade_name: "B", grade_point: 3.0, min_percent: 81 },
        { grade_name: "C+", grade_point: 2.5, min_percent: 76 },
        { grade_name: "C", grade_point: 2.0, min_percent: 70 },
        { grade_name: "D+", grade_point: 1.5, min_percent: 60 },
        { grade_name: "D", grade_point: 1.0, min_percent: 50 },
        { grade_name: "F", grade_point: 0.0, min_percent: 0 },
      ];
    }

    // 🌟 2. [ส่วนที่แก้ไข] ดึงข้อมูลวิชาย่อย เพื่อนำไปสร้างเป็นคอลัมน์ 🌟
    const groupSql = `
      SELECT sg.group_name, sg.credits AS total_credit, sub.id AS subject_id, sub.subject_name, sbs.max_score
      FROM subject_groups sg
      JOIN subjects sub ON sg.id = sub.group_id
      JOIN subject_batch_settings sbs ON sub.id = sbs.subject_id
      WHERE sg.id = ? AND sbs.batch_id = ?
    `;
    const [subjectsInGroup]: any = await conn.query(groupSql, [
      groupId,
      batchId,
    ]);

    if (subjectsInGroup.length === 0) {
      res
        .status(404)
        .json({ success: false, message: "ไม่พบข้อมูลรายวิชาในกลุ่มนี้" });
      return;
    }

    const actualGroupName = subjectsInGroup[0].group_name;
    const totalGroupCredit = Number(subjectsInGroup[0].total_credit) || 0;

    let totalGroupMaxScore = 0;
    // สร้าง Array เก็บรายวิชาเพื่อส่งไปวาดหัวตารางใน Angular
    const subjectColumns = subjectsInGroup.map((s: any) => {
      totalGroupMaxScore += Number(s.max_score) || 0;
      return {
        subject_id: s.subject_id,
        subject_name: s.subject_name,
        max_score: Number(s.max_score) || 0,
      };
    });

    // 🌟 3. [ส่วนที่แก้ไข] ดึงคะแนนดิบทั้งหมดแยกตามรายวิชา ไม่ใช้ SUM() แล้ว 🌟
    const scoreSql = `
      SELECT 
        st.id AS student_id, st.student_code, st.rank_name, st.first_name, st.last_name,
        ss.raw_score, sub.id AS subject_id
      FROM students st
      JOIN student_scores ss ON st.id = ss.student_id
      JOIN subject_batch_settings sbs ON ss.setting_id = sbs.id
      JOIN subjects sub ON sbs.subject_id = sub.id
      WHERE sbs.batch_id = ? AND sub.group_id = ?
    `;
    const [rawScores]: any = await conn.query(scoreSql, [batchId, groupId]);

    // นำคะแนนมาจัดกลุ่มตามนักเรียนแต่ละคน
    const studentMap = new Map();

    rawScores.forEach((row: any) => {
      // ถ้านักเรียนคนนี้ยังไม่มีใน Map ให้สร้างใหม่พร้อมกระเป๋าเก็บคะแนนแยกวิชา (subject_scores)
      if (!studentMap.has(row.student_id)) {
        studentMap.set(row.student_id, {
          student_id: row.student_id,
          student_code: row.student_code,
          full_name: `${row.rank_name} ${row.first_name} ${row.last_name}`,
          total_raw_score: 0,
          subject_scores: {}, // 👈 กระเป๋าเก็บคะแนนแต่ละวิชา
        });
      }

      const st = studentMap.get(row.student_id);
      const score = Number(row.raw_score) || 0;

      st.subject_scores[row.subject_id] = score; // หยอดคะแนนลงวิชาที่ตรงกัน
      st.total_raw_score += score; // บวกคะแนนรวม
    });

    // 4. ตัดเกรดและคำนวณค่าประกอบ (Index)
    const finalResults = Array.from(studentMap.values()).map((st: any) => {
      const percent = (st.total_raw_score / totalGroupMaxScore) * 100;

      let assignedGrade = criteria[criteria.length - 1];
      for (const c of criteria) {
        if (percent >= Number(c.min_percent)) {
          assignedGrade = c;
          break;
        }
      }

      const indexValue = totalGroupCredit * Number(assignedGrade.grade_point);

      return {
        student_id: st.student_id,
        student_code: st.student_code,
        full_name: st.full_name,
        total_raw_score: st.total_raw_score.toFixed(2),
        total_max_score: totalGroupMaxScore,
        percent: percent.toFixed(2),
        grade: assignedGrade.grade_name,
        grade_point: assignedGrade.grade_point,
        index_value: indexValue.toFixed(2),
        subject_scores: st.subject_scores, // 👈 ส่งกระเป๋าคะแนนแยกวิชากลับไปด้วย
      };
    });

    // 5. ส่งกลับข้อมูลไปให้หน้าเว็บ
    res.status(200).json({
      success: true,
      summary: {
        group_name: actualGroupName,
        total_credit: totalGroupCredit,
        total_max_score: totalGroupMaxScore,
        subjects: subjectColumns, // 👈 ส่งหัวตารางกลับไปให้ Angular วนลูป
      },
      data: finalResults,
    });
  } catch (error) {
    console.error("Error processing group grades:", error);
    res
      .status(500)
      .json({ success: false, message: "เกิดข้อผิดพลาดในการประมวลผลคะแนน" });
  }
};

export const getscore = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = req.query.batch_id;
    if (!batchId) {
      res.status(400).json({ error: "กรุณาระบุ batch_id" });
      return;
    }

    // 🌟 1. ดึงเกณฑ์การตัดเกรดมาเตรียมไว้ (เหมือน processGroupGrades)
    let [criteria]: any = await conn.query(
      `SELECT grade_name, grade_point, min_percent FROM grading_criteria 
       WHERE batch_id = ? OR batch_id IS NULL ORDER BY min_percent DESC`,
      [batchId],
    );

    if (criteria.length === 0) {
      criteria = [
        { grade_name: "A", grade_point: 4.0, min_percent: 91 },
        { grade_name: "B+", grade_point: 3.5, min_percent: 86 },
        { grade_name: "B", grade_point: 3.0, min_percent: 81 },
        { grade_name: "C+", grade_point: 2.5, min_percent: 76 },
        { grade_name: "C", grade_point: 2.0, min_percent: 70 },
        { grade_name: "D+", grade_point: 1.5, min_percent: 60 },
        { grade_name: "D", grade_point: 1.0, min_percent: 50 },
        { grade_name: "F", grade_point: 0.0, min_percent: 0 },
      ];
    }

    // 2. ดึงข้อมูลวิชาและคะแนน
    const query = `
      SELECT 
        st.id AS student_id, st.student_code, st.rank_name, st.first_name, st.last_name,
        sub.id AS subject_id, sub.subject_name,
        sub.group_id, 
        sg.group_name, 
        sg.credits AS credit, 
        sbs.max_score, 
        sc.raw_score
      FROM students st
      JOIN subject_batch_settings sbs ON st.batch_id = sbs.batch_id
      JOIN subjects sub ON sbs.subject_id = sub.id
      JOIN subject_groups sg ON sub.group_id = sg.id 
      LEFT JOIN student_scores sc ON st.id = sc.student_id AND sbs.id = sc.setting_id 
      WHERE st.batch_id = ?
      ORDER BY st.student_code ASC, sub.id ASC
    `;

    const [rows]: any = await conn.query(query, [batchId]);

    if (rows.length === 0) {
      res.json({ success: true, summary: {}, data: [] });
      return;
    }

    // 3. จัดกลุ่มวิชา
    const groupsMap: any = {};
    const studentsMap: any = {};
    const masterSubjects: any[] = [];
    let totalMaxScoreAll = 0;
    let totalCreditAll = 0;

    rows.forEach((row: any) => {
      // --- จัดการข้อมูลหัวตาราง (กลุ่มวิชา) ---
      if (!groupsMap[row.group_id]) {
        groupsMap[row.group_id] = {
          groupId: row.group_id,
          groupName: row.group_name || "",
          credit: Number(row.credit) || 0,
          subjects: [],
          group_max_score: 0, // 👈 เพิ่มตัวแปรเก็บคะแนนเต็มของกลุ่ม
        };
        totalCreditAll += Number(row.credit) || 0;
      }

      const group = groupsMap[row.group_id];

      const isSubjectExist = group.subjects.find(
        (s: any) => s.id === row.subject_id,
      );
      if (!isSubjectExist) {
        const newSubject = {
          id: row.subject_id,
          name: row.subject_name,
          max_score: Number(row.max_score) || 0,
        };
        group.subjects.push(newSubject);
        masterSubjects.push(newSubject);

        group.group_max_score += newSubject.max_score; // บวกคะแนนเต็มของกลุ่ม
        totalMaxScoreAll += newSubject.max_score;
      }

      // --- จัดการข้อมูลนักเรียน ---
      if (!studentsMap[row.student_id]) {
        studentsMap[row.student_id] = {
          student_id: row.student_id,
          student_code: row.student_code,
          full_name:
            `${row.rank_name || ""} ${row.first_name || ""} ${row.last_name || ""}`.trim(),
          total_raw_score: 0,
          total_max_score: 0,
          percent: "0.00",
          gpa: "0.00",
          subject_scores: {}, // เผื่อไว้ใช้
          group_raw_scores: {}, // 👈 เก็บผลรวมคะแนนดิบแยกตามกลุ่ม
        };
      }
      const student = studentsMap[row.student_id];

      if (row.raw_score !== null && row.raw_score !== undefined) {
        const score = Number(row.raw_score);
        student.subject_scores[row.subject_id] = score;
        student.group_raw_scores[row.group_id] =
          (student.group_raw_scores[row.group_id] || 0) + score;
        student.total_raw_score += score;
      }
    });

    const subjectGroups = Object.values(groupsMap).map((grp: any) => {
      grp.isSingle = grp.subjects.length === 1;
      if (grp.isSingle) {
        grp.groupName = `${grp.subjects[0].name} ${grp.credit} นก.`;
      } else {
        grp.groupName = `รวม ${grp.subjects.length} วิชา ${grp.credit} นก.`;
      }
      return grp;
    });

    // 🌟 4. ตัดเกรดและคำนวณ GPA 🌟
    const data = Object.values(studentsMap).map((student: any) => {
      student.total_max_score = totalMaxScoreAll;
      student.percent =
        totalMaxScoreAll > 0
          ? ((student.total_raw_score / totalMaxScoreAll) * 100).toFixed(2)
          : "0.00";

      let totalIndexForGPA = 0;
      let totalCreditForGPA = 0;

      student.group_results = {}; // 👈 กระเป๋าเก็บเกรดและอินเด็กซ์ส่งไป Frontend

      // วนลูปตัดเกรดทีละกลุ่มวิชา
      Object.values(groupsMap).forEach((grp: any) => {
        const rawScore = student.group_raw_scores[grp.groupId];

        if (rawScore !== undefined) {
          // คิด % ของกลุ่มนี้
          const percent =
            grp.group_max_score > 0
              ? (rawScore / grp.group_max_score) * 100
              : 0;

          // ตัดเกรดเทียบกับ Criteria
          let assignedGrade = criteria[criteria.length - 1]; // ค่าเริ่มต้นคือตัวต่ำสุด (F)
          for (const c of criteria) {
            if (percent >= Number(c.min_percent)) {
              assignedGrade = c;
              break;
            }
          }

          // คำนวณอินเด็กซ์ (หน่วยกิต x เกรดพอยต์)
          const indexValue = grp.credit * Number(assignedGrade.grade_point);

          // เก็บผลลัพธ์ใส่ Object เพื่อส่งกลับ
          student.group_results[grp.groupId] = {
            grade: assignedGrade.grade_name,
            index_value: indexValue.toFixed(2),
            raw_score: rawScore,
          };

          // บวกสะสมเพื่อคิด GPA รวม (ถ้าไม่ใช่วิชา S/U)
          if (
            assignedGrade.grade_name !== "S" &&
            assignedGrade.grade_name !== "U"
          ) {
            totalIndexForGPA += indexValue;
            totalCreditForGPA += grp.credit;
          }
        }
      });

      // คำนวณ GPA รวม
      student.gpa =
        totalCreditForGPA > 0
          ? (totalIndexForGPA / totalCreditForGPA).toFixed(2)
          : "0.00";

      // ลบตัวแปรทดเลขทิ้งให้ JSON คลีนๆ
      delete student.group_raw_scores;
      return student;
    });

    const response = {
      success: true,
      summary: {
        batch_id: Number(batchId),
        total_credit: totalCreditAll,
        total_max_score: totalMaxScoreAll,
        subjectGroups: subjectGroups,
        masterSubjects: masterSubjects,
      },
      data: data,
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching batch score:", error);
    res
      .status(500)
      .json({ success: false, message: "เกิดข้อผิดพลาดในการประมวลผลข้อมูล" });
  }
};
