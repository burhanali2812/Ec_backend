const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!base64) {
    throw new Error(
      "❌ FIREBASE_SERVICE_ACCOUNT_BASE64 is missing"
    );
  }

  // Decode Base64 → JSON string
  const json = Buffer.from(base64, "base64").toString("utf8");

  // JSON string → JavaScript object
  const serviceAccount = JSON.parse(json);

  initializeApp({
    credential: cert(serviceAccount),
  });

  console.log("🔥 Firebase Admin initialized successfully");
}

const messaging = getMessaging();

module.exports = {
  messaging,
};