# File & signature questions (deferred)

Status: needs-info

File upload and signature questions are disabled in the form designer for v1. Submissions travel encrypted through QStash (see ADR-0001), whose message size limit makes base64 file payloads unworkable.

## Future direction

We have a hosted, GDPR-compliant S3-compatible object storage at IONOS (EU). A future version could:

- upload files from the embed directly to IONOS S3 via short-lived presigned URLs issued by an edge function,
- put only object keys into the submission,
- deliver files to recipients as attachments or expiring download links,
- delete objects after delivery (or after a short retention window) to keep the zero-PII promise.

Open questions: attachment vs. link, retention window, virus scanning, max file size.
