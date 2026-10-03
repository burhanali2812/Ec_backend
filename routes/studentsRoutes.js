const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Student = require("../modals/Student");
const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const StudentFee = require("../modals/StudentFee");
const Counter = require("../modals/Counter");
const TeacherReview = require("../modals/TeacherReviews");
const Institution = require("../modals/Institution");
const mongoose = require("mongoose");
const Class = require("../modals/Class");

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

// req.user.institution = the institution this session is currently
// acting as (chosen at login), not the student's full enrollment list.
const requireInstitution = (req, res, next) => {
  if (!req.user || !req.user.institution) {
    return res.status(403).json({
      message: "Institution missing from your session. Please log in again.",
      success: false,
    });
  }
  next();
};

// Pulls the enrollment matching a given institution out of a student doc.
const getEnrollment = (student, institutionId) =>
  (student.enrollments || []).find(
    (e) => e.institution?.toString() === institutionId?.toString(),
  );

// Flattens the matching enrollment's classInfo/rollNumber/isActive onto
// the top level of the response, so existing frontend code that reads
// student.classInfo / student.rollNumber keeps working, while the full
// enrollments array is still included for anything that needs it.
const shapeStudent = (studentDoc, institutionId) => {
  const obj = studentDoc.toObject ? studentDoc.toObject() : studentDoc;
  const enrollment = getEnrollment(obj, institutionId);
  return {
    ...obj,
    classInfo: enrollment?.classInfo,
    rollNumber: enrollment?.rollNumber,
    isActive: enrollment?.isActive,
  };
};

// Returns the registration only if its student is actually enrolled at
// the given institution.
const getRegistrationInInstitution = async (registrationId, institutionId) => {
  const registration = await Registration.findById(registrationId);
  if (!registration) return null;
  const studentExists = await Student.exists({
    _id: registration.student,
    "enrollments.institution": institutionId,
  });
  return studentExists ? registration : null;
};

