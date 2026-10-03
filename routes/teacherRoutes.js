const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const Class = require("../modals/Class");
const router = express.Router();

/* ------------------------------------------------------------------ */
/* Institution helper                                                  */
/* ------------------------------------------------------------------ */

// req.user.institution means "the institution this session is currently
// acting as" (chosen at login), not the teacher's full institutions list.
const requireInstitution = (req, res, next) => {
  if (!req.user || !req.user.institution) {
    return res.status(403).json({
      message: "Institution missing from your session. Please log in again.",
      success: false,
    });
  }
  next();
};

/* ------------------------------------------------------------------ */
/* Sign up / login / profile                                           */
/* ------------------------------------------------------------------ */

router.post("/signUp", authMiddleWare, requireInstitution, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const { name, contact, email, cnic, address, salary } = req.body;
  if (!name || !contact || !email || !cnic || !address || !salary) {
    return res
      .status(400)
      .json({ message: "All fields are required", success: false });
  }

  try {
    const currentInstitution = req.user.institution;

    // Same person is identified by CNIC across the whole system.
    let teacher = await Teacher.findOne({ cnic });

    if (teacher) {
      const alreadyHere = teacher.institutions.some(
        (id) => id.toString() === currentInstitution.toString(),
      );
      if (alreadyHere) {
        return res.status(400).json({
          message: "Teacher already exists at this institution",
          success: false,
        });
      }

      // Same person, joining a second institution. Email/contact should
      // match the existing record; if they don't, this might be a
      // different person who happens to share a CNIC typo, so we stop
      // and ask for it to be corrected explicitly rather than merging.
      if (teacher.email !== email || teacher.contact !== contact) {
        return res.status(400).json({
          message:
            "A teacher with this CNIC already exists with a different email or contact. Update their existing profile instead of creating a new one.",
          success: false,
        });
      }

      teacher.institutions.push(currentInstitution);
      teacher.salaryByInstitution.push({
        institution: currentInstitution,
        salary,
      });
      await teacher.save();

      return res.status(200).json({
        message: "Existing teacher added to this institution",
        success: true,
      });
    }

    // Brand new teacher.
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
      institutions: [currentInstitution],
      salaryByInstitution: [{ institution: currentInstitution, salary }],
    });
    await teacher.save();

    res
      .status(201)
      .json({ message: "Teacher created successfully", success: true });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "A teacher with this email or CNIC already exists",
        success: false,
      });
    }
    res.status(500).json({ message: "Server error", success: false });
  }
});



const INSTITUTION_TYPES = ["School", "College", "University", "Academy", "Other"];
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

