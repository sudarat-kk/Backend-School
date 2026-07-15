import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config(); // โหลดค่าจากไฟล์ .env

export const conn = mysql.createPool({
  host: process.env.DB_HOST as string,
  port: Number(process.env.DB_PORT), // เพิ่มบรรทัดนี้
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false, // เพิ่มส่วนนี้ทั้งหมด - Aiven บังคับใช้ SSL
  },
});
