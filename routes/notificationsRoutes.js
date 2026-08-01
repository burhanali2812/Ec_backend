const express = require("express");
const { randomUUID } = require("crypto");
const router = express.Router();

const Notification = require("../models/Notification");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");

// NOTE: Plug your existing admin-only auth middleware in front of the
// three "/admin..." routes below (the same one used on your other
// admin routes), so only admins can create/edit/delete announcements.
// Left out here since I don't have your middleware's exact name/path.

/**
 * Create an announcement.
 * Fans out one Notification row per recipient, all sharing a groupId
 * so the admin side can treat them as a single announcement.
 */
router.post("/", async (req, res) => {
  try {
    const { title, message, target } = req.body;

    if (!title || !message || !target) {
      return res.status(400).json({
        success: false,
        message: "Title, message and target are required.",
      });
    }

    if (!["students", "teachers", "both"].includes(target)) {
      return res.status(400).json({
        success: false,
        message: "Invalid target.",
      });
    }

    const groupId = randomUUID();
    let notifications = [];

    // Students
    if (target === "students" || target === "both") {
      const students = await Student.find().select("_id");

      students.forEach((student) => {
        notifications.push({
          title,
          message,
          recipient: {
            id: student._id,
            role: "Student",
          },
          type: "Announcement",
          target,
          groupId,
        });
      });
    }

    // Teachers
    if (target === "teachers" || target === "both") {
      const teachers = await Teacher.find().select("_id");

      teachers.forEach((teacher) => {
        notifications.push({
          title,
          message,
          recipient: {
            id: teacher._id,
            role: "Teacher",
          },
          type: "Announcement",
          target,
          groupId,
        });
      });
    }

    if (notifications.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No recipients found.",
      });
    }

    await Notification.insertMany(notifications);

    return res.status(201).json({
      success: true,
      message: "Notification sent successfully.",
      count: notifications.length,
      groupId,
    });
  } catch (error) {
    console.error("Notification Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

/**
 * Admin: list announcements, one row per announcement (not per recipient).
 * Supports ?search= to filter by title.
 */
router.get("/admin", async (req, res) => {
  try {
    const { search = "" } = req.query;

    const match = search
      ? { title: { $regex: search.trim(), $options: "i" } }
      : {};

    const groups = await Notification.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$groupId",
          title: { $first: "$title" },
          message: { $first: "$message" },
          target: { $first: "$target" },
          createdAt: { $first: "$createdAt" },
          recipientCount: { $sum: 1 },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.json({
      success: true,
      announcements: groups.map((g) => ({
        groupId: g._id,
        title: g.title,
        message: g.message,
        target: g.target,
        createdAt: g.createdAt,
        recipientCount: g.recipientCount,
      })),
    });
  } catch (error) {
    console.error("Admin List Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

/**
 * Admin: edit an announcement.
 * If the audience (target) is unchanged, just updates title/message on
 * every row in the group, preserving each recipient's read state.
 * If the audience changed, recipients have to be recomputed, so the
 * old rows are replaced with a fresh set (read state resets for this
 * announcement only).
 */
router.put("/admin/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const { title, message, target } = req.body;

    if (!title || !message || !target) {
      return res.status(400).json({
        success: false,
        message: "Title, message and target are required.",
      });
    }

    if (!["students", "teachers", "both"].includes(target)) {
      return res.status(400).json({
        success: false,
        message: "Invalid target.",
      });
    }

    const existing = await Notification.findOne({ groupId });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
    }

    if (existing.target === target) {
      await Notification.updateMany({ groupId }, { title, message });

      return res.json({
        success: true,
        message: "Announcement updated.",
      });
    }

    // Audience changed — rebuild the recipient list from scratch.
    await Notification.deleteMany({ groupId });

    let notifications = [];

    if (target === "students" || target === "both") {
      const students = await Student.find().select("_id");
      students.forEach((student) => {
        notifications.push({
          title,
          message,
          recipient: { id: student._id, role: "Student" },
          type: "Announcement",
          target,
          groupId,
        });
      });
    }

    if (target === "teachers" || target === "both") {
      const teachers = await Teacher.find().select("_id");
      teachers.forEach((teacher) => {
        notifications.push({
          title,
          message,
          recipient: { id: teacher._id, role: "Teacher" },
          type: "Announcement",
          target,
          groupId,
        });
      });
    }

    if (notifications.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No recipients found for the selected audience.",
      });
    }

    await Notification.insertMany(notifications);

    return res.json({
      success: true,
      message: "Announcement updated.",
    });
  } catch (error) {
    console.error("Admin Update Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

/**
 * Admin: delete an announcement (all recipient rows in the group).
 */
router.delete("/admin/:groupId", async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      groupId: req.params.groupId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
    }

    return res.json({
      success: true,
      message: "Announcement deleted.",
    });
  } catch (error) {
    console.error("Admin Delete Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

/**
 * Student/Teacher: get my own notifications.
 */
router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({
      "recipient.id": req.user.id,
      "recipient.role": req.user.role,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        "recipient.id": req.user.id,
        "recipient.role": req.user.role,
      },
      {
        isRead: true,
      },
      {
        new: true,
      }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    res.json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(
      {
        "recipient.id": req.user.id,
        "recipient.role": req.user.role,
        isRead: false,
      },
      {
        isRead: true,
      }
    );

    res.json({
      success: true,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

module.exports = router;