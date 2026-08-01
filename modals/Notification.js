const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

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

    recipient: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "recipient.role",
      },

      role: {
        type: String,
        enum: ["Student", "Teacher"],
        required: true,
      },
    },

    type: {
      type: String,
      enum: ["Announcement", "Result", "Fee", "General"],
      default: "General",
    },

    // Who the announcement was sent to. Stored on every recipient row too
    // so the admin table can display it without an extra lookup.
    target: {
      type: String,
      enum: ["students", "teachers", "both"],
      default: "both",
    },

    // Every recipient row created from the same "Create announcement"
    // action shares this id. This is what lets the admin view treat
    // hundreds of per-student rows as a single editable/deletable item.
    groupId: {
      type: String,
      required: true,
      default: () => randomUUID(),
      index: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Notification", notificationSchema);