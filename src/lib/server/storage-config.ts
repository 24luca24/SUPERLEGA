import { S3Client } from "@aws-sdk/client-s3";
export const MAX_SERVER_UPLOAD_BYTES=4*1024*1024;
export function uploadLimit(value=process.env.FILE_SIZE):number {
  if(!value)return MAX_SERVER_UPLOAD_BYTES;
  const match=value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(B|KB|KIB|MB|MIB)?$/i);
  if(!match)throw new Error("FILE_SIZE deve indicare byte oppure una misura come 4MB.");
  const units:Record<string,number>={B:1,KB:1024,KIB:1024,MB:1024**2,MIB:1024**2};
  const bytes=Number(match[1].replace(",","."))*(units[(match[2]??"B").toUpperCase()]);
  if(!Number.isFinite(bytes)||bytes<1)throw new Error("FILE_SIZE non valido.");
  return Math.min(Math.floor(bytes),MAX_SERVER_UPLOAD_BYTES);
}
export function storageSettings(env:Record<string,string|undefined>=process.env) {
  const endpoint=env.ENDPOINT_S3?.trim();
  if(endpoint) {
    const parsed=new URL(endpoint);
    if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search)throw new Error("ENDPOINT_S3 deve essere un endpoint HTTPS senza credenziali nell’URL.");
  }
  const region=env.S3_REGION??env.AWS_REGION;
  const bucket=env.S3_BUCKET??"superlega-media";
  const accessKeyId=env.ACCESS_ID_KEY??env.S3_ACCESS_KEY_ID??env.ACTIVE_KEY??env.AWS_ACCESS_KEY_ID;
  const secretAccessKey=env.SECRET_ACCESS_KEY??env.S3_SECRET_ACCESS_KEY??env.AWS_SECRET_ACCESS_KEY;
  if(!region)throw new Error("Manca S3_REGION.");
  if((endpoint||accessKeyId||secretAccessKey)&&(!accessKeyId||!secretAccessKey))throw new Error("Servono ACCESS_ID_KEY e SECRET_ACCESS_KEY per lo storage.");
  return {endpoint,region,bucket,credentials:accessKeyId&&secretAccessKey?{accessKeyId,secretAccessKey,...(env.AWS_SESSION_TOKEN?{sessionToken:env.AWS_SESSION_TOKEN}:{})}:undefined,maxBytes:uploadLimit(env.FILE_SIZE)};
}
export function storageClient(env:Record<string,string|undefined>=process.env) {
  const settings=storageSettings(env);
  return {...settings,client:new S3Client({region:settings.region,endpoint:settings.endpoint,forcePathStyle:!!settings.endpoint,credentials:settings.credentials,requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"})};
}
