const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/addCourse", authMiddleWare, async(req,res)=>{
    const {title, description, teacherId} = req.body;
    if(!title || !description || !teacherId){
        return res.status(400).json({ message: "All fields are required", success: false });
    }
    try {
        const course = new Course({title, description, teacher: teacherId});
        await course.save();
        res.status(201).json({ message: "Course created successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
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