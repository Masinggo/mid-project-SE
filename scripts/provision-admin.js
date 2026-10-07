const crypto = require("node:crypto");
const { cert, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("../serviceAccountKey.json");

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!email) {
  console.error("Set ADMIN_EMAIL to the email address that should receive the admin role.");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });

async function provisionAdmin() {
  const auth = getAuth();
  let user;
  let temporaryPassword;
  let created = false;

  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    temporaryPassword = `${crypto.randomBytes(24).toString("base64url")}A1!`;
    user = await auth.createUser({
      email,
      password: temporaryPassword,
      emailVerified: false,
      disabled: false,
    });
    created = true;
  }

  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    admin: true,
  });

  console.log(`Admin role assigned to ${email}.`);
  console.log("Sign out and sign back in to refresh the Firebase ID token.");
  if (created) {
    console.log(`Temporary password: ${temporaryPassword}`);
    console.log("Sign in once, then change this password from a trusted password-management flow.");
  } else {
    console.log("This Firebase Auth account already existed; its password was not changed.");
  }
}

provisionAdmin().catch((error) => {
  console.error("Failed to provision admin:", error);
  process.exitCode = 1;
});
