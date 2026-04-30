const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => {
  res.send("Ec Portal Backend is Live!");
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    process.exit(1); // Exit process with failure
  }
};
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/teacher", require("./routes/teacherRoutes"));
app.use("/api/courses", require("./routes/coursesRoutes"));
app.use("/api/registration", require("./routes/registrationRoutes"));
app.use("/api/students", require("./routes/studentsRoutes"));
app.use("/api/attendance", require("./routes/attandanceRoutes"));
app.use("/api/leave", require("./routes/leaveApplicationRoutes"));
app.use("/api/timetable", require("./routes/timeTableRoutes"));
app.use("/api/results", require("./routes/resultRoutes"));

// Cron job to generate monthly fees on 1st of every month
cron.schedule("0 0 1 * *", async () => {
  try {
    const Registration = require("./modals/Registration");
    const StudentFee = require("./modals/StudentFee");

    // Get all registrations
    const registrations =
      await Registration.find().populate("aboutCourse.course");

    for (const registration of registrations) {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      const monthString = String(currentMonth).padStart(2, "0");
      const month = `${currentYear}-${monthString}`;

      // Check if fee already exists for this month
      const existingFee = await StudentFee.findOne({
        registration: registration._id,
        month: month,
      });

      if (
        !existingFee &&
        registration.aboutCourse &&
        registration.aboutCourse.length > 0
      ) {
        // Calculate due date: 5 days after today
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 5);

        // Calculate total fee from all courses using discounted prices
        const finalFee = registration.aboutCourse.reduce(
          (sum, item) => sum + (item.courseDiscountedPrice || 0),
          0,
        );
        const actualFee = registration.aboutCourse.reduce(
          (sum, item) => sum + (item.courseActualPrice || 0),
          0,
        );
        const discount = actualFee - finalFee;

        const newFee = new StudentFee({
          registration: registration._id,
          month: month,
          actualFee: actualFee,
          discount: discount,
          finalFee: finalFee,
          amountPaid: 0,
          remainingFee: finalFee,
          status: "unpaid",
          dueDate: dueDate,
          isProrated: false,
          proratedDays: null,
          proratedFromDate: null,
          proratedToDate: null,
        });

        await newFee.save();
        console.log(
          `✓ Fee created for registration ${registration._id} for month ${month}`,
        );
      }
    }

    console.log("✓ Monthly fees generated successfully for month", month);
  } catch (error) {
    console.error("✗ Error generating monthly fees:", error);
  }
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server Running on PORT ${PORT}`);
  });
});
