const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const authMiddleWare = require("../authMiddleWare");
const Student = require("../modals/Student");
const LeaveApplication = require("../modals/LeaveApplication");
const router = express.Router();

router.post("/applyLeave", authMiddleWare, async (req, res) => {
    const {applicantRole,applicantId, name, email, reason, fromDate, toDate} = req.body;
    if (!applicantId || !name || !email || !reason || !fromDate || !toDate || !applicantRole) {
        return res.status(400).json({ message: "All fields are required" });
    }
    const finalApplicantRole = String(applicantRole).trim().toLowerCase() === "teacher" ? Teacher : Student;
    try {        const applicant = await finalApplicantRole.findById(applicantId);
        if (!applicant) {
            return res.status(404).json({ message: "Applicant not found" });
        }
        
        const newLeaveApplication = new LeaveApplication({
            applicant: finalApplicantRole === Teacher ? "Teacher" : "Student",
            name,
            email,
            reason,
            fromDate,
            toDate
        });
        await newLeaveApplication.save();
        res.json({ message: "Leave application submitted successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});

router.get("/viewAppliedLeaveApplications/:role/:email", authMiddleWare, async (req, res) => {
    const { role, email } = req.params;
    try {
        // Correct Chain: Find  -> Sort -> Then Await
        const leaveApplications = await LeaveApplication.find({ applicant: role === "teacher" ? "Teacher" : "Student", email })
            .sort({ appliedAt: -1 });

        res.json({ leaveApplications, success: true });
    } catch (error) {
        console.error("Leave Fetch Error:", error); // Log this to see details in terminal
        res.status(500).json({ message: "Server error", success: false });
    }
});
router.put("/leaveApplications/:id", authMiddleWare, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if(req.user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized, You cannot update leave applications" , success: false });
    }
        if (!["Pending", "Approved", "Rejected"].includes(status)) {    
            return res.status(400).json({ message: "Invalid status value" });
        }


    try {
        const leaveApplication = await LeaveApplication.findByIdAndUpdate(id, { status }, { new: true });
        if (!leaveApplication) {
            return res.status(404).json({ message: "Leave application not found" });
        }
        res.json({ message: "Leave application updated successfully", leaveApplication });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});

module.exports = router;