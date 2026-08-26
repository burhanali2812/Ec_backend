const Notification = require("./modals/Notification");
const Student = require("./modals/Student");
const Teacher = require("./modals/Teacher");
const Admin = require("./modals/Admin");
const messaging = require("./services/firebase").messaging;

async function createNotification({
  title,
  message,
  type,
  target,
  recipients,
}) {
  if (!recipients || recipients.length === 0) {
    console.warn(`Notification "${title}" skipped — no recipients given.`);
    return null;
  }

  const fcmTokens = [];

  for (const recipient of recipients) {
    const { id, role } = recipient;

    let user;

    switch (role) {
      case "student":
        user = await Student.findById(id).select("fcmTokens");
        break;

      case "teacher":
        user = await Teacher.findById(id).select("fcmTokens");
        break;

      case "admin":
        user = await Admin.findById(id).select("fcmTokens");
        break;

      default:
        console.warn(
          `Unknown role "${role}" for recipient with ID "${id}"`
        );
        continue;
    }

    if (user?.fcmTokens?.length) {
      fcmTokens.push(...user.fcmTokens);
    }
  }

  // Remove duplicate tokens
  const uniqueTokens = [...new Set(fcmTokens)];

  // Send Firebase notification
  if (uniqueTokens.length > 0) {
    const messagePayload = {
      tokens: uniqueTokens,

      data: {
        type: String(type),
        title: String(title),
        body: String(message),
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(
        messagePayload
      );

      console.log(
        `✅ FCM: ${response.successCount} sent, ${response.failureCount} failed`
      );

      // Optional: handle failed/expired tokens here
    } catch (error) {
      console.error(
        "❌ Error sending FCM notification:",
        error
      );
    }
  }

  // Always save notification in MongoDB
  return Notification.create({
    title,
    message,
    type,
    target,
    publishedBy: "system",

    recipients: recipients.map((r) => ({
      id: r.id,
      role: r.role,
      isRead: false,
    })),
  });
}

/**
 * Call this after marks/results are uploaded for a course.
 * studentIds: array of Student _ids who just got a result posted.
 */
async function notifyResultUploaded(studentIds, { courseName, dateOfExam }) {
  const recipients = studentIds.map((id) => ({ id, role: "student" }));

  return createNotification({
    title: "New Result Uploaded",
    message: `Your result for ${courseName} on ${dateOfExam} has been uploaded. Check the Results section for details.`,
    type: "Result",
    target: "students",
    recipients,
  });
}

/**
 * Call this after monthly fee generation creates fee records.
 * studentIds: array of Student _ids who just had a fee voucher created.
 */
async function notifyFeeGenerated(studentIds, { month }) {
  const recipients = studentIds.map((id) => ({ id, role: "Student" }));

  return createNotification({
    title: "Fee Voucher Generated",
    message: `Your fee for ${month} has been generated. Please check the Fee section for the amount and due date.`,
    type: "Fee",
    target: "students",
    recipients,
  });
}

/**
 * Call this when a student or teacher submits a leave request.
 * adminIds: array of Admin _ids who should be notified.
 * applicantName/applicantRole: who requested the leave, for the message.
 */
async function notifyLeaveRequested(adminIds, { applicantName, applicantRole }) {
  const recipients = adminIds.map((id) => ({ id, role: "admin" }));

  return createNotification({
    title: "New Leave Request",
    message: `${applicantName} (${applicantRole}) has submitted a leave request awaiting your review.`,
    type: "Leave",
    target: "admins",
    recipients,
  });
}
async function notifyAttendanceUploaded(studentIds, { courseName, date }  )    {
    const recipients = studentIds.map((id) => ({ id, role: "student" }));

    return createNotification({
        title: "New Attendance Uploaded",
        message: `Attendance for ${courseName} on ${date} has been uploaded. Please check the Attendance section for details.`,
        type: "Attendance",
        target: "students",
        recipients,
    });
}

/**
 * Call this when an admin approves or rejects a leave request.
 * applicantId/applicantRole: the student or teacher who applied.
 * status: "approved" | "rejected"
 */
async function notifyLeaveResponse(
  applicantId,
  applicantRole,
  { status, adminNote }
) {
  let title;
  let message;

  if (status === "approved") {
    title = "Leave Approved";
    message = `Your leave request has been approved.${
      adminNote ? ` Note: ${adminNote}` : ""
    }`;
  } else if (status === "rejected") {
    title = "Leave Rejected";
    message = `Your leave request has been rejected.${
      adminNote ? ` Reason: ${adminNote}` : ""
    }`;
  } else if (status === "pending") {
    title = "Leave Pending";
    message = `Your leave request is currently pending.${
      adminNote ? ` Note: ${adminNote}` : ""
    }`;
  } else {
    throw new Error("Invalid leave status");
  }

  return createNotification({
    title,
    message,
    type: "Leave",
    target: applicantRole === "teacher" ? "teachers" : "students",
    recipients: [
      {
        id: applicantId,
        role: applicantRole,
      },
    ],
  });
}

module.exports = {
  createNotification,
  notifyResultUploaded,
  notifyFeeGenerated,
  notifyLeaveRequested,
  notifyLeaveResponse,
  notifyAttendanceUploaded,
};