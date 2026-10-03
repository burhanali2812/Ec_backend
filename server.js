const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const moment = require("moment-timezone");
const { messaging } = require("./services/firebase");
const { runClassEndingSoonCheck, runEveningCheck } = require("./services/Attendancecronservice");

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
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    console.log("Retrying in 5s...");
    setTimeout(connectDB, 5000);
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
app.use("/api/testScheduleAndSyllabus", require("./routes/testShaduleRoutes"));
app.use("/api/testGenerator", require("./routes/testGeneratorRoutes"));
app.use("/api/institution", require("./routes/institutionRoutes"));
app.use("/api/superAdmin", require("./routes/superAdminRoutes"));
app.use("/api/cron", require("./routes/cron")); // manual/debug triggers only, see note below

const Registration = require("./modals/Registration");
const StudentFee = require("./modals/StudentFee");

/**
 * Generate Monthly Fees
 */
const generateMonthlyFees = async () => {
  try {
    const currentDate = moment().tz("Asia/Karachi");
    const month = currentDate.format("YYYY-MM");

    console.log(`\n Generating fees for ${month}`);

    const registrations = await Registration.find().populate("aboutCourse.course");
    console.log(`Registrations Found: ${registrations.length}`);

    let createdCount = 0;

    for (const registration of registrations) {
      try {
        if (!registration.aboutCourse || registration.aboutCourse.length === 0) {
          console.log(" Skipped (No Courses)");
          continue;
        }

        const existingFee = await StudentFee.findOne({
          registration: registration._id,
          month,
        });

        if (existingFee) {
          console.log(" Fee already exists");
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
        console.log(`Fee created for registration ${registration._id}`);
      } catch (err) {
        console.error(` Error for registration ${registration._id}:`, err.message);
      }
    }

    console.log(` Completed. Created ${createdCount} fees for ${month}\n`);

    return {
      success: true,
      month,
      createdCount,
      totalRegistrations: registrations.length,
    };
  } catch (error) {
    console.error(" Fee Generation Error:", error);
    throw error;
  }
};


app.post("/api/generate-monthly-fees", async (req, res) => {
  try {
    const result = await generateMonthlyFees();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// 1st of every month at 01:00 Karachi time — generate monthly fees.
cron.schedule(
  "0 1 1 * *",
  () => {
    generateMonthlyFees().catch((err) => console.error("Monthly fee cron failed:", err));
  },
  { timezone: "Asia/Karachi" }
);

// Every 5 minutes, all day — catches every class within its 10-min "ending soon" window.
cron.schedule(
  "*/5 * * * *",
  () => {
    runClassEndingSoonCheck().catch((err) => console.error("Class-ending-soon cron failed:", err));
  },
  { timezone: "Asia/Karachi" }
);

// Every 30 minutes, all day — the job itself no-ops before 9 PM Karachi time.
cron.schedule(
  "*/30 * * * *",
  () => {
    runEveningCheck().catch((err) => console.error("Evening attendance cron failed:", err));
  },
  { timezone: "Asia/Karachi" }
);

connectDB().then(async () => {

  try {
    const month = moment().tz("Asia/Karachi").format("YYYY-MM");
    const anyFeeThisMonth = await StudentFee.exists({ month });
    if (!anyFeeThisMonth) {
      console.log(`No fees found for ${month} on startup — running catch-up generation`);
      await generateMonthlyFees();
    }
  } catch (err) {
    console.error("Startup fee catch-up failed:", err);
  }
});


app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});

module.exports = app;