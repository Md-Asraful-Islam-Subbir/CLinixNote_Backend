import express from "express";
import { getConnection, sql } from "../config/mysqlDb.js";

const router = express.Router();

router.post("/save-mysql", async (req, res) => {
  console.log("📥 Received request to save prescription:", req.body);
  
  try {
    const { 
      patientName, 
      contact, 
      doctorName, 
      date, 
      time, 
      prescriptionText 
    } = req.body;

    // 🔍 Validate required fields
    if (!patientName || !contact || !doctorName || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Get MSSQL connection
    const pool = await getConnection();

    // 💾 SQL Insert Query
    const query = `
      INSERT INTO prescriptions 
      (patientName, contact, doctorName, date, time, prescriptionText, createdAt)
      OUTPUT INSERTED.id
      VALUES (@patientName, @contact, @doctorName, @date, @time, @prescriptionText, GETDATE())
    `;

    console.log("📝 Executing SQL query...");
    const request = pool.request();
    request.input('patientName', sql.VarChar(255), patientName);
    request.input('contact', sql.VarChar(100), contact);
    request.input('doctorName', sql.VarChar(255), doctorName);
    request.input('date', sql.Date, date);
    request.input('time', sql.VarChar(50), time);
    request.input('prescriptionText', sql.Text, prescriptionText || null);

    const result = await request.query(query);
    console.log("✅ Prescription saved successfully, ID:", result.recordset[0].id);

    return res.json({
      success: true,
      message: "Prescription saved to database!",
      id: result.recordset[0].id,
    });

  } catch (err) {
    console.error("❌ Database error:", err);
    return res.status(500).json({
      success: false,
      message: "Database error: " + err.message,
      error: err.message,
    });
  }
});

export default router;