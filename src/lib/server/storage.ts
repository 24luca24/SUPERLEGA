import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageClient } from "./storage-config";
import { randomUUID } from "node:crypto";
import { avatarType } from "@/lib/domain/avatar";

export async function uploadAvatar(userId: string, bytes: Uint8Array) {
  const { bucket, client, maxBytes, endpoint } = storageClient();
  const type = avatarType(bytes,maxBytes);
  const key = `avatars/${userId}/${randomUUID()}.${type.extension}`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: type.mime, ...(endpoint?{}:{ServerSideEncryption: "AES256" as const}), CacheControl: "private, max-age=300" }));
  return key;
}
export async function avatarUrl(key: string) {
  const { bucket, client } = storageClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
}
export async function deleteAvatar(key: string) {
  const { bucket, client } = storageClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
