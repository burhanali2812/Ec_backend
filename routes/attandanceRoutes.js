const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const Registration = require("../modals/Registration");
const Attendance = require("../modals/Attandance");
const Student = require("../modals/Student");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/markAttandance",authMiddleWare, async (req, res) => {
    try {
        const { courseId, classInfo, date, teacherId, studentStatuses } = req.body;

        if (!courseId || !classInfo || !date || !teacherId || !studentStatuses) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const attendanceDate = new Date(date);
        const result = [];

        // Find all registrations where student has this course
        const registrations = await Registration.find({
            classInfo,
            "aboutCourse.course": courseId
        });

        for (const s of studentStatuses) {
            const student = await Student.findOne({ rollNumber: s.rollNumber });
            if (!student) continue;

            // Find the registration of this student
            const registration = registrations.find(r =>
                r.student.toString() === student._id.toString()
            );
            if (!registration) continue;

            // Upsert attendance
            const attendance = await Attendance.findOneAndUpdate(
                { registration: registration._id, course: courseId, date: attendanceDate },
                {
                    status: s.status,
                    markedBy: teacherId,
                    verificationStatus: "pending"
                },
                { upsert: true, new: true }
            );

            result.push(attendance);
        }

        res.status(200).json({
            message: "Attendance marked successfully (pending verification)",
            data: result
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;




module.exports = router;