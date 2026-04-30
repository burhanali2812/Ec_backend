const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const authMiddleWare = require("../authMiddleWare");
const Student = require("../modals/Student");
const LeaveApplication = require("../modals/LeaveApplication");
const router = express.Router();

router.post("/applyLeave", authMiddleWare, async (req, res) => {
  const { applicantRole, applicantId, name, email, reason, fromDate, toDate } =
    req.body;
  if (
    !applicantId ||
    !name ||
    !email ||
    !reason ||
    !fromDate ||
    !toDate ||
    !applicantRole
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const finalApplicantRole =
    String(applicantRole).trim().toLowerCase() === "teacher"
      ? Teacher
      : Student;
  try {
    const applicant = await finalApplicantRole.findById(applicantId);
    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    const newLeaveApplication = new LeaveApplication({
      applicant: finalApplicantRole === Teacher ? "Teacher" : "Student",
      name,
      email,
      reason,
      fromDate,
      toDate,
    });
    await newLeaveApplication.save();
    res.json({
      message: "Leave application submitted successfully",
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get(
  "/viewAppliedLeaveApplications/:role/:email",
  authMiddleWare,
  async (req, res) => {
    const { role, email } = req.params;
    try {
      // Correct Chain: Find  -> Sort -> Then Await
      const leaveApplications = await LeaveApplication.find({
        applicant: role === "teacher" ? "Teacher" : "Student",
        email,
      }).sort({ appliedAt: -1 });

      res.json({ leaveApplications, success: true });
    } catch (error) {
      console.error("Leave Fetch Error:", error); // Log this to see details in terminal
      res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.get("/allLeaveApplications", authMiddleWare, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Unauthorized, You cannot view all leave applications",
      success: false,
    });
  }
  try {
    const leaveApplications = await LeaveApplication.find().sort({
      appliedAt: -1,
    });
    res.json({ leaveApplications, success: true });
  } catch (error) {
    console.error("Leave Fetch Error:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});
router.get("/lengthOfPendingLeaves", authMiddleWare, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Unauthorized, You cannot view pending leave statistics",
      success: false,
    });
  }
  try {
    const pendingLeaves = await LeaveApplication.countDocuments({
      status: "Pending",
    });
    res.json({ pendingLeaves, success: true });
  } catch (error) {
    console.error("Error fetching pending leaves:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.put("/leaveApplications/:id", authMiddleWare, async (req, res) => {
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
    const leaveApplication = await LeaveApplication.findByIdAndUpdate(
      id,
      updateData,
      { new: true },
    );
    if (!leaveApplication) {
      return res.status(404).json({ message: "Leave application not found" });
    }
    res.json({
      message: "Leave application updated successfully",
      leaveApplication,
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

// Get leaves for the logged-in teacher
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

module.exports = router;
