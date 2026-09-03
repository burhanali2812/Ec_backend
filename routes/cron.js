const express = require("express");
const router = express.Router();
const { runClassEndingSoonCheck, runEveningCheck } = require("../services/attendanceCronService");

/**
 * These routes are NOT what triggers the jobs anymore — node-cron in
 * index.js calls runClassEndingSoonCheck() / runEveningCheck() directly
 * in-process. These endpoints are kept only so you can manually fire a
 * check on demand (e.g. a "Run now" button in an admin panel, or for
 * debugging). Protect them the same way you protect other admin routes.
 */

router.get("/attendance-class-ending-soon", async (req, res) => {
  try {
    const result = await runClassEndingSoonCheck();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Class-ending attendance check error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

router.get("/attendance-evening-check", async (req, res) => {
  try {
    const result = await runEveningCheck();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Evening attendance sweep error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;