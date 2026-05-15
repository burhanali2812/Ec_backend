const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../modals/Admin");
const express = require("express");
const authMiddleWare = require("../authMiddleWare");
const TeacherReview = require("../modals/TeacherReviews");
const router = express.Router();


router.post("/signUp", async(req,res)=>{
    const {email, password} = req.body;
    try {
        // Check if admin already exists
        let admin = await Admin.findOne({ email });
        if (admin) {
            return res.status(400).json({ message: "Admin already exists" });
        }   
        // Create new admin
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        admin = new Admin({ email, password: hashedPassword  });
        await admin.save();
        res.status(201).json({ message: "Admin created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/login", async(req,res)=>{
    const {email, password} = req.body;
    try {
        // Check if admin exists
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        // Check password     
           const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        // Create and return JWT token
        const payload = { adminId: admin._id , role: "admin" };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "3h" });
        res.json({ token , message: "Login successful", success: true});
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/getTeacherReviews", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Access denied" });
    }
    try {
      const reviews = await TeacherReview.find({ isSeenByAdmin: false }).populate("teacher", "name course");
        res.json({ success: true, reviews });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.put("/updateReviewStatus/:reviewId", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Access denied" });
    }
    const { reviewId } = req.params;
    try {
        const review = await TeacherReview.findById(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: "Review not found" });
        }
        review.isSeenByAdmin = true;
        await review.save();
        res.json({ success: true, message: "Review status updated successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});




module.exports = router;
