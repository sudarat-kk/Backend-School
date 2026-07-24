import { Request, Response } from "express";
import fs from "fs";
import csv from "csv-parser";
import "multer";
import { conn } from "../dbconn";

export const uploadStudent = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  const batch_id: string = req.body.batch_id;
  const file: Express.Multer.File | undefined = req.file;

  // เช็คว่ามีไฟล์และรุ่นส่งมาหรือไม่
  if (!file || !batch_id) {
    return res
      .status(400)
      .json({ message: "กรุณาเลือกรุ่นและอัปโหลดไฟล์ CSV" });
  }

  const result: any[] = []; // แก้ไขจุดที่พิมพ์ผิดและวงเล็บเกิน

  fs.createReadStream(file.path)
    // 1. เพิ่มตั้งค่า mapHeaders เพื่อทำความสะอาดอักขระซ่อนเร้น (BOM) หรือช่องว่างที่ติดมากับชื่อคอลัมน์
    .pipe(
      csv({
        mapHeaders: ({ header }) => header.trim(),
      }),
    )
    .on("data", (data: any) => result.push(data))
    .on("end", async () => {
      const connection = await conn.getConnection();
      try {
        await connection.beginTransaction();

        for (let row of result) {
          // 2. ดักจับแถวว่าง หรือ แถวหัวกระดาษ
          // ถ้าคอลัมน์ 'ลำดับ' ไม่มีข้อมูล ให้ข้าม (continue) ไปทำรอบถัดไปทันที
          if (!row["ลำดับ"] || String(row["ลำดับ"]).trim() === "") {
            continue;
          }

          const student_code: string = row["ลำดับ"];
          const password: string = row["รหัสผ่าน"] || "1234";
          const affiliation: string = row["สังกัด"] || "";

          // แกะ ยศ ชื่อ สกุล
          const fullName: string = row["ยศ - ชื่อ - สกุล"] || "";
          const parts: string[] = fullName
            .split(" ")
            .filter((p: string) => p.trim() !== "");

          let rank_name: string = "",
            first_name: string = "",
            last_name: string = "";

          if (parts.length >= 3) {
            rank_name = parts[0];
            first_name = parts[1];
            last_name = parts.slice(2).join(" ");
          } else if (parts.length === 2) {
            first_name = parts[0];
            last_name = parts[1];
          }

          const query = `
                        INSERT INTO students 
                        (batch_id, student_code, password, rank_name, first_name, last_name, affiliation) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;

          await connection.execute(query, [
            batch_id,
            student_code,
            password,
            rank_name,
            first_name,
            last_name,
            affiliation,
          ]);
        }

        await connection.commit();
        res.status(200).json({ message: "อัปโหลดข้อมูลสำเร็จ" });
      } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปโหลดข้อมูล" });
      } finally {
        connection.release();
        // เพิ่ม Optional Chaining (?) ป้องกัน TypeScript ฟ้อง Error ว่า file อาจเป็น undefined
        if (file?.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    });
};

export const getStudents = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  let connection;
  try {
    connection = await conn.getConnection();
    const query = `
            SELECT * FROM students
        `;
    const [rows] = await connection.execute(query);
    return res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลนักเรียน" });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
