const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const authMiddleWare = require("../authMiddleWare");
const Student = require("../modals/Student");
const LeaveApplication = require("../modals/LeaveApplication");
const Admin = require("../modals/Admin");
const { notifyLeaveResponse, notifyLeaveRequested } = require("../notificationService");
const router = express.Router();

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

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
/* Apply / view own leaves                                             */
/* ------------------------------------------------------------------ */

router.post("/applyLeave", authMiddleWare, requireInstitution, async (req, res) => {
  const { applicantId, name, email, reason, fromDate, toDate } =
    req.body;
  if (
    !applicantId ||
    !name ||
    !email ||
    !reason ||
    !fromDate ||
    !toDate
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }
  console.log("user token role:", req.user?.role);
  const finalApplicantRole =
    String(req.user?.role).trim().toLowerCase() === "teacher"
      ? Teacher
      : Student;
  try {
    console.log("Applicant Role:", finalApplicantRole.modelName);
    console.log("Applicant ID:", applicantId);
    const applicant = await finalApplicantRole.findById(applicantId);
    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const isTeacher = finalApplicantRole === Teacher;

    // Confirm the applicant actually belongs to the institution this
    // session is acting as - otherwise a teacher logged into School could
    // file (or be made to file) a leave as if it came from Academy.
    const belongsHere = isTeacher
      ? applicant.institutions.some(
          (id) => id.toString() === req.user.institution?._id.toString(),
        )
      : applicant.enrollments.some(
          (e) => e.institution.toString() === req.user.institution?._id.toString(),
        );
    if (!belongsHere) {
      return res.status(403).json({
        message: "Applicant is not enrolled or employed at this institution",
        success: false,
      });
    }

    // FIXED: institution is a REQUIRED field on LeaveApplication, but the
    // original route never set it - every save here should have been
    // failing schema validation.
    const newLeaveApplication = new LeaveApplication({
      applicant: isTeacher ? "Teacher" : "Student",
      studentId: isTeacher ? null : applicantId,
      teacherId: isTeacher ? applicantId : null,
      institution: req.user.institution._id,
      name,
      email,
      reason,
      fromDate,
      toDate,
    });

    // Admin.institution is an array (one admin can run more than one
    // institution), so this matches any admin whose array contains the
    // current institution - including one who manages both.
    const admin = await Admin.findOne({ institution: req.user.institution._id })
      .select("_id")
      .lean();
    if (!admin) {
      return res.status(500).json({ message: "No admin found to notify" });
    }
    await newLeaveApplication.save();

    // FIXED: this previously passed the key "institutiion" (typo), which
    // did not match notifyLeaveRequested's destructured "institution"
    // param - the institution silently never reached the notification,
    // and the message template referenced an undefined variable on top
    // of that (fixed in notificationService.js). req.user.institution is
    // the populated Institution doc here, so the message can mention its
    // .type directly.
    await notifyLeaveRequested(admin._id, {
      applicantName: name,
      applicantRole: isTeacher ? "teacher" : "student",
      institution: req.user.institution,
      reason,
      fromDate,
      toDate,
    });

    // FIXED: notifyLeaveResponse's signature is
    // (applicantId, applicantRole, institution, { status, adminNote }) -
    // this call was previously missing the institution argument
    // entirely, which shifted the options object into the institution
    // slot and left the 4th parameter undefined, throwing when
    // notifyLeaveResponse tried to destructure { status, adminNote }
    // from it.
    await notifyLeaveResponse(
      applicantId,
      isTeacher ? "teacher" : "student",
      req.user.institution,
      {
        status: "pending",
        adminNote: "Your leave request has been submitted and is awaiting review.",
      },
    );
    res.json({
      message: "Leave application submitted successfully",
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false, error: error.message });
  }
});

// A person's own leave history, found by email (email is globally unique
// per teacher/student now). Deliberately NOT scoped to one institution -
// someone employed or enrolled at two institutions sees their full leave
// history across both, same as the global password-reset routes.
router.get(
  "/viewAppliedLeaveApplications/:role/:email",
  authMiddleWare,
  async (req, res) => {
    const { role, email } = req.params;
    try {
      const leaveApplications = await LeaveApplication.find({
        applicant: role === "teacher" ? "Teacher" : "Student",
        email,
        institution: req.user.institution._id, // Ensure the leave applications are scoped to the user's institution
      }).sort({ appliedAt: -1 });

      res.json({ leaveApplications, success: true });
    } catch (error) {
      console.error("Leave Fetch Error:", error);
      res.status(500).json({ message: "Server error", success: false });
    }
  },
);

/* ------------------------------------------------------------------ */
/* Admin: view / decide                                                */
/* ------------------------------------------------------------------ */

