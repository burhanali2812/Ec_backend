const mongoose = require("mongoose");

const notificationReadSchema = new mongoose.Schema(
  {
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "userRole",
    },

    userRole: {
      type: String,
      enum: ["Student", "Teacher"],
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
  {
    timestamps: true,
  }
);

notificationReadSchema.index(
  { notification: 1, userId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "NotificationRead",
  notificationReadSchema
);