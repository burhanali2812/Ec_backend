const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const moment = require("moment-timezone");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("EC Portal Backend is Live!");
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  }
};

// Routes
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/teacher", require("./routes/teacherRoutes"));
app.use("/api/courses", require("./routes/coursesRoutes"));
app.use("/api/registration", require("./routes/registrationRoutes"));
app.use("/api/students", require("./routes/studentsRoutes"));
app.use("/api/attendance", require("./routes/attandanceRoutes"));
app.use("/api/leave", require("./routes/leaveApplicationRoutes"));
app.use("/api/timetable", require("./routes/timeTableRoutes"));
app.use("/api/results", require("./routes/resultRoutes"));
app.use("/api/classes", require("./routes/classRoutes"));
app.use("/api/notifications", require("./routes/notificationsRoutes"));

const Registration = require("./modals/Registration");
const StudentFee = require("./modals/StudentFee");

/**
 * Generate Monthly Fees
 */
const generateMonthlyFees = async () => {
  try {
    const currentDate = moment().tz("Asia/Karachi");

    const month = currentDate.format("YYYY-MM");

    console.log(`\n🔄 Generating fees for ${month}`);

    const registrations = await Registration.find().populate(
      "aboutCourse.course"
    );

    console.log(`📊 Registrations Found: ${registrations.length}`);

    let createdCount = 0;

    for (const registration of registrations) {
      try {
        console.log(
          `Checking Registration: ${registration._id} | Courses: ${
            registration.aboutCourse?.length || 0
          }`
        );

        // Skip if no courses
        if (
          !registration.aboutCourse ||
          registration.aboutCourse.length === 0
        ) {
          console.log("⏭️ Skipped (No Courses)");
          continue;
        }

        // Check existing fee
        const existingFee = await StudentFee.findOne({
          registration: registration._id,
          month,
        });

        if (existingFee) {
          console.log("⏭️ Fee already exists");
          continue;
        }

        const actualFee = registration.aboutCourse.reduce(
          (sum, item) => sum + (item.courseActualPrice || 0),
          0
        );

        const finalFee = registration.aboutCourse.reduce(
          (sum, item) => sum + (item.courseDiscountedPrice || 0),
          0
        );

        const discount = actualFee - finalFee;

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 5);

        await StudentFee.create({
          registration: registration._id,
          month,
          actualFee,
          discount,
          finalFee,
          amountPaid: 0,
          remainingFee: finalFee,
          status: "unpaid",
          dueDate,
          isProrated: false,
          proratedDays: null,
          proratedFromDate: null,
          proratedToDate: null,
        });

        createdCount++;

        console.log(
          `✅ Fee created for registration ${registration._id}`
        );
      } catch (err) {
        console.error(
          `❌ Error for registration ${registration._id}:`,
          err.message
        );
      }
    }

    console.log(
      `🎉 Completed. Created ${createdCount} fees for ${month}\n`
    );

    return {
      success: true,
      month,
      createdCount,
      totalRegistrations: registrations.length,
    };
  } catch (error) {
    console.error("❌ Fee Generation Error:", error);
    throw error;
  }
};

/**
 * Middleware: verify the request is genuinely from Vercel Cron.
 * Vercel automatically sets CRON_SECRET as an env var and sends it
 * as "Authorization: Bearer <CRON_SECRET>" on every cron invocation.
 * This stops anyone else from hitting the endpoint and forcing an
 * early/duplicate run.
 */
const verifyCronRequest = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
};

/**
 * Vercel Cron entry point.
 * Vercel Cron Jobs ALWAYS send a GET request — this route exists
 * specifically for that. See vercel.json for the schedule.
 */
app.get("/api/generate-monthly-fees", verifyCronRequest, async (req, res) => {
  try {
    const result = await generateMonthlyFees();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Manual API Trigger (kept for testing / manual runs from your admin panel).
 * Not used by Vercel Cron, but handy to keep for now.
 */
app.post("/api/generate-monthly-fees", async (req, res) => {
  try {
    const result = await generateMonthlyFees();

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * NOTE: node-cron has been removed.
 * Vercel's serverless functions do not keep a process alive in the
 * background, so cron.schedule(...) never actually had a chance to
 * fire in production. Scheduling now happens via Vercel Cron Jobs,
 * configured in vercel.json, which calls the GET route above.
 */

connectDB();

// Vercel wraps this exported app as the serverless handler.
// app.listen is only meaningful for local development.
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 Server Running locally on PORT ${PORT}`);
  });
}

module.exports = app;