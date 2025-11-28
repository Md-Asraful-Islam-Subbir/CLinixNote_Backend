import express from "express";
import dotenv from "dotenv";
import SSLCommerzPayment from "sslcommerz-lts";
import Payment from "../models/paymentModel.js";

dotenv.config();
const router = express.Router();

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = process.env.IS_LIVE === "true";

// ✅ Initiate Payment
router.post("/initiate", async (req, res) => {
  console.log("STORE_ID:", process.env.STORE_ID);
console.log("STORE_PASS:", process.env.STORE_PASS );
console.log("IS_LIVE:", process.env.IS_LIVE);

  try {
    const { name, contact, doctor } = req.body;
    if (!name || !contact || !doctor) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const transactionId = "TXN_" + Date.now();

    const data = {
      total_amount: 100,
      currency: "BDT",
      tran_id: transactionId,
      success_url: `${process.env.BACKEND_URL}/api/payment/success`,
      fail_url: `${process.env.BACKEND_URL}/api/payment/fail`,
      cancel_url: `${process.env.BACKEND_URL}/api/payment/cancel`,
      ipn_url: `${process.env.BACKEND_URL}/api/payment/ipn`,

      // Customer Info
      cus_name: name,
      cus_email: "test@example.com",
      cus_add1: "Dhaka",
      cus_city: "Dhaka",
      cus_country: "Bangladesh",
      cus_phone: contact,

      // Product Info
      shipping_method: "NO",
      product_name: "Doctor Appointment",
      product_category: "Health",
      product_profile: "general",
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(data);
console.log("SSLCommerz API Response:", apiResponse);
    if (apiResponse?.GatewayPageURL) {
      // Save pending payment in MongoDB
      await Payment.create({
  tran_id: transactionId,
  amount: data.total_amount,
  status: "Pending",       // initial status
  user: doctor,            // doctor name
  patient_name: name,      // add patient name
  patient_contact: contact // add patient contact
});
      res.json({ url: apiResponse.GatewayPageURL });
    } else {
      res.status(400).json({ error: "Failed to create payment session" });
    }
  } catch (err) {
    console.error("SSLCommerz Init Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Payment Response Handlers
router.post("/success", async (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/payment-success`);
});

router.post("/fail", async (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
});

router.post("/cancel", async (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/payment-cancelled`);
});

router.get("/history", async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load payment history" });
  }
});
router.get("/total-revenue", async (req, res) => {
  try {
    const payments = await Payment.find({});
   // console.log("PAYMENTS:", payments.length);

    const total = payments.reduce(
      (sum, pay) => sum + Number(pay.amount || 0),
      0
    );

    //console.log("TOTAL:", total);
    res.json({ total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
