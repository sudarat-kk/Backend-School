import app from "./app";

// กำหนด Port (จะดึงจาก .env ก็ได้ หรือใช้ 3000 เป็นค่าตั้งต้น)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
