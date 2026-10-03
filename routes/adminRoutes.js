const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../modals/Admin");
const express = require("express");
const mongoose = require("mongoose");
const authMiddleWare = require("../authMiddleWare");
const TeacherReview = require("../modals/TeacherReviews");
const Institution = require("../modals/Institution");
const router = express.Router();


// router.post("/signUp", async(req,res)=>{
//     const {email, password} = req.body;
//     try {
//         // Check if admin already exists
//         let admin = await Admin.findOne({ email });
//         if (admin) {
//             return res.status(400).json({ message: "Admin already exists" });
//         }   
//         // Create new admin
//         const salt = await bcrypt.genSalt(10);
//         const hashedPassword = await bcrypt.hash(password, salt);
//         admin = new Admin({ email, password: hashedPassword  });
//         await admin.save();
//         res.status(201).json({ message: "Admin created successfully" });
//     } catch (error) {
//         res.status(500).json({ message: "Server error" });
//     }
// });

router.post("/login", async (req, res) => {
  const { email, password, institution } = req.body; // institution = "School" or "Academy" (the type)
  if (!email || !password || !institution) {
    return res.status(400).json({
      message: "Email, password and institution are required",
      success: false,
    });
  }
  try {
    // Check if admin exists
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Invalid credentials", success: false });
    }

    // Renamed from `institution` to `institutionDoc` - fixes the TDZ crash
    const institutionDoc = await Institution.findOne({
      _id: { $in: admin.institution },
      type: institution,
    });
    if (!institutionDoc) {
      return res
        .status(400)
        .json({ message: "Invalid institution type for this admin", success: false });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials", success: false });
    }

    // Create and return JWT token
    const payload = {
      adminId: admin._id,
      role: "admin",
      id: admin._id,
      institution: institutionDoc,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "6h" });

    res.json({
      token,
      message: "Login successful",
      success: true,
      user: {
        email: admin.email,
        role: "admin",
        id: admin._id,
        institution: institutionDoc
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message, success: false });
  }
});



router.get("/getTeacherReviews", authMiddleWare, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (!req.user.institution) {
        return res.status(403).json({ success: false, message: "Institution not found" });
    }
    const inst = req.user.institution;
    try {
      const reviews = await TeacherReview.find({ isSeenByAdmin: false , institution: inst }).populate("teacher", "name course");
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




router.post("/switchInstitution", authMiddleWare, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  try {
    const admin = await Admin.findById(req.user.id).populate("institution", "name type");
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    // The institution that is NOT the one in the current token
    const target = admin.institution.find(
      (i) => String(i._id) !== String(req.user.institution._id)
    );
    if (!target) {
      return res.status(400).json({
        success: false,
        message: "No other institution is linked to this account",
      });
    }

    const payload = {
      adminId: admin._id,
      role: "admin",
      id: admin._id,
      institution: target,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "6h" });

    res.json({
      token,
      message: "Switch to another institution successful",
      success: true,
      user: {
        email: admin.email,
        role: "admin",
        id: admin._id,
        name: admin.name,
        institution: target
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});


module.exports = router;
