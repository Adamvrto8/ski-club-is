import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedPushEndpoint } from "./push.ts";

test("odber sa prijme len od známych push služieb prehliadačov", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QGx1",
    "https://wns2-db5p.notify.windows.com/w/?token=abc",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), true, endpoint);
  }

  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/abc", // bez https
    "https://fcm.googleapis.com:8443/fcm/send/abc", // iný port
    "https://evilfcm.googleapis.com.example.com/x",
    "https://notfcm.googleapis.com.evil/x",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/x",
    "https://user:pass@fcm.googleapis.com/x",
    "nie je adresa",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), false, endpoint);
  }
});
