import { describe, expect, it } from "vitest";
import { requestId } from "@/lib/client/request-id";
describe("identificativi sul browser LAN HTTP",()=>{
  it("usa getRandomValues quando randomUUID non è disponibile",()=>{
    const source={getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto)};
    const id=requestId(source);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(requestId(source)).not.toBe(id);
  });
  it("usa randomUUID nei contesti che lo supportano",()=>{
    const id="00000000-0000-4000-8000-000000000001" as const;
    expect(requestId({getRandomValues:crypto.getRandomValues.bind(crypto),randomUUID:()=>id})).toBe(id);
  });
});
