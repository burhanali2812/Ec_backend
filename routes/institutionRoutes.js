const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const authMiddleWare = require("../authMiddleWare");
const Student = require("../modals/Student");
const Institution = require("../modals/Institution");
const Admin = require("../modals/Admin");
const TeacherReview = require("../modals/TeacherReviews");
const Result = require("../modals/Result");
const Registration = require("../modals/Registration");
const TimeTable = require("../modals/TimeTable");
const Attendance = require("../modals/Attandance");
const StudentFee = require("../modals/StudentFee");
const Class = require("../modals/Class");
const LeaveApplication = require("../modals/LeaveApplication");
const Notification = require("../modals/Notification");
const TestScheduleAndSyllabus = require("../modals/TestShaduleandSyllabus");
const router = express.Router();

router.post("/registerInstitution", authMiddleWare, async (req, res) => {
  const { name, address, contactNumber, email, type, logoUrl, websiteUrl } = req.body;
    if(req.user.role !== "superAdmin") {
    return res.status(403).json({ message: "Access denied" });
  }
    if (!name || !address || !contactNumber  || !type) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const existingInstitution = await Institution.findOne({ name, type });
  if (existingInstitution) {
    return res.status(400).json({ message: "Institution with this name already exists" });
  }
  try {
    const institution = new Institution({
      name,
      address,
      contactNumber,
      email,
      type,
      superAdmin: req.user.id,
      logoUrl,
      websiteUrl
    });
    await institution.save();
    res.status(201).json({ message: "Institution registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error registering institution", error });
  }
});

router.get("/getInstitutions", authMiddleWare, async (req, res) => {
  try {
    const institutions = await Institution.find();
    res.status(200).json(institutions);
  }
    catch (error) { 

    res.status(500).json({ message: "Error fetching institutions", error });
  }
});

router.get("/getInstitution/:id", authMiddleWare, async (req, res) => {
  const { id } = req.params;
  try {
    const institution = await Institution.findById(id);
    if (!institution) {
        return res.status(404).json({ message: "Institution not found" });
    }
    res.status(200).json(institution);
  }
    catch (error) {
    res.status(500).json({ message: "Error fetching institution", error });
  }
});

router.put("/updateInstitution/:id", authMiddleWare, async (req, res) => {
    const { id } = req.params;
    const { name, address, contactNumber, email, type, logoUrl, websiteUrl } = req.body;
    if (!name || !address || !contactNumber || !email || !type) {
        return res.status(400).json({ message: "All fields are required" });
    }
    try {
        const institution = await Institution.findByIdAndUpdate(
            id,
            { name, address, contactNumber, email, type, logoUrl, websiteUrl },
            { new: true }
        );
        if (!institution) {
            return res.status(404).json({ message: "Institution not found" });
        }
        res.status(200).json({ message: "Institution updated successfully", institution });
    }
    catch (error) {
        res.status(500).json({ message: "Error updating institution", error });
    }
});

router.delete("/deleteInstitution/:id", authMiddleWare, async (req, res) => {
    const { id } = req.params;
    try {
        const institution = await Institution.findByIdAndDelete(id);
        if (!institution) {
            return res.status(404).json({ message: "Institution not found" });
        }
        res.status(200).json({ message: "Institution deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: "Error deleting institution", error });
    }
});

router.post(
  "/addInstitutionIdToAllModels/:institutionId",
  async (req, res) => {
    const { institutionId } = req.params;
    const { adminId } = req.body;

    if (!institutionId) {
      return res.status(400).json({
        message: "Institution ID is required"
      });
    }

    if (!adminId) {
      return res.status(400).json({
        message: "Admin ID is required"
      });
    }

    try {
      const admin = await Admin.findByIdAndUpdate(
        adminId,
        {
          $addToSet: {
            institution: institutionId
          }
        },
        { new: true }
      );

      if (!admin) {
        return res.status(404).json({
          message: "Admin not found"
        });
      }

      return res.status(200).json({
        message: "Institution ID added to Admin successfully",
        institutions: admin.institution
      });

    } catch (error) {
      return res.status(500).json({
        message: "Error updating admin",
        error
      });
    }
  }
);



module.exports = router;