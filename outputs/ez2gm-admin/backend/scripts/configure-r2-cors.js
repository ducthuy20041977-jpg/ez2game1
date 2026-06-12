import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../src/config.js";

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} is required.`);
}

async function main() {
  requireEnv("R2_ENDPOINT", config.r2Endpoint);
  requireEnv("R2_BUCKET", config.r2Bucket);
  requireEnv("R2_ACCESS_KEY_ID", config.r2AccessKeyId);
  requireEnv("R2_SECRET_ACCESS_KEY", config.r2SecretAccessKey);

  const client = new S3Client({
    region: config.r2Region,
    endpoint: config.r2Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey
    }
  });

  await client.send(new PutBucketCorsCommand({
    Bucket: config.r2Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "HEAD", "PUT"],
          AllowedOrigins: [
            "https://ez2gm.com",
            "https://www.ez2gm.com",
            "http://localhost:8013",
            "http://127.0.0.1:8013"
          ],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600
        }
      ]
    }
  }));

  console.log(`R2 CORS configured for bucket ${config.r2Bucket}.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
