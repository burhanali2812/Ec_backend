const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

const serviceAccount = require("../credentials/firebase-service-account.json");

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert(serviceAccount),
      })
    : getApps()[0];

const messaging = getMessaging(app);

console.log("🔥 Firebase Admin initialized successfully");

module.exports = {
  app,
  messaging,
};