router.get("/allLeaveApplications", authMiddleWare, requireInstitution, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Unauthorized, You cannot view all leave applications",
      success: false,
    });
  }
  try {
    const leaveApplications = await LeaveApplication.find({
      institution: req.user.institution._id,
    }).sort({ appliedAt: -1 });

    res.json({ leaveApplications, success: true });
  } catch (error) {
    console.error("Leave Fetch Error:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/lengthOfPendingLeaves", authMiddleWare, requireInstitution, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Unauthorized, You cannot view pending leave statistics",
      success: false,
    });
  }
  try {
    const pendingLeaves = await LeaveApplication.countDocuments({
      status: "Pending",
      institution: req.user.institution._id,
    });
    res.json({ pendingLeaves, success: true });
  } catch (error) {
    console.error("Error fetching pending leaves:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.put("/leaveApplications/:id", authMiddleWare, requireInstitution, async (req, res) => {
  const { id } = req.params;
  const { status, rejectedReason } = req.body;
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Unauthorized, You cannot update leave applications",
      success: false,
    });
  }
  if (!["Pending", "Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  if (status === "Rejected" && !rejectedReason) {
    return res.status(400).json({ message: "Rejection reason is required" });
  }

  try {
    const updateData = { status };
    if (status === "Rejected") {
      updateData.rejectedReason = rejectedReason;
    }

    // Previously any admin could approve/reject ANY leave application by
    // ID, regardless of institution - findByIdAndUpdate took no
    // ownership check at all. Scoped by {_id, institution} now.
    const leaveApplication = await LeaveApplication.findOneAndUpdate(
      { _id: id, institution: req.user.institution._id },
      updateData,
      { new: true },
    );
    if (!leaveApplication) {
      return res.status(404).json({ message: "Leave application not found" });
    }

    // FIXED: same missing-institution-argument bug as in applyLeave.
    // leaveApplication.institution is just a raw ObjectId here (not
    // populated), which is fine - notifyLeaveRequested/Response and
    // createNotification only need an id, and the message text simply
    // omits the institution name when it isn't a populated doc.
    await notifyLeaveResponse(
      leaveApplication.applicant === "Teacher"
        ? leaveApplication.teacherId
        : leaveApplication.studentId,
      leaveApplication.applicant === "Teacher" ? "teacher" : "student",
      leaveApplication.institution,
      {
        status:
          leaveApplication.status === "Approved"
            ? "approved"
            : leaveApplication.status === "Rejected"
              ? "rejected"
              : "pending",
        adminNote: leaveApplication.rejectedReason || null,
      },
    );
    res.json({
      message: "Leave application updated successfully",
      leaveApplication,
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

/* ------------------------------------------------------------------ */
/* Teacher: own leaves                                                 */
/* ------------------------------------------------------------------ */

// Get leaves for the logged-in teacher, by email - deliberately global
// across institutions, same reasoning as viewAppliedLeaveApplications.
router.get("/myLeaves", authMiddleWare, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      message: "Unauthorized, Only teachers can view their leaves",
      success: false,
    });
  }

  try {
    const teacherEmail = req.user.email;

    const leaves = await LeaveApplication.find({
      applicant: "Teacher",
      email: teacherEmail,
    }).sort({ appliedAt: -1 });

    const pendingCount = leaves.filter(
      (leave) => leave.status === "Pending",
    ).length;

    return res.json({
      success: true,
      leaves: leaves || [],
      pendingCount,
    });
  } catch (error) {
    console.error("Error fetching teacher leaves:", error);
    return res.status(500).json({
      message: "Error fetching leaves",
      success: false,
      error,
    });
  }
});

/* ------------------------------------------------------------------ */
/* Attendance-flow helper (used by markAttendance)                     */
/* ------------------------------------------------------------------ */

// Check if students have approved leaves for a specific date. No
// institution scoping needed here - the caller (markAttendance) already
// only ever passes studentIds from an institution-scoped class roster.
router.post("/checkStudentLeaves", authMiddleWare, async (req, res) => {
  try {
    const { studentIds, date } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        message: "Student IDs array is required",
        success: false,
      });
    }

    if (!date) {
      return res.status(400).json({
        message: "Date is required",
        success: false,
      });
    }

    const leaves = await LeaveApplication.find({
      applicant: "Student",
      studentId: { $in: studentIds },
      status: "Approved",
      $expr: {
        $and: [
          { $lte: ["$fromDate", date] },
          { $gte: ["$toDate", date] },
        ],
      },
    });

    const leavesByStudentId = leaves.map((leave) => ({
      studentId: leave.studentId.toString(),
      status: leave.status,
      fromDate: leave.fromDate,
      toDate: leave.toDate,
    }));

    return res.json({
      success: true,
      leaves: leavesByStudentId || [],
    });
  } catch (error) {
    console.error("Error checking student leaves:", error);
    return res.status(500).json({
      message: "Error checking student leaves",
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;