const express = require("express");
const router = express.Router();
const Course = require("../modals/Course");
const TestScheduleAndSyllabus = require("../modals/TestShaduleandSyllabus");
const authMiddleWare = require("../authMiddleWare");

router.post("/addTestScheduleByAdmin", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { courseId, testDay , classInfo, testDate , title } = req.body;
    if (!courseId || !testDay || !classInfo || !testDate || !title) {
        return res.status(400).json({ message: "Course ID, test day, class info, test date, and title are required" });
    }
    try {        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }
        const existingSchedule = await TestScheduleAndSyllabus.findOne({ course: courseId });
        if (existingSchedule) {
            return res.status(400).json({ message: "Test schedule already exists for this course" });
        }
        const newSchedule = new TestScheduleAndSyllabus({ course: courseId, testDay, classInfo, testDate, title });
        await newSchedule.save();
        res.status(201).json({ message: "Test schedule added successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/UpdatedTestSchedule/:id", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { syllabus, title, testDay, testDate, classInfo } = req.body;
    if (!syllabus && !title && !testDay && !testDate && !classInfo) {
        return res.status(400).json({ message: "Syllabus, title, test day, test date, and class info are required" });
    }
    try {
        const schedule = await TestScheduleAndSyllabus.findById(req.params.id);
        if (!schedule) {
            return res.status(404).json({ message: "Test schedule not found" });
        }
        schedule.syllabus = syllabus;
        schedule.title = title;
        schedule.testDay = testDay;
        schedule.testDate = testDate;
        schedule.classInfo = classInfo;
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
        const schedules = await TestScheduleAndSyllabus.find({ classInfo })
    .populate("course")
    .sort({ testDate: 1 });
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



// Bulk add: admin picks a class + date range in the UI, then submits one
// row per non-Sunday date. Each row = { courseId, testDate, testDay, title, syllabus }
router.post("/addBulkTestSchedule", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { classInfo, schedules } = req.body;
    // schedules: [{ courseId, testDate, testDay, title, syllabus }]
    if (!classInfo || !Array.isArray(schedules) || schedules.length === 0) {
        return res.status(400).json({ message: "Class and at least one schedule entry are required" });
    }

    const invalid = schedules.find(
        (s) => !s.courseId || !s.testDate || !s.testDay || !s.title
    );
    if (invalid) {
        return res.status(400).json({ message: "Each entry needs course, date, day, and title" });
    }

    try {
        const docs = schedules.map((s) => ({
            course: s.courseId,
            classInfo,
            testDay: s.testDay,
            testDate: s.testDate,
            title: s.title,
            syllabus: s.syllabus || "",
        }));
        const created = await TestScheduleAndSyllabus.insertMany(docs);
        res.status(201).json({ message: "Test schedule added successfully", created });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});


// Returns every scheduled test, newest date first. Used by the admin
// review table (with client-side class filter).
router.get("/getAllTestSchedules", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    try {
        const schedules = await TestScheduleAndSyllabus.find({})
            .populate("course", "name")
            .populate("classInfo", "name")
            .sort({ testDate: 1 });
        res.json({ schedules });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
module.exports = router;