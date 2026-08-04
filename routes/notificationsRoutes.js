const express = require("express");
const router = express.Router();

const Notification = require("../modals/Notification");
const Student = require("../modals/Student");
const Teacher = require("../modals/Teacher");
const authMiddleWare = require("../authMiddleWare");

// NOTE: Plug your existing admin-only auth middleware in front of the
// three "/admin..." routes below (the same one used on your other
// admin routes), so only admins can create/edit/delete announcements.
// Left out here since I don't have your middleware's exact name/path.

const VALID_TYPES = ["Announcement", "Result", "Fee", "General", "Attendance", "Leave", "Holiday"];

/**
 * Build the recipients array for a given target audience.
 * One entry per student/teacher — this array lives on a single
 * Notification document, instead of creating a document per person.
 */
async function buildRecipients(target) {
  let recipients = [];

  if (target === "students" || target === "both") {
    const students = await Student.find().select("_id");
    recipients = recipients.concat(
      students.map((s) => ({ id: s._id, role: "student", isRead: false }))
    );
  }

  if (target === "teachers" || target === "both") {
    const teachers = await Teacher.find().select("_id");
    recipients = recipients.concat(
      teachers.map((t) => ({ id: t._id, role: "teacher", isRead: false }))
    );
  }

  return recipients;
}

/**
 * Validates the { from, to } date range required for Holiday notifications.
 * Returns an error message string, or null if valid.
 */
function validateHolidayDateRange(date) {
  if (!date || !date.from || !date.to) {
    return "A start and end date are required for a holiday.";
  }
  if (date.to < date.from) {
    return "End date cannot be before the start date.";
  }
  return null;
}

/**
 * Create an announcement — ONE document, with a recipients array.
 */
