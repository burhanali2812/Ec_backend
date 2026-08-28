const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "recipients.role",
    },
    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["Announcement", "Result", "Fee", "General", "Attendance", "Leave", "Holiday"],
      default: "General",
    },
    date:{
      from: {
        type: Date,
      },
      to: {
        type: Date,
      },
    },
   

    // Who this was sent to, kept for display in the admin table.
    target: {
      type: String,
      enum: ["students", "teachers", "both", "admins"],
      required: true,
    },

    // One entry per recipient, on a SINGLE document — this is the
    // whole point of the redesign: 1 announcement = 1 document,
    // regardless of how many students/teachers it goes to.
    publishedBy: {
      type: String,
      enum: ["admin", "system"],
      required: true,
    },
    recipients: {
      type: [recipientSchema],
      required: true,
      validate: {
        validator: (arr) => arr.length > 0,
        message: "An announcement needs at least one recipient.",
      },
    },
  },
  {
    timestamps: true,
  }
);

// Lets "give me all notifications for this user" run as an indexed
// lookup instead of a full collection scan.
notificationSchema.index({ "recipients.id": 1, "recipients.role": 1 });

module.exports = mongoose.model("Notification", notificationSchema);