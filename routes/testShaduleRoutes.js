const express = require("express");
const router = express.Router();
const Course = require("../modals/Course");
const TestShaduleandSyllabus = require("../modals/TestShaduleandSyllabus");
const authMiddleWare = require("../authMiddleWare");

// ---------------------------------------------------------------------
// CREATE a sheet: title + class + the full batch of test-day entries.
// This replaces both the old single-add and bulk-add routes — one sheet
// document per submission of the wizard.
// body: { classInfo, title, schedules: [{ courseId, testDate, testDay, syllabus }] }
// ---------------------------------------------------------------------
router.post("/addTestScheduleByAdmin", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { classInfo, title, schedules } = req.body;

    if (!classInfo ) {
        return res.status(400).json({ message: "Class entry is required" });
    }
    if (!title) {
        return res.status(400).json({ message: "Title is required" });
    }
    if (!Array.isArray(schedules) || !schedules.length) {
        return res.status(400).json({ message: "Schedules array is required" });
    }

    const invalid = schedules.find(
        (s) => !s.courseId || !s.testDate || !s.testDay || !s.syllabus
    );
    if (invalid) {
        return res.status(400).json({ message: "Each entry needs course, date, day, and syllabus" });
    }

    try {
        // Sanity check the courses exist before writing
        const courseIds = schedules.map((s) => s.courseId);
        const foundCount = await Course.countDocuments({ _id: { $in: courseIds } });
        if (foundCount !== new Set(courseIds).size) {
            return res.status(404).json({ message: "One or more courses not found" });
        }

        const newSheet = new TestShaduleandSyllabus({
            classInfo,
            title,
            schedules: schedules.map((s) => ({
                course: s.courseId,
                testDate: s.testDate,
                testDay: s.testDay,
                syllabus: s.syllabus,
            })),
        });
        await newSheet.save();
        res.status(201).json({ message: "Test schedule added successfully", sheet: newSheet });
    } catch (error) {
        res.status(500).json({ message:  error.message});
    }
});

