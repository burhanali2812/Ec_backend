const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Student = require("../modals/Student");
const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const StudentFee = require("../modals/StudentFee");
const Counter = require("../modals/Counter"); // Import the counter model

router.post("/signUp", authMiddleWare, async (req, res) => {
  const {
    name,
    contact,
    email,
    gender,
    address,
    institutionType,
    classInfo,
    fatherName,
    fatherContact,
  } = req.body;

  // 1. Validation
  if (
    !name ||
    !contact ||
    !email ||
    !gender ||
    !address ||
    !institutionType ||
    !classInfo ||
    !fatherName
  ) {
    return res
      .status(400)
      .json({ message: "All fields are required", success: false });
  }

  try {
    // 2. Strong Check for existing email (Roll number isn't generated yet)
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) {
      return res.status(400).json({
        message: "Student with this email already exists",
        success: false,
      });
    }

    // 3. ATOMIC AUTO-INCREMENT LOGIC
    // This finds the "Academy" or "School" counter and adds 1 to 'seq'
    const counter = await Counter.findOneAndUpdate(
      { id: institutionType },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }, // Create it if it doesn't exist
    );

    const institutionPrefix = institutionType === "Academy" ? "ECA" : "ECS";
    const rollNumber = `${institutionPrefix}-1000${counter.seq}`;

    // 4. Password Generation
    const password = rollNumber + "@" + name.slice(0, 3);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. Create Student
    const student = new Student({
      name,
      contact,
      email,
      gender,
      address,
      classInfo,
      institutionType,
      fatherName,
      fatherContact,
      password: hashedPassword,
      rollNumber,
    });

    await student.save();

    res.status(201).json({
      message: "Student created successfully",
      success: true,
      rollNumber, // Send this back so the admin knows the generated ID
      password,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Server error", success: false, error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const { institutionPrefix, rollNumber, password } = req.body;
  let rollNumberFull;
  if (institutionPrefix && rollNumber) {
    rollNumberFull = `${institutionPrefix}-${rollNumber}`;
  } else {
    return res.status(400).json({
      message: "Institution prefix and roll number are required",
      success: false,
    });
  }
  try {
    // Check if student exists
    const student = await Student.findOne({ rollNumber: rollNumberFull });
    if (!student) {
      return res.status(400).json({
        message: "No student found with this roll number",
        success: false,
      });
    }
    // Check password
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Invalid credentials", success: false });
    }
    // Generate token
    const token = jwt.sign(
      {
        id: student._id,
        role: "student",
        institutionType: student.institutionType,
      },
      process.env.JWT_SECRET,
      { expiresIn: "20d" },
    );
    res.json({ token, success: true, message: "Login successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/allStudents", authMiddleWare, async (req, res) => {
  try {
    const { classInfo } = req.query;
    const query = {};

    if (classInfo) {
      query.classInfo = classInfo;
    }

    const students = await Student.find(query).select("-password");
    res.json({ students, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/getAllStudents", authMiddleWare, async (req, res) => {
  const { institutionType } = req.query;
  if (!institutionType) {
    return res
      .status(400)
      .json({ message: "Institution type is required", success: false });
  }
  try {
    const students = await Student.find({
      institutionType: institutionType,
    }).select("-password");
    if (students.length === 0) {
      return res.status(404).json({
        message: "No students found for this institution type",
        success: false,
      });
    }
    res.json({ students, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/getStudentById/:id", authMiddleWare, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select("-password");
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }
    return res.json({ student, success: true });
  } catch (error) {
    return res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/myProfile", authMiddleWare, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id).select("-password");
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }
    res.json({ student, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.delete("/deleteStudent/:id", authMiddleWare, async (req, res) => {
  try {
    const studentId = req.params.id;
    const student = await Student.findByIdAndDelete(studentId);
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }

    await Registration.deleteMany({ student: studentId });

    res.json({ message: "Student deleted successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.put("/updateStudent/:id", authMiddleWare, async (req, res) => {
  const {
    name,
    contact,
    email,
    gender,
    address,
    institutionType,
    classInfo,
    fatherName,
    fatherContact,
  } = req.body;
  if (
    !name ||
    !contact ||
    !email ||
    !gender ||
    !address ||
    !institutionType ||
    !classInfo ||
    !fatherName ||
    !fatherContact
  ) {
    return res
      .status(400)
      .json({ message: "All fields are required", success: false });
  }
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true },
    ).select("-password");
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }
    res.json({ student, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.post("/studentFee", authMiddleWare, async (req, res) => {
  const { registrationId } = req.body;

  try {
    const registration = await Registration.findById(registrationId);

    const currentDate = new Date();
    // Use registration createdAt if available, otherwise use current date
    let registrationDate = registration.createdAt
      ? new Date(registration.createdAt)
      : currentDate;

    // Get the day of month when student was registered
    let regDayOfMonth = registrationDate.getDate();
    let regMonth = registrationDate.getMonth();
    let regYear = registrationDate.getFullYear();

    console.log(
      "Registration Date:",
      registrationDate,
      "Day:",
      regDayOfMonth,
      "Month:",
      regMonth,
      "Year:",
      regYear,
    );

    // Get current month for fee generation (not registration month)
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();

    // Format month as "YYYY-MM" for database consistency - use CURRENT month, not registration month
    const monthString = String(currentMonth + 1).padStart(2, "0");
    const monthKey = `${currentYear}-${monthString}`;

    console.log("Generating fee for current month:", monthKey);

    // Delete existing fee for current month to allow recalculation when courses change
    await StudentFee.deleteOne({
      registration: registration._id,
      month: monthKey,
    });

    const actualFee = registration.aboutCourse.reduce(
      (sum, item) => sum + item.courseActualPrice,
      0,
    );

    const finalFee = registration.aboutCourse.reduce(
      (sum, item) => sum + item.courseDiscountedPrice,
      0,
    );

    const discount = actualFee - finalFee;

    // Determine if registration is after 10th of the month
    let calculatedFee = finalFee;
    let calculatedActualFee = actualFee;
    let calculatedDiscount = discount;
    let isProrated = false;
    let proratedDays = null;
    let proratedFromDate = null;
    let proratedToDate = null;

    // Check if registration is after 10th AND we're in the registration month - apply proration ONLY for registration month
    const isRegistrationMonth =
      regMonth === currentMonth && regYear === currentYear;

    console.log(
      "Proration Check: Is registration month?",
      isRegistrationMonth,
      "regDayOfMonth(",
      regDayOfMonth,
      ") > 10?",
      regDayOfMonth > 10,
    );

    if (isRegistrationMonth && regDayOfMonth > 10) {
      console.log(
        "✓ PRORATION TRIGGERED - Day",
        regDayOfMonth,
        "in registration month",
      );
      // Prorated fee: from registration date to last day of that month
      const lastDayOfMonth = new Date(regYear, regMonth + 1, 0).getDate();
      const daysRemaining = lastDayOfMonth - regDayOfMonth + 1;
      const totalDaysInMonth = lastDayOfMonth;

      console.log(
        `Proration Details: Last day of month: ${lastDayOfMonth}, Days remaining: ${daysRemaining}, Total days: ${totalDaysInMonth}`,
      );

      // Calculate per-day fee and prorated amount
      const perDayFee = finalFee / totalDaysInMonth;
      calculatedFee = Math.round(perDayFee * daysRemaining);

      const perDayActualFee = actualFee / totalDaysInMonth;
      calculatedActualFee = Math.round(perDayActualFee * daysRemaining);
      calculatedDiscount = calculatedActualFee - calculatedFee;

      console.log(
        `Fee Calculation: perDayFee: ${perDayFee.toFixed(2)}, calculatedFee: ${calculatedFee}`,
      );

      isProrated = true;
      proratedDays = daysRemaining;
      proratedFromDate = registrationDate;
      proratedToDate = new Date(regYear, regMonth + 1, 0); // Last day of month
    } else {
      console.log("✗ NO PRORATION - Full month fee");
    }

    // Calculate due date: 5 days after voucher generation date
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);

    const studentFee = new StudentFee({
      registration: registration._id,
      month: monthKey,
      actualFee: calculatedActualFee,
      discount: calculatedDiscount,
      finalFee: calculatedFee,
      remainingFee: calculatedFee,
      amountPaid: 0,
      status: "unpaid",
      dueDate: dueDate,
      isProrated: isProrated,
      proratedDays: proratedDays,
      proratedFromDate: proratedFromDate,
      proratedToDate: proratedToDate,
    });

    await studentFee.save();

    res.status(200).json({
      message: "Student fee generated successfully!",
      success: true,
      studentFee,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error occurred while saving student fee",
      success: false,
      error: error.message,
    });
  }
});

router.put("/payStudentFee/:feeId", authMiddleWare, async (req, res) => {
  const { amountPaid } = req.body;
  const { feeId } = req.params;

  if (!feeId || amountPaid === undefined) {
    return res.status(400).json({
      message: "feeId and amountPaid are required",
      success: false,
    });
  }

  try {
    const studentFee = await StudentFee.findById(feeId);

    if (!studentFee) {
      return res.status(404).json({
        message: "Student fee record not found",
        success: false,
      });
    }

    const paid = Number(amountPaid);

    // ❌ invalid input
    if (isNaN(paid) || paid < 0) {
      return res.status(400).json({
        message: "Invalid payment amount",
        success: false,
      });
    }

    //  SPECIAL CASE: RESET TO UNPAID
    if (paid === 0) {
      studentFee.amountPaid = 0;
      studentFee.remainingFee = studentFee.finalFee;
      studentFee.status = "unpaid";
      studentFee.paidAt = null;

      await studentFee.save();

      return res.status(200).json({
        message: "Fee reset to unpaid",
        success: true,
        studentFee,
      });
    }

    // ✅ NORMAL PAYMENT FLOW
    studentFee.amountPaid += paid;

    // cap to finalFee
    if (studentFee.amountPaid > studentFee.finalFee) {
      studentFee.amountPaid = studentFee.finalFee;
    }

    studentFee.remainingFee = studentFee.finalFee - studentFee.amountPaid;

    if (studentFee.remainingFee === 0) {
      studentFee.status = "paid";
      studentFee.paidAt = new Date();
    } else {
      studentFee.status = "partial";
    }

    await studentFee.save();

    res.status(200).json({
      message: "Fee payment updated successfully",
      success: true,
      studentFee,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      success: false,
    });
  }
});
router.get("/getStudentFee/:studentId", authMiddleWare, async (req, res) => {
  const { studentId } = req.params;
  const { month, feeFetchType } = req.query; // "monthly" or "all"

  try {
    const registration = await Registration.findOne({ student: studentId });

    if (!registration) {
      return res.status(404).json({
        message: "Registration not found",
        success: false,
      });
    }

    let query = {
      registration: registration._id,
      month: month, // Filter by month for monthly fetch
    };
    if (feeFetchType === "all") {
      delete query.month; // Remove month filter to fetch all fees
    }

    const fees = await StudentFee.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Student fee records fetched successfully",
      success: true,
      fees,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error occurred while fetching student fee records",
      success: false,
    });
  }
});

// Get students by class
router.get(
  "/getStudentsByClass/:className",
  authMiddleWare,
  async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Unauthorized, Only admins can fetch class attendance",
          success: false,
        });
      }
      const { className } = req.params;

      if (!className) {
        return res.status(400).json({
          message: "Class name is required",
          success: false,
        });
      }

      const students = await Student.find(
        { classInfo: className },
        { name: 1, rollNumber: 1, email: 1, fatherContact: 1, classInfo: 1 },
      );

      res.status(200).json({
        message: "Students fetched successfully",
        success: true,
        students,
        count: students.length,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error occurred while fetching students",
        success: false,
        error: error.message,
      });
    }
  },
);


router.get("/migrate-students-fields", async (req, res) => {
  try {
    const result = await Student.updateMany(
      {
        $or: [
          { isPasswordChanged: { $exists: false } },
          { securityQuestion: { $exists: false } },
          { securityAnswer: { $exists: false } },
          { isSecuritySet: { $exists: false } }
        ]
      },
      {
        $set: {
          isPasswordChanged: false,
          securityQuestion: null,
          securityAnswer: null,
          isSecuritySet: false
        }
      }
    );

    res.json({
      message: "Migration completed successfully",
      matched: result.matchedCount,
      modified: result.modifiedCount
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
