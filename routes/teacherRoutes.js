const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const Teacher = require("../modals/Teacher");
// const Course = require("../modals/Course");
// const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/signUp", async(req,res)=>{{
    const {name, contact, email, cnic, address} = req.body;
    try {
        // Check if teacher already exists
        let teacher = await Teacher.findOne({ email , cnic });
        if (teacher) {
            return res.status(400).json({ message: "Teacher already exists" });
        }
        // Create new teacher
        const password = cnic.slice(-6) + "@" + name.slice(0, 3); 
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        teacher = new Teacher({ name, contact, email, cnic, password: hashedPassword, address });
        await teacher.save();
        res.status(201).json({ message: "Teacher created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
}}});


router.post("/login", async(req,res)=>{
    const {email, password} = req.body;
    try {
        // Check if teacher exists
        const teacher = await Teacher.findOne({ email,  });
        if (!teacher) {
            return res.status(400).json({ message: "No teacher found on this email" });
        }
        // Check password
        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        // Generate token
        const token = jwt.sign({ id: teacher._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ token });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});



module.exports = router;