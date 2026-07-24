const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
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
 * Manual API Trigger
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
 * Start Server
 */
connectDB().then(() => {
  // TESTING CRON (every minute)
  // cron.schedule("* * * * *", async () => {

  // PRODUCTION CRON (1st day of every month at midnight)
cron.schedule(
  "20 2 1 * *",
  async () => {
    console.log("Monthly Fee Cron Started");
    await generateMonthlyFees();
  },
  {
    timezone: "Asia/Karachi",
  }
);

  console.log("✅ Cron Job Registered");

  app.listen(PORT, () => {
    console.log(`🚀 Server Running on PORT ${PORT}`);
  });
});