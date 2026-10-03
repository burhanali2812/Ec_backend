const Notification = require("./modals/Notification");
const Student = require("./modals/Student");
const Teacher = require("./modals/Teacher");
const Admin = require("./modals/Admin");
const messaging = require("./services/firebase").messaging;

// Accepts either a raw institution ObjectId/string, or a populated
// Institution document (which has ._id and .type). Normalizes to just
// the id, which is all the Notification schema's "institution" field
// (required: true) needs.
const resolveInstitutionId = (institution) => {
  if (!institution) return null;
  return institution._id || institution;
};

async function createNotification({
  title,
  message,
  type,
  target,
  institution,
  recipients,
}) {
  if (!recipients || recipients.length === 0) {
    console.warn(`Notification "${title}" skipped — no recipients given.`);
    return null;
  }

  const institutionId = resolveInstitutionId(institution);
  if (!institutionId) {
    // FIXED: "institution" is required: true on the Notification schema.
    // Every createNotification call now MUST supply one, or the
    // Notification.create below throws a validation error - this check
    // fails fast with a clearer message instead of a raw Mongoose error.
    console.error(
      `Notification "${title}" skipped — institution is required but was not provided.`,
    );
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
  const results = await Promise.allSettled(
    uniqueTokens.map((token) =>
      messaging.send({
        token,

        data: {
          type: String(type),
          title: String(title),
          body: String(message),
        },
      })
    )
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(
        `FCM sent to token ${index + 1}:`,
        result.value
      );
    } else {
      console.error(
        `❌ FCM failed for token ${index + 1}:`,
        result.reason
      );
    }
  });
}

  // Always save notification in MongoDB
  return Notification.create({
    title,
    message,
    type,
    target,
    institution: institutionId,
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
 * institution: the institution this result belongs to (required).
 */
async function notifyResultUploaded(studentIds, { courseName, dateOfExam, institution }) {
  const recipients = studentIds.map((id) => ({ id, role: "student" }));

  return createNotification({
    title: "New Result Uploaded",
    message: `Your result for ${courseName} on ${dateOfExam} has been uploaded. Check the Results section for details.`,
    type: "Result",
    target: "students",
    institution,
    recipients,
  });
}

/**
 * Call this after monthly fee generation creates fee records.
 * studentIds: array of Student _ids who just had a fee voucher created.
 * institution: the institution this fee belongs to (required).
 */
async function notifyFeeGenerated(studentIds, { month, institution }) {
  const recipients = studentIds.map((id) => ({ id, role: "student" }));

  return createNotification({
    title: "Fee Voucher Generated",
    message: `Your fee for ${month} has been generated. Please check the Fee section for the amount and due date.`,
    type: "Fee",
    target: "students",
    institution,
    recipients,
  });
}

/**
 * Call this when a student or teacher submits a leave request.
 * adminIds: array of Admin _ids who should be notified.
 * applicantName/applicantRole: who requested the leave, for the message.
 * institution: the institution the applicant belongs to (required) -
 * accepts either a raw id or a populated Institution doc; if populated,
 * its .type is used to make the message more specific.
 */
async function notifyLeaveRequested(
  adminId,
  {
    applicantName,
    applicantRole,
    institution,
    reason,
    fromDate,
    toDate,
  }
) {
  // FIXED: the old message referenced `institutiionType`, a variable
  // that was never defined anywhere in this file (typo for something
  // like `institution.type`) - every call to this function would have
  // thrown a ReferenceError. Built safely here: only mentions the
  // institution by name if a populated doc (with .type) was passed in.
  const institutionLabel = institution?.type ? ` from ${institution.type}` : "";

  return createNotification({
    title: "New Leave Request",
    message: `${applicantName} (${applicantRole})${institutionLabel} has submitted a leave request from ${fromDate} to ${toDate}. Reason: ${reason}. Please review and respond.`,
    type: "Leave",
    target: "admins",
    institution,
    recipients: [
      {
        id: adminId,
        role: "admin",
      },
    ],
  });
}
async function notifyAttendanceUploaded(studentIds, { courseName, date, institution })    {
    const recipients = studentIds.map((id) => ({ id, role: "student" }));

    return createNotification({
        title: "New Attendance Uploaded",
        message: `Attendance for ${courseName} on ${date} has been uploaded. Please check the Attendance section for details.`,
        type: "Attendance",
        target: "students",
        institution,
        recipients,
    });
}

/**
 * Call this when an admin approves or rejects a leave request.
 * applicantId/applicantRole: the student or teacher who applied.
 * institution: the institution the applicant belongs to (required).
 * status: "approved" | "rejected" | "pending"
 */
async function notifyLeaveResponse(
  applicantId,
  applicantRole,
  institution,
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
    institution,
    target: applicantRole === "teacher" ? "teachers" : "students",
    recipients: [
      {
        id: applicantId,
        role: applicantRole,
      },
    ],
  });
}

//notifybyadmin just firebase notification to student or teacher when admin send notification to them
// NOTE: this one does NOT call createNotification / Notification.create
// (no DB record is written here, only a push notification is sent), so
// the institution-required schema change does not affect it. If you
// later want these to also persist as Notification documents, route
// them through createNotification with an institution like the other
// helpers above.
async function notifyByAdmin(recipients, { title, message, type }) {

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
  const results = await Promise.allSettled(
    uniqueTokens.map((token) =>
      messaging.send({
        token,

        data: {
          type: String(type),
          title: String(title),
          body: String(message),
        },
      })
    )
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(
        `FCM sent to token ${index + 1}:`,
        result.value
      );
    } else {
      console.error(
        `❌ FCM failed for token ${index + 1}:`,
        result.reason
      );
    }
  });
}
}

module.exports = {
  createNotification,
  notifyByAdmin,
  notifyResultUploaded,
  notifyFeeGenerated,
  notifyLeaveRequested,
  notifyLeaveResponse,
  notifyAttendanceUploaded,
};