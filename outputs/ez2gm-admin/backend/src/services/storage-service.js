import crypto from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";
import { normalizeOrderNo } from "../lib/order-number.js";

let r2Client = null;

function safeFileName(fileName) {
  return String(fileName || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "-");
}

function hasR2Credentials() {
  return Boolean(config.r2AccessKeyId && config.r2SecretAccessKey && config.r2Endpoint && config.r2Bucket);
}

function getR2Client() {
  if (!hasR2Credentials()) return null;
  if (!r2Client) {
    r2Client = new S3Client({
      region: config.r2Region,
      endpoint: config.r2Endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey
      }
    });
  }
  return r2Client;
}

export async function createSignedUpload(payload, actor) {
  const orderNo = normalizeOrderNo(payload.orderNo);
  if (!orderNo) {
    const error = new Error("orderNo is required");
    error.status = 400;
    throw error;
  }

  const fileName = safeFileName(payload.fileName);
  const fileType = payload.fileType || "proof";
  const contentType = payload.contentType || payload.mimeType || "application/octet-stream";
  const expiresIn = 10 * 60;
  const expiresAt = Date.now() + expiresIn * 1000;
  const objectKey = `${orderNo}/${fileType}/${Date.now()}-${fileName}`;
  const publicUrl = `${config.publicUploadBaseUrl}/${objectKey}`;

  if (hasR2Credentials()) {
    const command = new PutObjectCommand({
      Bucket: config.r2Bucket,
      Key: objectKey,
      ContentType: contentType,
      Metadata: {
        uploadedBy: actor.account,
        orderNo,
        fileType
      }
    });
    const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn });
    return {
      objectKey,
      bucket: config.r2Bucket,
      endpoint: config.r2Endpoint,
      uploadUrl,
      publicUrl,
      method: "PUT",
      contentType,
      storageMode: "cloudflare-r2",
      expiresAt: new Date(expiresAt).toISOString(),
      uploadedBy: actor.account
    };
  }

  const signatureBase = `${objectKey}:${expiresAt}:${actor.account}`;
  const signature = crypto.createHmac("sha256", "local-dev-secret").update(signatureBase).digest("hex");
  const uploadUrl = `${config.uploadBaseUrl}/${objectKey}?expires=${expiresAt}&signature=${signature}`;

  return {
    objectKey,
    bucket: config.r2Bucket,
    endpoint: config.r2Endpoint,
    uploadUrl,
    publicUrl,
    method: "PUT",
    contentType,
    storageMode: "local-signed-fallback",
    expiresAt: new Date(expiresAt).toISOString(),
    uploadedBy: actor.account
  };
}
