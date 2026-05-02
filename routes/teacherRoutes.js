const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/signUp", async (req, res) => {
  {
    const { name, contact, email, cnic, address, institutionType, salary } =
      req.body;
    if (
      !name ||
      !contact ||
      !email ||
      !cnic ||
      !address ||
      !institutionType ||
      !salary
    ) {
      return res
        .status(400)
        .json({ message: "All fields are required", success: false });
    }
    try {
      // Check if teacher already exists
      let teacher = await Teacher.findOne({ email, cnic, contact });
      if (teacher) {
        return res
          .status(400)
          .json({
            message: "Teacher already exists on this email, CNIC, or contact",
            success: false,
          });
      }
      // Create new teacher
      const password = cnic.slice(-6) + "@" + name.slice(0, 3);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      teacher = new Teacher({
        name,
        contact,
        email,
        cnic,
        password: hashedPassword,
        address,
        institutionType,
        salary,
      });
      await teacher.save();
      res
        .status(201)
        .json({ message: "Teacher created successfully", success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error", success: false });
    }
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    // Check if teacher exists
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res
        .status(400)
        .json({ message: "No teacher found on this email", success: false });
    }
    // Check password
    const isMatch = await bcrypt.compare(password, teacher.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Invalid credentials", success: false });
    }
    // Generate token
    const token = jwt.sign(
      {
        id: teacher._id,
        role: "teacher",
        institutionType: teacher.institutionType,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    res.json({ token, success: true, message: "Login successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/profile", authMiddleWare, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id).select("-password");
    if (!teacher) {
      return res
        .status(404)
        .json({ message: "Teacher not found", success: false });
    }
    res.json({ teacher, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/getAllTeachers", authMiddleWare, async (req, res) => {
  const { institutionType } = req.query;
  if (!institutionType) {
    return res
      .status(400)
      .json({ message: "Institution type is required", success: false });
  }
  try {
    const teachers = await Teacher.find({
      institutionType: institutionType,
    }).select("-password");
    if (teachers.length === 0) {
      return res
        .status(404)
        .json({
          message: "No teachers found for this institution type",
          success: false,
        });
    }
    res.json({ teachers, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});
router.delete("/deleteTeacher/:id", authMiddleWare, async (req, res) => {
  try {
    const teacher = await Teacher.findByIdAndDelete(req.params.id);
    if (!teacher) {
      return res
        .status(404)
        .json({ message: "Teacher not found", success: false });
    }
    res.json({ message: "Teacher deleted successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.put("/updateTeacher/:id", authMiddleWare, async (req, res) => {
  const { name, contact, email, cnic, address, institutionType, salary } =
    req.body;
  if (
    !name ||
    !contact ||
    !email ||
    !cnic ||
    !address ||
    !institutionType ||
    !salary
  ) {
    return res
      .status(400)
      .json({ message: "All fields are required", success: false });
  }
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res
        .status(404)
        .json({ message: "Teacher not found", success: false });
    }
    teacher.name = name;
    teacher.contact = contact;
    teacher.email = email;
    teacher.cnic = cnic;
    teacher.salary = salary;
    teacher.address = address;
    teacher.institutionType = institutionType;
    await teacher.save();
    res.json({ message: "Teacher updated successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

// Get total students for the logged-in teacher
router.get("/totalStudents", authMiddleWare, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      message: "Unauthorized, Only teachers can view their students",
      success: false,
    });
  }

  try {
    const teacherId = req.user.id;

    // Find all courses where this teacher is assigned
    const courses = await Course.find({
      "assignments.teacher": teacherId,
    });

    if (!courses || courses.length === 0) {
      return res.json({
        success: true,
        totalStudents: 0,
      });
    }

    const courseIds = courses.map((course) => course._id);

    // Find all registrations for these courses and get unique students
    const registrations = await Registration.find({
      "aboutCourse.course": { $in: courseIds },
    }).populate("student");

    // Get unique student IDs
    const uniqueStudentIds = [
      ...new Set(
        registrations.map((reg) => String(reg.student?._id || reg.student)),
      ),
    ];

    return res.json({
      success: true,
      totalStudents: uniqueStudentIds.length,
      courseCount: courses.length,
    });
  } catch (error) {
    console.error("Error fetching teacher students:", error);
    return res.status(500).json({
      message: "Error fetching students count",
      success: false,
      error,
    });
  }
});


router.post("/resetPassword", async (req, res) => {
  const {email, currentPassword, newPassword } = req.body;
  if (!email || !currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: "Email, current, and new password are required", success: false });
  }

  try {
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found", success: false });
    }

    const isMatch = await bcrypt.compare(currentPassword, teacher.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect", success: false });
    }
    if(newPassword.length < 6){
      return res.status(400).json({ message: "New password must be at least 6 characters long", success: false });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password cannot be the same as current password", success: false });
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ message: "New password must contain at least one uppercase letter, one lowercase letter, and one number", success: false });
    }
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);


    teacher.password = hashedNewPassword;
    teacher.isPasswordChanged = true;
    await teacher.save();

    res.status(200).json({ message: "Password reset successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
});
router.post("/setSecurityQuestion", async (req, res) => {
  const {email, securityQuestion, securityAnswer } = req.body;
  if (!email || !securityQuestion || !securityAnswer) {
    return res.status(400).json({
      message: "Email, security question, and answer are required",
      success: false,
    });
  }
  try {    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found", success: false });
    }
    const hashedAnswer = await bcrypt.hash(securityAnswer, 10);
    teacher.securityQuestion = securityQuestion;
    teacher.securityAnswer = hashedAnswer;
    teacher.isSecuritySet = true;
    await teacher.save();
    res.status(200).json({
      message: "Security question set successfully",
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
});

router.post("/verifySecurityAnswer", async (req, res) => {
  const { email, securityAnswer } = req.body;
  if (!email || !securityAnswer) {
    return res.status(400).json({
      message: "Email and security answer are required",
      success: false,
    });
  }
  try {    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found", success: false });
    }
    if (!teacher.isSecuritySet) {
      return res.status(400).json({
        message: "Security question not set for this account",
        success: false,
      });
    }
    const isMatch = await bcrypt.compare(securityAnswer, teacher.securityAnswer);
    if (!isMatch) {
      return res.status(400).json({ 
        message: "Security answer is incorrect",
        success: false,
       });
    }
    res.status(200).json({
      message: "Security answer verified successfully",
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }

});
router.post("/auth/verify-email-for-reset", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({
      message: "Email is required",
      success: false,
    });
  } 
  try {   const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found on this email", success: false });
    }
    res.status(200).json({
      message: "Email verified successfully",
      success: true,
      user: {
        _id: teacher._id,
        email: teacher.email,
        isSecuritySet: teacher.isSecuritySet,
        name: teacher.name,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
});



router.get("/migrate-teachers-fields", async (req, res) => {
  try {
    const result = await Teacher.updateMany(
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
          securityQuestion: "",
          securityAnswer: "",
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