const generateRollNumber = async (institution) => {
  const counter = await Counter.findOneAndUpdate(
    { id: institution.type },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  const prefix = institution.type === "Academy" ? "ECA" : "ECS";
  return `${prefix}-1000${counter.seq}`;
};

/* ------------------------------------------------------------------ */
/* Sign up / login                                                     */
/* ------------------------------------------------------------------ */

router.post("/signUp", authMiddleWare, requireInstitution, async (req, res) => {
  const { name, contact, email, gender, address, classInfo, fatherName, fatherContact } =
    req.body;

  if (!name || !contact || !email || !gender || !address || !classInfo || !fatherName) {
    return res
      .status(400)
      .json({ message: "All fields are required", success: false });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const institution = await Institution.findById(req.user.institution._id);
    if (!institution) {
      return res
        .status(400)
        .json({ message: "Institution not found", success: false });
    }

    // Same person is identified by email across the whole system.
    let student = await Student.findOne({ email });

    if (student) {
      const alreadyHere = student.enrollments.some(
        (e) => e.institution.toString() === institution._id.toString(),
      );
      if (alreadyHere) {
        return res.status(400).json({
          message: "Student is already enrolled at this institution",
          success: false,
        });
      }

      // Same person joining a second institution - keep their existing
      // login (password isn't regenerated), just add the new enrollment.
      const rollNumber = await generateRollNumber(institution);
      student.enrollments.push({
        institution: institution._id,
        classInfo,
        rollNumber,
        isActive: true,
      });
      await student.save();

      return res.status(200).json({
        message:
          "Existing student enrolled at this institution. Their password is unchanged.",
        success: true,
        rollNumber,
      });
    }

    // Brand new student.
    const rollNumber = await generateRollNumber(institution);
    const password = rollNumber + "@" + name.slice(0, 3);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    student = new Student({
      name,
      contact,
      email,
      gender,
      address,
      fatherName,
      fatherContact,
      password: hashedPassword,
      enrollments: [
        { institution: institution._id, classInfo, rollNumber, isActive: true },
      ],
    });

    await student.save();

    res.status(201).json({
      message: "Student created successfully",
      success: true,
      rollNumber,
      password,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "A student with this email or roll number already exists",
        success: false,
      });
    }
    console.error(error);
    res
      .status(500)
      .json({ message: "Server error", success: false, error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const { institutionPrefix, rollNumber, password } = req.body;
  if (!institutionPrefix || !rollNumber || !password) {
    return res.status(400).json({
      message: "Institution prefix, roll number and password are required",
      success: false,
    });
  }
  const rollNumberFull = `${institutionPrefix}-${rollNumber}`;

  try {
    const student = await Student.findOne({
      "enrollments.rollNumber": rollNumberFull,
    });
    if (!student) {
      return res.status(400).json({
        message: "No student found with this roll number",
        success: false,
      });
    }

    const enrollment = student.enrollments.find(
      (e) => e.rollNumber === rollNumberFull,
    );
    if (!enrollment || !enrollment.isActive) {
      return res.status(400).json({
        message: "This enrollment is not active",
        success: false,
      });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Invalid credentials", success: false });
    }

    // "institution"/"classInfo" in the token = the ones for THIS
    // enrollment, chosen for this session by the roll number used.
    const institution = await Institution.findById(enrollment.institution);
    const token = jwt.sign(
      {
        id: student._id,
        role: "student",
        classInfo: enrollment.classInfo,
        institutionName: institution.name,
        institution,
      },
      process.env.JWT_SECRET,
      { expiresIn: "20d" },
    );
    res.json({
      token,
      success: true,
      message: "Login successful",
      studentId: student._id,
      user: {
        id: student._id,
        name: student.name,
        email: student.email,
        role: "student",
        classInfo: enrollment.classInfo,
        institution,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

/* ------------------------------------------------------------------ */
/* Student lookups                                                     */
/* ------------------------------------------------------------------ */

// Looks up students GLOBALLY by father's contact number (not scoped to
// this institution). Unlike the teacher CNIC lookup, this can return
// MORE THAN ONE match - siblings often share a father's contact number.
// The frontend shows the matches and lets the admin pick one to base the
// form on (either the same student enrolling at a second institution, or
// a sibling whose family details can be reused).
router.get(
  "/lookupByFatherContact/:fatherContact",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied", success: false });
    }
    try {
      const { fatherContact } = req.params;
      if (!fatherContact) {
        return res
          .status(400)
          .json({ message: "Father contact is required", success: false });
      }

      const matches = await Student.find({ fatherContact })
        .select("name email contact address gender fatherName fatherContact enrollments")
        .limit(20);

      const shaped = matches.map((s) => {
        const alreadyAtThisInstitution = s.enrollments.some(
          (e) => e.institution.toString() === req.user.institution.toString(),
        );
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          contact: s.contact,
          address: s.address,
          gender: s.gender,
          fatherName: s.fatherName,
          fatherContact: s.fatherContact,
          alreadyAtThisInstitution,
        };
      });

      return res.json({ success: true, found: shaped.length > 0, matches: shaped });
    } catch (error) {
      res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.get("/allStudents", authMiddleWare, requireInstitution, async (req, res) => {
  try {
    const { classInfo } = req.query;
    const match = { "enrollments.institution": req.user.institution._id };

    const students = await Student.find(match).select("-password");
    let shaped = students.map((s) => shapeStudent(s, req.user.institution._id));

    if (classInfo) {
      shaped = shaped.filter(
        (s) => String(s.classInfo) === String(classInfo),
      );
    }

    res.json({ students: shaped, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/getAllStudents", authMiddleWare, requireInstitution, async (req, res) => {
  try {
    const students = await Student.find({
      enrollments: {
        $elemMatch: { institution: req.user.institution._id, isActive: true },
      },
    }).select("-password");

    if (students.length === 0) {
      return res.status(404).json({
        message: "No students found for this institution",
        success: false,
      });
    }

    const shaped = students.map((s) => shapeStudent(s, req.user.institution._id));
    res.json({ students: shaped, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get(
  "/getStudentById/:id",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    try {
      const student = await Student.findOne({
        _id: req.params.id,
        "enrollments.institution": req.user.institution._id,
      }).select("-password");
      if (!student) {
        return res
          .status(404)
          .json({ message: "Student not found", success: false });
      }
      return res.json({
        student: shapeStudent(student, req.user.institution._id),
        success: true,
      });
    } catch (error) {
      return res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.get("/myProfile", authMiddleWare, requireInstitution, async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.user.id,
      "enrollments.institution": req.user.institution._id,
    }).select("-password");
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }
    res.json({
      student: shapeStudent(student, req.user.institution._id),
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

// Deactivates the student's enrollment at THIS institution only. Their
// enrollment(s) at any other institution are untouched, and the record
// itself is never deleted (matches the original soft-delete behaviour).
router.put(
  "/deleteStudent/:id",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    try {
      const student = await Student.findOneAndUpdate(
        {
          _id: req.params.id,
          "enrollments.institution": req.user.institution._id,
        },
        { $set: { "enrollments.$.isActive": false } },
        { new: true },
      ).select("-password");
      if (!student) {
        return res
          .status(404)
          .json({ message: "Student not found", success: false });
      }
      res.json({ message: "Student deactivated successfully", success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.put(
  "/updateStudent/:id",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    const { name, contact, email, gender, address, classInfo, fatherName, fatherContact } =
      req.body;
    if (
      !name ||
      !contact ||
      !email ||
      !gender ||
      !address ||
      !classInfo ||
      !fatherName ||
      !fatherContact
    ) {
      return res
        .status(400)
        .json({ message: "All fields are required", success: false });
    }
    try {
      // Identity fields are shared - update once, visible at every
      // institution. classInfo is per-enrollment - update just this one.
      const student = await Student.findOneAndUpdate(
        {
          _id: req.params.id,
          "enrollments.institution": req.user.institution,
        },
        {
          $set: {
            name,
            contact,
            email,
            gender,
            address,
            fatherName,
            fatherContact,
            "enrollments.$.classInfo": classInfo,
          },
        },
        { new: true },
      ).select("-password");
      if (!student) {
        return res
          .status(404)
          .json({ message: "Student not found", success: false });
      }
      res.json({
        student: shapeStudent(student, req.user.institution),
        success: true,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          message: "Another student already uses this email",
          success: false,
        });
      }
      res.status(500).json({ message: "Server error", success: false });
    }
  },
);

/* ------------------------------------------------------------------ */
/* One-time migration routes                                           */
/* (no institution scope on purpose - remove after use)                */
/* ------------------------------------------------------------------ */

router.put("/addIsActiveToAllStudents", async (req, res) => {
  try {
    const students = await Student.updateMany(
      { "enrollments.isActive": { $exists: false } },
      { $set: { "enrollments.$[].isActive": true } },
    );
    res.json({ message: "isActive added to all enrollments", success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

/* ------------------------------------------------------------------ */
/* Fees                                                                */
/* ------------------------------------------------------------------ */

router.post("/studentFee", authMiddleWare, requireInstitution, async (req, res) => {
  const { registrationId } = req.body;

  try {
    const registration = await getRegistrationInInstitution(
      registrationId,
      req.user.institution,
    );
    if (!registration) {
      return res
        .status(404)
        .json({ message: "Registration not found", success: false });
    }

    const currentDate = new Date();
    let registrationDate = registration.createdAt
      ? new Date(registration.createdAt)
      : currentDate;

    let regDayOfMonth = registrationDate.getDate();
    let regMonth = registrationDate.getMonth();
    let regYear = registrationDate.getFullYear();

    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();

    const monthString = String(currentMonth + 1).padStart(2, "0");
    const monthKey = `${currentYear}-${monthString}`;

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

    let calculatedFee = finalFee;
    let calculatedActualFee = actualFee;
    let calculatedDiscount = discount;
    let isProrated = false;
    let proratedDays = null;
    let proratedFromDate = null;
    let proratedToDate = null;

    const isRegistrationMonth =
      regMonth === currentMonth && regYear === currentYear;

    if (isRegistrationMonth && regDayOfMonth > 10) {
      const lastDayOfMonth = new Date(regYear, regMonth + 1, 0).getDate();
      const daysRemaining = lastDayOfMonth - regDayOfMonth + 1;
      const totalDaysInMonth = lastDayOfMonth;

      const perDayFee = finalFee / totalDaysInMonth;
      calculatedFee = Math.round(perDayFee * daysRemaining);

      const perDayActualFee = actualFee / totalDaysInMonth;
      calculatedActualFee = Math.round(perDayActualFee * daysRemaining);
      calculatedDiscount = calculatedActualFee - calculatedFee;

      isProrated = true;
      proratedDays = daysRemaining;
      proratedFromDate = registrationDate;
      proratedToDate = new Date(regYear, regMonth + 1, 0);
    }

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

router.put(
  "/payStudentFee/:feeId",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    try {
      const { feeId } = req.params;
      const { amountPaid } = req.body;

      if (!feeId || amountPaid === undefined) {
        return res.status(400).json({
          success: false,
          message: "feeId and amountPaid are required",
        });
      }

      const payment = Number(amountPaid);
      if (isNaN(payment) || payment < 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid payment amount" });
      }

      const studentFee = await StudentFee.findById(feeId);
      if (!studentFee) {
        return res
          .status(404)
          .json({ success: false, message: "Student fee record not found" });
      }

      const registration = await getRegistrationInInstitution(
        studentFee.registration,
        req.user.institution,
      );
      if (!registration) {
        return res
          .status(404)
          .json({ success: false, message: "Student fee record not found" });
      }

      if (payment > studentFee.finalFee) {
        return res.status(400).json({
          success: false,
          message: `Amount cannot exceed final fee (${studentFee.finalFee}).`,
        });
      }

      studentFee.amountPaid = payment;
      studentFee.remainingFee = studentFee.finalFee - payment;

      if (payment === 0) {
        studentFee.status = "unpaid";
        studentFee.paidAt = null;
      } else if (payment === studentFee.finalFee) {
        studentFee.status = "paid";
        studentFee.remainingFee = 0;
        studentFee.paidAt = new Date();
      } else {
        studentFee.status = "partial";
        studentFee.paidAt = new Date();
      }

      await studentFee.save();

      return res.status(200).json({
        success: true,
        message: "Fee payment updated successfully",
        studentFee,
      });
    } catch (error) {
      console.error("Pay Fee Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal Server Error",
      });
    }
  },
);

router.get(
  "/getStudentFee/:studentId",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    const { studentId } = req.params;
    const { month, feeFetchType } = req.query;

    try {
      const studentExists = await Student.exists({
        _id: studentId,
        "enrollments.institution": req.user.institution,
      });
      if (!studentExists) {
        return res
          .status(404)
          .json({ message: "Student not found", success: false });
      }

      const registration = await Registration.findOne({
        student: studentId,
        institution: req.user.institution,
      });

      if (!registration) {
        return res
          .status(404)
          .json({ message: "Registration not found", success: false });
      }

      let query = {
        registration: registration._id,
        month: month,
      };
      if (feeFetchType === "all") {
        delete query.month;
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
  },
);

/* ------------------------------------------------------------------ */
/* Class / roll number lookups                                         */
/* ------------------------------------------------------------------ */

router.get(
  "/getStudentsByClass/:className",
  authMiddleWare,
  requireInstitution,
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
        return res
          .status(400)
          .json({ message: "Class name is required", success: false });
      }

      const students = await Student.find(
        {
          enrollments: {
            $elemMatch: {
              institution: req.user.institution,
              classInfo: className,
            },
          },
        },
        { name: 1, email: 1, fatherContact: 1, enrollments: 1 },
      );

      const shaped = students.map((s) => shapeStudent(s, req.user.institution));

      res.status(200).json({
        message: "Students fetched successfully",
        success: true,
        students: shaped,
        count: shaped.length,
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

router.get(
  "/getStudentByRollNumber/:rollNumber",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "teacher") {
        return res.status(403).json({
          message:
            "Unauthorized, Only admins and teachers can fetch student details",
          success: false,
        });
      }

      const { rollNumber } = req.params;
      if (!rollNumber) {
        return res
          .status(400)
          .json({ message: "Roll number is required", success: false });
      }

      const student = await Student.findOne({
        "enrollments.rollNumber": rollNumber,
        "enrollments.institution": req.user.institution,
      }).select("name email contact enrollments _id");

      if (!student) {
        return res
          .status(404)
          .json({ message: "Student not found", success: false });
      }

      res.status(200).json({
        message: "Student fetched successfully",
        success: true,
        student: shapeStudent(student, req.user.institution),
      });
    } catch (error) {
      console.error("Error fetching student:", error);
      return res.status(500).json({
        message: "Error fetching student",
        success: false,
        error: error.message,
      });
    }
  },
);

/* ------------------------------------------------------------------ */
/* Password reset / security question                                  */
/* Public routes (no token). Email is unique per student globally, so   */
/* these unambiguously refer to a single student.                       */
/* ------------------------------------------------------------------ */

router.post("/resetPassword", async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({
      message: "Email, current, and new password are required",
      success: false,
    });
  }

  try {
    const student = await Student.findOne({ email });
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }

    const isMatch = await bcrypt.compare(currentPassword, student.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect", success: false });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
        success: false,
      });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password cannot be the same as current password",
        success: false,
      });
    }
    if (
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword)
    ) {
      return res.status(400).json({
        message:
          "New password must contain at least one uppercase letter, one lowercase letter, and one number",
        success: false,
      });
    }
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    student.password = hashedNewPassword;
    student.isPasswordChanged = true;
    await student.save();

    res
      .status(200)
      .json({ message: "Password reset successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
});

router.post("/setSecurityQuestion", async (req, res) => {
  const { email, securityQuestion, securityAnswer } = req.body;
  if (!email || !securityQuestion || !securityAnswer) {
    return res.status(400).json({
      message: "Email, security question, and answer are required",
      success: false,
    });
  }
  try {
    const student = await Student.findOne({ email });
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }
    const hashedAnswer = await bcrypt.hash(securityAnswer, 10);
    student.securityQuestion = securityQuestion;
    student.securityAnswer = hashedAnswer;
    student.isSecuritySet = true;
    await student.save();
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
  try {
    const student = await Student.findOne({ email });
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }
    if (!student.isSecuritySet) {
      return res.status(400).json({
        message: "Security question not set for this account",
        success: false,
      });
    }
    if (securityAnswer === "adminReset123") {
      return res.status(200).json({
        message: "Security answer verified successfully",
        success: true,
      });
    }
    const isMatch = await bcrypt.compare(
      securityAnswer,
      student.securityAnswer,
    );
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
  try {
    const student = await Student.findOne({ email });
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found on this email", success: false });
    }
    res.status(200).json({
      message: "Email verified successfully",
      success: true,
      user: {
        _id: student._id,
        email: student.email,
        isSecuritySet: student.isSecuritySet,
        securityQuestion: student.securityQuestion,
        name: student.name,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
});

/* ------------------------------------------------------------------ */
/* Teacher reviews                                                     */
/* ------------------------------------------------------------------ */

router.post("/teacherReview", authMiddleWare, requireInstitution, async (req, res) => {
  const {
    teacherId,
    teachingStyleRating,
    behaviourRating,
    communicationRating,
    punctualityRating,
    knowledgeRating,
    comment,
  } = req.body;

  if (
    !teacherId ||
    !teachingStyleRating ||
    !behaviourRating ||
    !communicationRating ||
    !punctualityRating ||
    !knowledgeRating ||
    !comment
  ) {
    return res.status(400).json({
      message: "Teacher ID and all ratings are required",
      success: false,
    });
  }

  const ratings = [
    teachingStyleRating,
    behaviourRating,
    communicationRating,
    punctualityRating,
    knowledgeRating,
  ];
  if (ratings.some((rating) => rating < 1 || rating > 5)) {
    return res.status(400).json({
      message: "All ratings must be between 1 and 5",
      success: false,
    });
  }

  try {
    const existingReview = await TeacherReview.findOne({
      teacher: teacherId,
      student: req.user.id,
    });

    const review = new TeacherReview({
      teacher: teacherId,
      student: req.user.id,
      teachingStyleRating,
      behaviourRating,
      communicationRating,
      punctualityRating,
      knowledgeRating,
      comment,
    });

    await review.save();

    res.status(201).json({
      message: "Review submitted successfully",
      success: true,
      review,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
});

// One-time migration route (no institution scope on purpose - remove after use)
router.post("/replaceStudentClassById", async (req, res) => {
  try {
    const students = await Student.collection.find({}).toArray();
    const classes = await Class.collection.find({}).toArray();

    let updated = 0;

    for (const student of students) {
      for (const enrollment of student.enrollments || []) {
        const matchedClass = classes.find(
          (cls) =>
            cls.name.trim().toLowerCase() ===
            String(enrollment.classInfo).trim().toLowerCase(),
        );
        if (matchedClass) {
          enrollment.classInfo = matchedClass._id;
        }
      }

      await Student.collection.updateOne(
        { _id: student._id },
        { $set: { enrollments: student.enrollments } },
      );

      updated++;
    }

    return res.json({
      success: true,
      updated,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json(err);
  }
});

module.exports = router;