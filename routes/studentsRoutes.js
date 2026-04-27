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
    const registrationDate = new Date(registration.createdAt);

    // Get the day of month when student was registered
    const regDayOfMonth = registrationDate.getDate();
    const regMonth = registrationDate.getMonth();
    const regYear = registrationDate.getFullYear();

    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Format month as "YYYY-MM" for database consistency
    const monthString = String(currentMonth + 1).padStart(2, "0");
    const monthKey = `${currentYear}-${monthString}`;

    // Delete existing fee for this month to allow recalculation when courses change
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

    // Determine if registration is after 10th of the CURRENT month (same month as registration)
    let calculatedFee = finalFee;
    let calculatedActualFee = actualFee;
    let calculatedDiscount = discount;
    let isProrated = false;
    let proratedDays = null;
    let proratedFromDate = null;
    let proratedToDate = null;

    // Check if registration is in current month and after 10th
    if (
      regMonth === currentMonth &&
      regYear === currentYear &&
      regDayOfMonth > 10
    ) {
      // Prorated fee: from registration date to last day of that month
      const lastDayOfMonth = new Date(regYear, regMonth + 1, 0).getDate();
      const daysRemaining = lastDayOfMonth - regDayOfMonth + 1;
      const totalDaysInMonth = lastDayOfMonth;

      // Calculate per-day fee and prorated amount
      const perDayFee = finalFee / totalDaysInMonth;
      calculatedFee = Math.round(perDayFee * daysRemaining);
      
      const perDayActualFee = actualFee / totalDaysInMonth;
      calculatedActualFee = Math.round(perDayActualFee * daysRemaining);
      calculatedDiscount = calculatedActualFee - calculatedFee;

      isProrated = true;
      proratedDays = daysRemaining;
      proratedFromDate = registrationDate;
      proratedToDate = new Date(regYear, regMonth + 1, 0); // Last day of month
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

  if (!feeId || !amountPaid) {
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

    studentFee.amountPaid += amountPaid;
    studentFee.remainingFee = studentFee.finalFee - studentFee.amountPaid;

    if (studentFee.remainingFee <= 0) {
      studentFee.status = "paid";
      studentFee.remainingFee = 0;
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
      message: "Error occurred while updating payment",
      success: false,
    });
  }
});
router.get("/getStudentFee/:studentId", authMiddleWare, async (req, res) => {
  const { studentId } = req.params;

  try {
    const registration = await Registration.findOne({ student: studentId });

    if (!registration) {
      return res.status(404).json({
        message: "Registration not found",
        success: false,
      });
    }

    const fees = await StudentFee.find({
      registration: registration._id,
    }).sort({ createdAt: -1 });

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
module.exports = router;
