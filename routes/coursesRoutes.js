const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/addCourse", async (req, res) => {
    const { title, description, teacherIds } = req.body; // teacherIds is an array

    try {
        // 1. Create the new course
        const newCourse = new Course({
            title,
            description,
            teachers: teacherIds // Assigning the array of teacher IDs
        });
        const savedCourse = await newCourse.save();

        // 2. THE LINK: Update all selected teachers to include this course ID
        await Teacher.updateMany(
            { _id: { $in: teacherIds } }, 
            { $push: { courses: savedCourse._id } }
        );

        res.status(201).json({ message: "Course created and linked to teachers!" });
    } catch (error) {
        res.status(500).json({ message: "Error linking course", error });
    }
});

router.get("/myCourses", authMiddleWare, async(req,res)=>{
    try {
        const courses = await Course.find({ teacher: req.user.id }).populate("teacher", "name email");
        res.json({ courses, success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});

router.get("/allCourses",authMiddleWare, async(req,res)=>{
    try {
        const courses = await Course.find().populate("teacher", "name email");
        res.json({ courses, success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});
module.exports = router;