router.post("/", authMiddleWare, async (req, res) => {
  try {
    const { title, message, target, date, type } = req.body;

    // Fixed: the original check used a comma (`, !type`) instead of
    // `||`, which meant only `!type` was ever actually evaluated —
    // title/message/target were never checked.
    if (!title || !message || !target || !type) {
      return res.status(400).json({
        success: false,
        message: "Title, message, type, and target are required.",
      });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type.",
      });
    }

    if (!["students", "teachers", "both"].includes(target)) {
      return res.status(400).json({
        success: false,
        message: "Invalid target.",
      });
    }

    // Date range only applies to Holiday notifications — a plain
    // announcement has no date range, so it's no longer required
    // unconditionally.
    let dateRange = undefined;
    if (type === "Holiday") {
      const dateError = validateHolidayDateRange(date);
      if (dateError) {
        return res.status(400).json({ success: false, message: dateError });
      }
      dateRange = { from: date.from, to: date.to };
    }

    const recipients = await buildRecipients(target);

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No recipients found.",
      });
    }

    const notification = await Notification.create({
      title,
      message,
      type,
      target,
      date: dateRange,
      publishedBy: "admin",
      recipients,
    });

    return res.status(201).json({
      success: true,
      message: "Notification sent successfully.",
      id: notification._id,
      recipientCount: recipients.length,
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
 * Admin: list announcements (each row = one document now).
 * Only shows admin-published notifications — system-generated ones
 * (Result/Fee/Leave/Attendance) don't clutter this table.
 * Supports ?search= to filter by title.
 */
router.get("/admin", authMiddleWare, async (req, res) => {
  try {
    const { search = "" } = req.query;

    const filter = search
      ? { title: { $regex: search.trim(), $options: "i" }, publishedBy: "admin" }
      : { publishedBy: "admin" };

    const notifications = await Notification.find(filter)
      .select("title message type target date createdAt recipients")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      announcements: notifications.map((n) => ({
        id: n._id,
        title: n.title,
        message: n.message,
        type: n.type,
        target: n.target,
        date: n.date,
        publishedBy: n.publishedBy,
        createdAt: n.createdAt,
        recipientCount: n.recipients.length,
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
 * Now also handles type + date, so a notification's type (e.g. plain
 * Announcement -> Holiday) and its date range can be changed too.
 * If the audience (target) is unchanged, recipients keep their read
 * state. If it changed, the recipients array is rebuilt (read state
 * resets — unavoidable, since the set of people it applies to changed).
 */
router.put("/admin/:id", authMiddleWare, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, target, date, type } = req.body;

    if (!title || !message || !target || !type) {
      return res.status(400).json({
        success: false,
        message: "Title, message, type, and target are required.",
      });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type.",
      });
    }

    if (!["students", "teachers", "both"].includes(target)) {
      return res.status(400).json({
        success: false,
        message: "Invalid target.",
      });
    }

    let dateRange = undefined;
    if (type === "Holiday") {
      const dateError = validateHolidayDateRange(date);
      if (dateError) {
        return res.status(400).json({ success: false, message: dateError });
      }
      dateRange = { from: date.from, to: date.to };
    }

    const existing = await Notification.findById(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
    }

    existing.title = title;
    existing.message = message;
    existing.type = type;
    existing.date = dateRange;

    if (existing.target === target) {
      await existing.save();

      return res.json({
        success: true,
        message: "Announcement updated.",
      });
    }

    // Audience changed — rebuild the recipients array.
    const recipients = await buildRecipients(target);

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No recipients found for the selected audience.",
      });
    }

    existing.target = target;
    existing.recipients = recipients;
    await existing.save();

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
 * Admin: delete an announcement (single document — no cleanup needed).
 */
router.delete("/admin/:id", authMiddleWare, async (req, res) => {
  try {
    const deleted = await Notification.findByIdAndDelete(req.params.id);

    if (!deleted) {
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
 * Finds documents where I'm listed in the recipients array, then
 * flattens each one down to just my own isRead status — the caller
 * never sees anyone else's recipient data.
 */
router.get("/", authMiddleWare, async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipients: {
        $elemMatch: { id: req.user.id, role: req.user.role },
      },
    })
      .select("title message type date createdAt recipients")
      .sort({ createdAt: -1 });

    const mine = notifications.map((n) => {
      const myEntry = n.recipients.find(
        (r) => String(r.id) === String(req.user.id) && r.role === req.user.role
      );

      return {
        _id: n._id,
        title: n.title,
        message: n.message,
        type: n.type,
        date: n.date,
        createdAt: n.createdAt,
        isRead: myEntry ? myEntry.isRead : false,
      };
    });

    res.json({
      success: true,
      notifications: mine,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

/**
 * Mark one notification as read, for the current user only —
 * updates just their entry inside the recipients array.
 */
router.patch("/:id/read", authMiddleWare, async (req, res) => {
  try {
    const result = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipients: { $elemMatch: { id: req.user.id, role: req.user.role } },
      },
      {
        $set: {
          "recipients.$[elem].isRead": true,
          "recipients.$[elem].readAt": new Date(),
        },
      },
      {
        arrayFilters: [{ "elem.id": req.user.id, "elem.role": req.user.role }],
        new: true,
      }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    res.json({
      success: true,
      message: "Notification marked as read.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

/**
 * Mark all of the current user's unread notifications as read.
 */
router.patch("/read-all", authMiddleWare, async (req, res) => {
  try {
    await Notification.updateMany(
      {
        recipients: {
          $elemMatch: { id: req.user.id, role: req.user.role, isRead: false },
        },
      },
      {
        $set: {
          "recipients.$[elem].isRead": true,
          "recipients.$[elem].readAt": new Date(),
        },
      },
      {
        arrayFilters: [{ "elem.id": req.user.id, "elem.role": req.user.role }],
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

/**
 * Delete a notification for the current user only — pulls just their
 * entry out of the recipients array. Other recipients keep their copy.
 * If they were the last recipient left, the whole document is removed.
 */
router.delete("/:id", authMiddleWare, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipients: { $elemMatch: { id: req.user.id, role: req.user.role } },
      },
      {
        $pull: { recipients: { id: req.user.id, role: req.user.role } },
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    if (notification.recipients.length === 0) {
      await Notification.findByIdAndDelete(notification._id);
    }

    res.json({
      success: true,
      message: "Notification deleted.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

module.exports = router;