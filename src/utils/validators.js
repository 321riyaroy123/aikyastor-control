// validators.js - extracted from the inline validation in ObjectStorage.createBucket()

const BUCKET_NAME_RE = /^[a-z0-9-]{3,63}$/;

/**
 * Validate a candidate bucket name against existing buckets.
 * Returns an error string, or "" if valid.
 */
export function validateBucketName(name, existingBuckets = []) {
  if (!name.trim()) return "Bucket name is required";
  if (!BUCKET_NAME_RE.test(name)) return "Lowercase letters, numbers, hyphens only. 3–63 chars.";
  if (existingBuckets.find(b => b.name === name)) return `Bucket '${name}' already exists`;
  return "";
}
