const defaultR2BucketUrl = "https://img.ez2gm.com";
const configuredR2BucketUrl = process.env.R2_BUCKET_URL || defaultR2BucketUrl;
const parsedR2BucketUrl = new URL(configuredR2BucketUrl);
const parsedBucketName = parsedR2BucketUrl.pathname.split("/").filter(Boolean)[0] || "ez2gm";
const configuredR2Endpoint = (process.env.R2_ENDPOINT || "").replace(/\/+$/, "");

export const config = {
  port: Number(process.env.PORT || 8020),
  appName: "EZ2GM Operation API",
  sessionSecret: process.env.SESSION_SECRET || "ez2gm-dev-session-secret-change-before-production",
  encryptionKey: process.env.ENCRYPTION_KEY || "ez2gm-dev-encryption-key-change-before-production",
  passwordIterations: Number(process.env.PASSWORD_ITERATIONS || 210000),
  sessionTtlMs: 2 * 60 * 60 * 1000,
  r2BucketUrl: configuredR2BucketUrl.replace(/\/+$/, ""),
  r2Endpoint: configuredR2Endpoint,
  r2Bucket: process.env.R2_BUCKET || parsedBucketName,
  r2Region: process.env.R2_REGION || "auto",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  uploadBaseUrl: process.env.UPLOAD_BASE_URL || configuredR2BucketUrl.replace(/\/+$/, ""),
  publicUploadBaseUrl: (process.env.R2_PUBLIC_BASE_URL || configuredR2BucketUrl).replace(/\/+$/, ""),
  environment: process.env.NODE_ENV || "development",
  allowDevRoleHeader: process.env.ALLOW_DEV_ROLE_HEADER === "true"
};