router.post("/login", async (req, res) => {
  const { email, password, institution } = req.body; // "school" / "academy"

  if (!email || !password || !institution) {
    return res.status(400).json({
      message: "Email, password and institution are required",
      success: false,
    });
  }

  const rawInstitution = String(institution).trim();
  const isId = OBJECT_ID_REGEX.test(rawInstitution);

  // Normalise "school" / "SCHOOL" / "School" -> "School" (must match the schema enum)
  const institutionType = isId
    ? null
    : INSTITUTION_TYPES.find(
        (t) => t.toLowerCase() === rawInstitution.toLowerCase(),
      );

  if (!isId && !institutionType) {
    return res.status(400).json({
      message: `Invalid institution. Allowed: ${INSTITUTION_TYPES.join(", ")}`,
      success: false,
    });
  }

  try {
    // populate so we can read each institution's `type`
    const teacher = await Teacher.findOne({ email }).populate(
      "institutions",
      "name type",
    );
    if (!teacher) {
      return res
        .status(400)
        .json({ message: "No teacher found on this email", success: false });
    }

    // Check the password BEFORE revealing anything about institutions
    const isMatch = await bcrypt.compare(password, teacher.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Invalid credentials", success: false });
    }

    // filter(Boolean) guards against institutions that were deleted
    const matching = teacher.institutions.filter((inst) => {
      if (!inst) return false;
      return isId
        ? String(inst._id) === rawInstitution
        : inst.type === institutionType;
    });

    if (matching.length === 0) {
      return res.status(400).json({
        message: isId
          ? "This teacher is not registered at this institution"
          : `This teacher is not registered at any ${institutionType}`,
        success: false,
      });
    }

    // Teacher has 2+ institutions of the same type (e.g. two academies).
    // Frontend shows this list, then logs in again sending the picked id
    // in the same `institution` field.
    if (matching.length > 1) {
      return res.status(409).json({
        success: false,
        requiresInstitutionSelection: true,
        message: `You belong to multiple ${institutionType}s. Please select one.`,
        institutions: matching.map((i) => ({ id: i._id, name: i.name })),
      });
    }

    const selectedInstitution = matching[0];

    // "institution" in the token = the one chosen for THIS session.
    const token = jwt.sign(
      {
        id: teacher._id,
        role: "teacher",
        institution: selectedInstitution._id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({
      token,
      success: true,
      message: "Login successful",
      user: {
        id: teacher._id,
        role: "teacher",
        email: teacher.email,
        name: teacher.name, 
        institution: selectedInstitution._id, // still an id, same as before
        institutionName: selectedInstitution.name,
        institutionType: selectedInstitution.type,
        institution: selectedInstitution._id,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/profile", authMiddleWare, requireInstitution, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({
      _id: req.user.id,
      institutions: req.user.institution,
    }).select("-password");
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

/* ------------------------------------------------------------------ */
/* Teacher management                                                  */
/* ------------------------------------------------------------------ */

// Looks up a teacher GLOBALLY by CNIC (not scoped to this institution),
// so the admin form can autofill name/email/contact/address for a teacher
// who already exists at a different institution. Salary is intentionally
// left out of the response - it's always institution-specific.
router.get(
  "/lookupByCnic/:cnic",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied", success: false });
    }
    try {
      const { cnic } = req.params;
      if (!cnic) {
        return res
          .status(400)
          .json({ message: "CNIC is required", success: false });
      }

      const teacher = await Teacher.findOne({ cnic }).select(
        "name email contact address institutions",
      );

      if (!teacher) {
        return res.json({ success: true, found: false });
      }

      const alreadyAtThisInstitution = teacher.institutions.some(
        (id) => id.toString() === req.user.institution.toString(),
      );

      return res.json({
        success: true,
        found: true,
        alreadyAtThisInstitution,
        teacher: {
          name: teacher.name,
          email: teacher.email,
          contact: teacher.contact,
          address: teacher.address,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.get("/getAllTeachers", authMiddleWare, requireInstitution, async (req, res) => {
  try {
    const teachers = await Teacher.find({
      institutions: req.user.institution,
    }).select("-password");
    if (teachers.length === 0) {
      return res.status(404).json({
        message: "No teachers found for this institution",
        success: false,
      });
    }
    res.json({ teachers, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

// Removes the teacher from THIS institution only. Deletes the whole
// record only if this was their last remaining institution.
router.delete(
  "/deleteTeacher/:id",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    try {
      const teacher = await Teacher.findOne({
        _id: req.params.id,
        institutions: req.user.institution,
      });
      if (!teacher) {
        return res
          .status(404)
          .json({ message: "Teacher not found", success: false });
      }

      teacher.institutions = teacher.institutions.filter(
        (id) => id.toString() !== req.user.institution.toString(),
      );
      teacher.salaryByInstitution = teacher.salaryByInstitution.filter(
        (entry) =>
          entry.institution.toString() !== req.user.institution.toString(),
      );

      if (teacher.institutions.length === 0) {
        await Teacher.findByIdAndDelete(teacher._id);
        return res.json({
          message: "Teacher deleted successfully",
          success: true,
        });
      }

      await teacher.save();
      res.json({
        message: "Teacher removed from this institution",
        success: true,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.put(
  "/updateTeacher/:id",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    const { name, contact, email, cnic, address, salary } = req.body;
    if (!name || !contact || !email || !cnic || !address || !salary) {
      return res
        .status(400)
        .json({ message: "All fields are required", success: false });
    }
    try {
      const teacher = await Teacher.findOne({
        _id: req.params.id,
        institutions: req.user.institution,
      });
      if (!teacher) {
        return res
          .status(404)
          .json({ message: "Teacher not found", success: false });
      }

      // Identity fields are shared across every institution this teacher
      // belongs to - update once, visible everywhere immediately.
      teacher.name = name;
      teacher.contact = contact;
      teacher.email = email;
      teacher.cnic = cnic;
      teacher.address = address;

      // Salary is per-institution.
      const entry = teacher.salaryByInstitution.find(
        (s) => s.institution.toString() === req.user.institution.toString(),
      );
      if (entry) {
        entry.salary = salary;
      } else {
        teacher.salaryByInstitution.push({
          institution: req.user.institution,
          salary,
        });
      }

      await teacher.save();
      res.json({ message: "Teacher updated successfully", success: true });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          message: "Another teacher already uses this email or CNIC",
          success: false,
        });
      }
      res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.get("/totalStudents", authMiddleWare, requireInstitution, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      message: "Unauthorized, Only teachers can view their students",
      success: false,
    });
  }

  try {
    const teacherId = req.user.id;

    const courses = await Course.find({
      "assignments.teacher": teacherId,
      institution: req.user.institution,
    });

    if (!courses || courses.length === 0) {
      return res.json({
        success: true,
        totalStudents: 0,
      });
    }

    const courseIds = courses.map((course) => course._id);

    const registrations = await Registration.find({
      "aboutCourse.course": { $in: courseIds },
    }).populate("student");

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

/* ------------------------------------------------------------------ */
/* Password reset / security question                                  */
/* Public routes (no token). Email is unique per teacher globally, so    */
/* these unambiguously refer to a single teacher.                       */
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
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res
        .status(404)
        .json({ message: "Teacher not found", success: false });
    }

    const isMatch = await bcrypt.compare(currentPassword, teacher.password);
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

    teacher.password = hashedNewPassword;
    teacher.isPasswordChanged = true;
    await teacher.save();

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
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res
        .status(404)
        .json({ message: "Teacher not found", success: false });
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
  try {
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res
        .status(404)
        .json({ message: "Teacher not found", success: false });
    }
    if (!teacher.isSecuritySet) {
      return res.status(400).json({
        message: "Security question not set for this account",
        success: false,
      });
    }
    const isMatch = await bcrypt.compare(
      securityAnswer,
      teacher.securityAnswer,
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
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(404).json({
        message: "Teacher not found on this email",
        success: false,
      });
    }
    res.status(200).json({
      message: "Email verified successfully",
      success: true,
      user: {
        _id: teacher._id,
        email: teacher.email,
        isSecuritySet: teacher.isSecuritySet,
        securityQuestion: teacher.securityQuestion,
        name: teacher.name,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
});

// One-time migration route (no institution scope on purpose - remove after use)
router.post("/replaceAssignmentTargetClasses", async (req, res) => {
  try {
    const courses = await Course.collection.find({}).toArray();
    const classes = await Class.collection.find({}).toArray();

    const result = [];

    for (const course of courses) {
      if (!course.assignments || course.assignments.length === 0) continue;

      for (const assignment of course.assignments) {
        const newTargetClasses = [];

        for (const className of assignment.targetClasses || []) {
          const matchedClass = classes.find(
            (cls) =>
              cls.name.trim().toLowerCase() ===
              String(className).trim().toLowerCase(),
          );

          if (matchedClass) {
            newTargetClasses.push(matchedClass._id);
          }
        }

        assignment.targetClasses = newTargetClasses;
      }

      await Course.collection.updateOne(
        { _id: course._id },
        {
          $set: {
            assignments: course.assignments,
          },
        },
      );

      result.push({
        course: course.title,
        assignments: course.assignments,
      });
    }

    return res.json({
      success: true,
      updated: result.length,
      data: result,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;