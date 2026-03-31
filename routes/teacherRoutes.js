const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const Teacher = require("../modals/Teacher");
// const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/signUp", async(req,res)=>{{
    const {name, contact, email, cnic, address} = req.body;
    if(!name || !contact || !email || !cnic || !address){
        return res.status(400).json({ message: "All fields are required", success: false });
    }
    try {
        // Check if teacher already exists
        let teacher = await Teacher.findOne({ email , cnic, contact });
        if (teacher) {
            return res.status(400).json({ message: "Teacher already exists on this email, CNIC, or contact" , success: false});
        }
        // Create new teacher
        const password = cnic.slice(-6) + "@" + name.slice(0, 3); 
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        teacher = new Teacher({ name, contact, email, cnic, password: hashedPassword, address });
        await teacher.save();
        res.status(201).json({ message: "Teacher created successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
}}});


router.post("/login", async(req,res)=>{
    const {email, password} = req.body;
    try {
        // Check if teacher exists
        const teacher = await Teacher.findOne({ email,  });
        if (!teacher) {
            return res.status(400).json({ message: "No teacher found on this email", success: false });
        }
        // Check password
        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials", success: false });
        }
        // Generate token
        const token = jwt.sign({ id: teacher._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ token, success: true, message: "Login successful" });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});

router.get("/profile", authMiddleWare, async(req,res)=>{
    try {
        const teacher = await Teacher.findById(req.user.id).select("-password");
        if (!teacher) {
            return res.status(404).json({ message: "Teacher not found", success: false });
        }
        res.json({ teacher, success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});

router.get("/getAllTeachers",authMiddleWare, async(req,res)=>{
    try {
        const teachers = await Teacher.find().select("-password");
        res.json({ teachers, success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});
router.delete("/deleteTeacher/:id", authMiddleWare, async(req,res)=>{
    try {
        const teacher = await Teacher.findByIdAndDelete(req.params.id);
        if (!teacher) {
            return res.status(404).json({ message: "Teacher not found", success: false });
        }
        res.json({ message: "Teacher deleted successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});

router.put("/updateTeacher/:id", authMiddleWare, async(req,res)=>{
    const {name, contact, email, cnic, address} = req.body;
    if(!name || !contact || !email || !cnic || !address){
        return res.status(400).json({ message: "All fields are required", success: false });
    }
    try {
        const teacher = await Teacher.findById(req.params.id);
        if (!teacher) {
            return res.status(404).json({ message: "Teacher not found", success: false });
        }
        teacher.name = name;
        teacher.contact = contact;
        teacher.email = email;
        teacher.cnic = cnic;
        teacher.address = address;
        await teacher.save();
        res.json({ message: "Teacher updated successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});

module.exports = router;