const express = require("express");
const Class = require("../modals/Class");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/addClass", authMiddleWare, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
        message: "Unauthorized, You cannot add classes",
        success: false,
    });
  }
    const { name, description } = req.body;
    const newClass = new Class({ name, description });
    await newClass.save();

    return res.status(201).json({
        message: "Class added successfully",
        success: true,
        data: newClass,
    });
});

router.get("/getClasses", authMiddleWare, async (req, res) => {
    try {
        const classes = await Class.find();
        return res.status(200).json({
            message: "Classes fetched successfully",
            success: true,
            data: classes,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error fetching classes",
            success: false,
            error: error.message,
        });
    }
});

router.put("/updateClass/:classId", authMiddleWare, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
        message: "Unauthorized, You cannot update classes",
        success: false,
    });
  }
    const { classId } = req.params;
    const { name, description } = req.body;

    try {
        const updatedClass = await Class.findByIdAndUpdate(
            classId,
            { name, description },
            { new: true }
        );

        if (!updatedClass) {
            return res.status(404).json({
                message: "Class not found",
                success: false,
            });
        }
        return res.status(200).json({
            message: "Class updated successfully",
            success: true,
            data: updatedClass,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: "Error updating class",
            success: false,
            error: error.message,
        });
    }
});

router.delete("/deleteClass/:classId", authMiddleWare, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
        message: "Unauthorized, You cannot delete classes",
        success: false,
    });
  }
    const { classId } = req.params;
        const deletedClass = await Class.findByIdAndDelete(classId);
        if (!deletedClass) {
            return res.status(404).json({
                message: "Class not found",
                success: false,
            });
        }
        return res.status(200).json({
            message: "Class deleted successfully",
            success: true,
            data: deletedClass,
        });
});
module.exports = router;