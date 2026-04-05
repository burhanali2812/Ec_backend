const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Student = require("../modals/Student");
const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
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
      return res
        .status(400)
        .json({
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

module.exports = router;
