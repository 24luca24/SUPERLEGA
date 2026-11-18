import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { avatarType, MAX_AVATAR_BYTES } from "@/lib/domain/avatar";
import { challengePointsFromGap } from "@/lib/domain/trophies";
describe("account e foto", () => {
  it("verifica la città senza memorizzare la password in chiaro", () => {
    const hash=hashPassword("Città Test");
    expect(hash).not.toContain("Città Test");
    expect(verifyPassword("  CITTÀ TEST ",hash)).toBe(true);
    expect(verifyPassword("altra",hash)).toBe(false);
  });
  it("rifiuta file estranei, vuoti e troppo grandi", () => {
    expect(()=>avatarType(new TextEncoder().encode('<svg onload="alert(1)">'))).toThrow();
    expect(()=>avatarType(new Uint8Array())).toThrow();
    expect(()=>avatarType(new Uint8Array(MAX_AVATAR_BYTES+1))).toThrow();
    expect(avatarType(new Uint8Array([137,80,78,71,13,10,26,10])).mime).toBe("image/png");
  });
  it("rispetta le soglie sfida 9.9, 10 e 20", () => {
    expect([9.9,10,20].map(challengePointsFromGap)).toEqual([5,10,20]);
  });
});

describe("origine richieste", () => {
  it("confronta l'host pubblico e rifiuta siti esterni", async () => {
    const {isSameOrigin,redirectUrl}=await import("@/lib/domain/request-origin");
    const local=new Request("http://localhost:3100/api/auth/login",{headers:{host:"127.0.0.1:3100",origin:"http://127.0.0.1:3100"}});
    expect(isSameOrigin(local)).toBe(true);
    expect(redirectUrl("/profilo",local).host).toBe("127.0.0.1:3100");
    expect(isSameOrigin(new Request("https://superlega.example/api",{headers:{host:"superlega.example",origin:"https://altro.example"}}))).toBe(false);
  });
});
