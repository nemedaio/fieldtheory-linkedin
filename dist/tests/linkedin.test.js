import test from "node:test";
import assert from "node:assert/strict";
import { bookmarkIdFromUrl, normalizeLinkedinUrl } from "../src/linkedin.js";
test("normalizeLinkedinUrl removes tracking params and trailing slash", () => {
    const normalized = normalizeLinkedinUrl("https://www.linkedin.com/feed/update/urn:li:activity:12345/?trk=public_post&lipi=abc");
    assert.equal(normalized, "https://www.linkedin.com/feed/update/urn:li:activity:12345");
});
test("bookmarkIdFromUrl is stable for the same canonical url", () => {
    const left = bookmarkIdFromUrl("https://www.linkedin.com/feed/update/urn:li:activity:12345");
    const right = bookmarkIdFromUrl("https://www.linkedin.com/feed/update/urn:li:activity:12345");
    assert.equal(left, right);
    assert.equal(left.length, 16);
});
