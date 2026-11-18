import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageClient } from "../src/lib/server/storage-config";
async function main() {
  const {client,bucket,endpoint}=storageClient();
  const key=`avatars/check-${randomUUID()}/pixel.png`;
  const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWuoAAAAASUVORK5CYII=","base64");
  try {
    await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:"image/png",...(endpoint?{}:{ServerSideEncryption:"AES256" as const})}));
    const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
    assert.deepEqual(Buffer.from((await object.Body?.transformToByteArray())??[]),bytes);
    const url=await getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:60});
    assert.equal((await fetch(url)).status,200);
    const unsigned=new URL(url);unsigned.search="";
    assert.notEqual((await fetch(unsigned)).status,200);
    console.log("Storage verificato: upload, lettura, URL firmato e accesso anonimo bloccato. File di prova rimosso.");
  } finally {await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));}
}
main().catch((error)=>{console.error(`Verifica storage fallita (${(error as {name?:string}).name??"errore"}). Nessuna chiave mostrata.`);process.exitCode=1;});
