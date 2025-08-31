import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandInput,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { v4 as uuidv4 } from "uuid"
import dotenv from "dotenv"

dotenv.config()

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
})

export async function uploadBufferToS3(
  task_id: string,
  buffer: Buffer,
  keyPrefix = "pdf",
  mimeType = "application/pdf"
): Promise<string> {
  const filename = `${keyPrefix}/${task_id}.pdf`
  const bucket = process.env.S3_BUCKET_NAME as string

  const uploadParams: PutObjectCommandInput = {
    Bucket: bucket,
    Key: filename,
    Body: buffer,
    ContentType: mimeType,
  }

  await s3.send(new PutObjectCommand(uploadParams))

  // Create a signed URL that expires in 10 minutes
  const signedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: filename }),
    { expiresIn: 600 } // 600 seconds = 10 mins
  )

  console.log(signedUrl)

  return signedUrl
}
