import express from "express";
import { messaging } from "../firebase.js";


const router = express.Router();

router.post("/test-push", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    const message = {
  token,

  data: {
    type: "ATTENDANCE_REMINDER",
    title: "Attendance Reminder",
    body: "Please mark today's attendance for your assigned class.",
  },
};

    const response = await messaging.send(message);

    console.log("✅ Attendance reminder sent:", response);

    res.status(200).json({
      success: true,
      message: "Attendance reminder sent successfully",
      firebaseResponse: response,
    });

  } catch (error) {
    console.error("❌ Attendance notification error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});