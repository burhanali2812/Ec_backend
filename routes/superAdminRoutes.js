const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SuperAdmin = require("../modals/SuperAdmin");
const express = require("express");
const router = express.Router();

// router.post("/Register", async(req,res)=>{
//     const {email, password, firstName, lastName} = req.body;
//     try {
//         // Check if super admin already exists
//         let superAdmin = await SuperAdmin.findOne({ email });
//         if (superAdmin) {
//             return res.status(400).json({ message: "Super Admin already exists" });
//         }
//         // Create new super admin
//         const salt = await bcrypt.genSalt(10);
//         const hashedPassword = await bcrypt.hash(password, salt);
//         superAdmin = new SuperAdmin({ email, password: hashedPassword, firstName, lastName });
//         await superAdmin.save();
//         res.status(201).json({ message: "Super Admin created successfully" });
//     } catch (error) {
//         res.status(500).json({ message: "Server error" });
//     }
// });

router.post("/login", async(req,res)=>{
    const {email, password} = req.body;
    try {
        // Check if super admin exists
        const superAdmin = await SuperAdmin.findOne({ email });
        if (!superAdmin) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        // Check password
        const isMatch = await bcrypt.compare(password, superAdmin.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        // Create and return JWT token
        const payload = { superAdminId: superAdmin._id , role: "superAdmin", id: superAdmin._id };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "6h" });
        res.json({ token , message: "Login successful", success: true, user: { email: superAdmin.email, role: "superAdmin", id: superAdmin._id } });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }   

});

module.exports = router;