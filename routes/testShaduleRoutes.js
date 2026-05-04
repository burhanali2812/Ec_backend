const express = require("express");
const router = express.Router();
const Course = require("../modals/Course");
const TestScheduleAndSyllabus = require("../modals/TestShaduleandSyllabus");
const authMiddleWare = require("../authMiddleWare");

router.post("/addTestScheduleByAdmin", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { courseId, testDay , classInfo } = req.body;
    if (!courseId || !testDay || !classInfo) {
        return res.status(400).json({ message: "Course ID, test day, and class info are required" });
    }
    try {        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }
        const existingSchedule = await TestScheduleAndSyllabus.findOne({ course: courseId });
        if (existingSchedule) {
            return res.status(400).json({ message: "Test schedule already exists for this course" });
        }
        const newSchedule = new TestScheduleAndSyllabus({ course: courseId, testDay, classInfo });
        await newSchedule.save();
        res.status(201).json({ message: "Test schedule added successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/updateSyllabusByTeacher/:id", authMiddleWare, async (req, res) => {
    if (req.user.role !== "teacher") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { syllabus } = req.body;
    if (!syllabus) {
        return res.status(400).json({ message: "Syllabus is required" });
    }
    try {
        const schedule = await TestScheduleAndSyllabus.findById(req.params.id);
        if (!schedule) {
            return res.status(404).json({ message: "Test schedule not found" });
        }
        schedule.syllabus = syllabus;
        schedule.syllabusUpdatedAt = Date.now();
        await schedule.save();
        res.json({ message: "Syllabus updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
router.get("/getTestScheduleAndSyllabusByclassInfo/:classInfo", authMiddleWare, async (req, res) => {
    if (req.user.role !== "student") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { classInfo } = req.params;
    if (!classInfo) {
        return res.status(400).json({ message: "Class info is required" });
    }
    try {
        const schedules = await TestScheduleAndSyllabus.find({ classInfo });
        res.json({ schedules });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
router.get("/getTestScheduleAndSyllabusByCourse/:courseId", authMiddleWare, async (req, res) => {
    if (req.user.role !== "teacher") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { courseId } = req.params;
    if (!courseId) {
        return res.status(400).json({ message: "Course ID is required" });
    }
    try {        const schedule = await TestScheduleAndSyllabus.findOne({ course: courseId }).populate("course");
        if (!schedule) {
            return res.status(404).json({ message: "Test schedule not found for this course" });
        }
        res.json({ schedule });
    }
        catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
module.exports = router;