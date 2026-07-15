import { Request, Response } from "express";
import { conn } from "../dbconn"; // เรียกใช้ connection pool ที่เราสร้างไว้

export const getGroupedCourses = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const sql = `
            SELECT 
                c.id AS course_id, 
                c.course_name, 
                c.curriculum_year,
                b.id AS batch_id, 
                b.batch_name, 
                b.start_date
            FROM courses c
            LEFT JOIN course_batches b ON c.id = b.course_id
            ORDER BY c.course_name ASC, c.curriculum_year ASC, b.start_date ASC;
        `;

    const [rows]: any = await conn.query(sql);

    interface BatchItem {
      course_id: number;
      curriculum_year: number;
      batch_id: number;
      batch_name: string;
      start_date: string;
    }

    interface CourseGroup {
      course_name: string;
      batches: BatchItem[];
    }

    const coursesMap: Record<string, CourseGroup> = {};

    rows.forEach((row: any) => {
      const name = row.course_name;

      if (!coursesMap[name]) {
        coursesMap[name] = {
          course_name: name,
          batches: [],
        };
      }

      if (row.batch_id) {
        coursesMap[name].batches.push({
          course_id: row.course_id,
          curriculum_year: row.curriculum_year,
          batch_id: row.batch_id,
          batch_name: row.batch_name,
          start_date: row.start_date,
        });
      }
    });

    res.status(200).json({
      success: true,
      data: Object.values(coursesMap),
    });
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
