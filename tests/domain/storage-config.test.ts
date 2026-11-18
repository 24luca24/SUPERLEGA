import {describe,it,expect} from "vitest";
import {storageSettings,uploadLimit,MAX_SERVER_UPLOAD_BYTES} from "@/lib/server/storage-config";
describe("configurazione storage compatibile S3",()=>{
  it("legge gli alias forniti per Supabase senza usare chiavi pubbliche",()=>{
    const settings=storageSettings({ENDPOINT_S3:"https://example.supabase.co/storage/v1/s3",S3_REGION:"eu-central-1",ACCESS_ID_KEY:"test-id",SECRET_ACCESS_KEY:"test-secret",FILE_SIZE:"2MB"});
    expect(settings.credentials).toEqual({accessKeyId:"test-id",secretAccessKey:"test-secret"});
    expect(settings.bucket).toBe("superlega-media");expect(settings.maxBytes).toBe(2*1024**2);
  });
  it("rispetta FILE_SIZE senza superare il limite del caricamento server",()=>{
    expect(uploadLimit("10MB")).toBe(MAX_SERVER_UPLOAD_BYTES);expect(uploadLimit("512KB")).toBe(512*1024);expect(()=>uploadLimit("test")).toThrow();
  });
  it("richiede entrambe le credenziali e un endpoint sicuro",()=>{
    expect(()=>storageSettings({ENDPOINT_S3:"https://example.supabase.co/storage/v1/s3",S3_REGION:"eu",ACTIVE_KEY:"id"})).toThrow(/Servono/);
    expect(()=>storageSettings({ENDPOINT_S3:"http://example.test",S3_REGION:"eu"})).toThrow(/HTTPS/);
  });
});