// ---------------------------------------------------------------------
// UPDATE the sheet's own fields (title / class). To edit an individual
// test day, use updateScheduleEntry below instead.
// ---------------------------------------------------------------------
router.put("/updateTestSchedule/:id", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { title, classInfo } = req.body;
    if (!title && !classInfo) {
        return res.status(400).json({ message: "Provide title and/or classInfo to update" });
    }
    try {
        const sheet = await TestShaduleandSyllabus.findById(req.params.id);
        if (!sheet) {
            return res.status(404).json({ message: "Test schedule not found" });
        }
        if (title) sheet.title = title;
        if (classInfo) sheet.classInfo = classInfo;
        sheet.syllabusUpdatedAt = Date.now();
        await sheet.save();
        res.json({ message: "Test schedule updated successfully", sheet });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// ---------------------------------------------------------------------
// UPDATE a single test-day entry inside a sheet.
// body: { courseId, testDate, testDay, syllabus } — send only what changes
// ---------------------------------------------------------------------
router.put("/updateScheduleEntry/:sheetId/:entryId", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { courseId, testDate, testDay, syllabus } = req.body;
    try {
        const sheet = await TestShaduleandSyllabus.findById(req.params.sheetId);
        if (!sheet) {
            return res.status(404).json({ message: "Test schedule not found" });
        }
        const entry = sheet.schedules.id(req.params.entryId);
        if (!entry) {
            return res.status(404).json({ message: "Schedule entry not found" });
        }
        if (courseId) entry.course = courseId;
        if (testDate) entry.testDate = testDate;
        if (testDay) entry.testDay = testDay;
        if (syllabus) entry.syllabus = syllabus;
        sheet.syllabusUpdatedAt = Date.now();
        await sheet.save();
        res.json({ message: "Schedule entry updated successfully", sheet });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// ---------------------------------------------------------------------
// ADD a single test-day entry to an existing sheet (e.g. one extra date
// added later, outside the original range).
// body: { courseId, testDate, testDay, syllabus }
// ---------------------------------------------------------------------
router.post("/addScheduleEntry/:sheetId", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { courseId, testDate, testDay, syllabus } = req.body;
    if (!courseId || !testDate || !testDay || !syllabus) {
        return res.status(400).json({ message: "Course, date, day, and syllabus are required" });
    }
    try {
        const sheet = await TestShaduleandSyllabus.findById(req.params.sheetId);
        if (!sheet) {
            return res.status(404).json({ message: "Test schedule not found" });
        }
        sheet.schedules.push({ course: courseId, testDate, testDay, syllabus });
        sheet.syllabusUpdatedAt = Date.now();
        await sheet.save();
        res.status(201).json({ message: "Entry added successfully", sheet });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// ---------------------------------------------------------------------
// DELETE a single test-day entry from a sheet.
// ---------------------------------------------------------------------
router.delete("/deleteScheduleEntry/:sheetId/:entryId", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    try {
        const sheet = await TestShaduleandSyllabus.findById(req.params.sheetId);
        if (!sheet) {
            return res.status(404).json({ message: "Test schedule not found" });
        }
        sheet.schedules.id(req.params.entryId)?.deleteOne();
        sheet.syllabusUpdatedAt = Date.now();
        await sheet.save();
        res.json({ message: "Entry deleted successfully", sheet });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// ---------------------------------------------------------------------
// GET all sheets for a class (student view).
// ---------------------------------------------------------------------
router.get("/getTestScheduleAndSyllabusByclassInfo/:classInfo", authMiddleWare, async (req, res) => {
    if (req.user.role !== "student") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { classInfo } = req.params;
    if (!classInfo) {
        return res.status(400).json({ message: "Class info is required" });
    }
    try {
        const sheets = await TestShaduleandSyllabus.find({ classInfo })
            .populate("schedules.course", "title")
            .sort({ createdAt: -1 });
        res.json({ sheets });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ---------------------------------------------------------------------
// GET every entry for a given course, across all sheets (teacher view).
// course now lives inside the schedules array, so this uses aggregation
// to pull out just the matching entries.
// ---------------------------------------------------------------------
router.get("/getTestScheduleAndSyllabusByCourse/:courseId", authMiddleWare, async (req, res) => {
    if (req.user.role !== "teacher") {
        return res.status(403).json({ message: "Access denied" });
    }
    const { courseId } = req.params;
    if (!courseId) {
        return res.status(400).json({ message: "Course ID is required" });
    }
    try {
        const sheets = await TestShaduleandSyllabus.aggregate([
            { $match: { "schedules.course": new (require("mongoose").Types.ObjectId)(courseId) } },
            { $unwind: "$schedules" },
            { $match: { "schedules.course": new (require("mongoose").Types.ObjectId)(courseId) } },
            {
                $project: {
                    title: 1,
                    classInfo: 1,
                    testDate: "$schedules.testDate",
                    testDay: "$schedules.testDay",
                    syllabus: "$schedules.syllabus",
                    entryId: "$schedules._id",
                },
            },
            { $sort: { testDate: 1 } },
        ]);

        if (!sheets.length) {
            return res.status(404).json({ message: "No test schedule found for this course" });
        }
        res.json({ schedules: sheets });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// ---------------------------------------------------------------------
// GET everything (admin review table, with class filter on the frontend).
// ---------------------------------------------------------------------
router.get("/getAllTestSchedules", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    try {
        const sheets = await TestShaduleandSyllabus.find({})
            .populate("classInfo", "name")
            .populate("schedules.course", "title")
            .sort({ createdAt: -1 });
        res.json({ sheets });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// routes/testScheduleAndSyllabus.js — ADD this route

// Delete an entire sheet (title + all its schedule entries).
router.delete("/deleteTestSchedule/:id", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
    }
    try {
        const sheet = await TestShaduleandSyllabus.findByIdAndDelete(req.params.id);
        if (!sheet) {
            return res.status(404).json({ message: "Test schedule not found" });
        }
        res.json({ message: "Test schedule deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;