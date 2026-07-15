import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config(); // โหลดค่าจากไฟล์ .env

export const conn = mysql.createPool({
  // เพิ่ม as string เพื่อบอก TypeScript ว่าค่านี้เป็น string แน่นอน
  host: process.env.DB_HOST as string,
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
