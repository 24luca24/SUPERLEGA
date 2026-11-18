import { CreateBucketCommand, HeadBucketCommand, PutBucketEncryptionCommand, PutBucketOwnershipControlsCommand, PutPublicAccessBlockCommand, type BucketLocationConstraint } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { storageClient } from "../src/lib/server/storage-config";
async function main() {
  const {bucket,region,client,endpoint}=storageClient();
  try { await client.send(new HeadBucketCommand({Bucket:bucket})); }
  catch(error) {
    if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404)throw error;
    await client.send(new CreateBucketCommand({Bucket:bucket,...(endpoint?{}:{ObjectOwnership:"BucketOwnerEnforced",...(region==="us-east-1"?{}:{CreateBucketConfiguration:{LocationConstraint:region as BucketLocationConstraint}})})}));
  }
  if(!endpoint) {
    await client.send(new PutPublicAccessBlockCommand({Bucket:bucket,PublicAccessBlockConfiguration:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true}}));
    await client.send(new PutBucketOwnershipControlsCommand({Bucket:bucket,OwnershipControls:{Rules:[{ObjectOwnership:"BucketOwnerEnforced"}]}}));
    await client.send(new PutBucketEncryptionCommand({Bucket:bucket,ServerSideEncryptionConfiguration:{Rules:[{ApplyServerSideEncryptionByDefault:{SSEAlgorithm:"AES256"}}]}}));
  } else if(new URL(endpoint).hostname.endsWith(".supabase.co")) {
    const connectionString=process.env.DB_PASSWORD?process.env.CONNECTION_STRING?.replace(/\[(?:YOUR-PASSWORD|PASSWORD)\]/g,encodeURIComponent(process.env.DB_PASSWORD)):process.env.CONNECTION_STRING;
    if(!connectionString)throw new Error("CONNECTION_STRING richiesta per verificare che il bucket Supabase sia privato.");
    const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:8000});
    try {const status=await pool.query("select public from storage.buckets where id=$1",[bucket]);if(!status.rowCount||status.rows[0].public)throw new Error("Il bucket deve essere privato: verificare nelle impostazioni Storage.");}
    finally {await pool.end();}
  }
  console.log("Bucket storage configurato e privato. Upload e download usano credenziali server e URL firmati.");
}
main().catch((error)=>{console.error(`Configurazione storage non completata (${(error as {name?:string}).name??"errore"}). Verificare endpoint, chiavi, regione e bucket privato.`);process.exitCode=1;});
