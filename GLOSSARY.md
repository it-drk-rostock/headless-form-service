# Headless Form Service

Teams design forms, embed them in external websites (TYPO3), and receive each filled-in form as an email, without the service keeping the answers.

## Tenancy & People

**Team**:
A group of staff (typically a department) that owns forms and is the boundary of what its members can see and change.
_Avoid_: Workspace, tenant, organisation

**Team Admin**:
A team member who can additionally manage who is in their team: invite people, change their roles, remove them, and send them a new set-password link.

**Team Member**:
A person belonging to a team who can create, edit and publish that team's forms.

**Super Admin**:
A person with authority over every team, who creates teams and manages global settings.

**Audit Log**:
The append-only record of security-relevant actions (who did what, to which team's entities, and when), readable by a team's Team Admins and by Super Admins.
_Avoid_: History, activity feed (form versions have their own history)

## Forms

**Form**:
A named questionnaire owned by a team, together with the rules for how its submissions are delivered.
_Avoid_: Survey, questionnaire (in code and docs)

**Draft**:
The single, editable working copy of a form's questions and email template, which visitors never see.

**Form Version**:
An immutable, numbered snapshot of a form's questions and email template, created by publishing the draft.
_Avoid_: Revision, schema (when meaning the whole snapshot)

**Current Version**:
The form version that visitors are served right now.
_Avoid_: Active version, live version

**Publishing**:
Freezing the draft into a new form version and making it the current version.

**Restoring**:
Copying an earlier form version back into the draft so it can be published again as a new version.
_Avoid_: Rollback, revert

**Discarding Changes**:
Resetting the draft to the current version, throwing away unpublished edits.

**Closed Form**:
A form temporarily not accepting submissions; its embed shows a closed notice.
_Avoid_: Inactive, disabled

**Archived Form**:
A form retired for good: hidden from lists, refusing loads and submissions, but keeping its history and statistics.
_Avoid_: Deleted

**Form Page**:
The website page that hosts a form's embed, used to build form pass links.

**Public Form**:
A form anyone can fill in.

**Protected Form**:
A form that can only be filled in by someone holding a valid form pass.

## Access

**Form Pass**:
A secret, link-borne permission to fill in one specific protected form, optionally limited in uses and time.
_Avoid_: Access token, form token, voucher (collides with login tokens)

**Use Limit**:
The maximum number of submissions a form pass allows; a single-use pass has a use limit of one.

**Revoking**:
Permanently invalidating a form pass before it is used up or expires.

**Pass Metadata**:
Non-personal context attached to a form pass (e.g. a ticket or campaign ID) that is carried into the notification email.

## Submissions & Delivery

**Submission**:
One visitor's completed answers to a form version, which exists only in transit and is never stored by the service.
_Avoid_: Response, entry, record

**Accepted Submission**:
A submission the service has taken responsibility for delivering; to the visitor, accepted means sent.
_Avoid_: Queued (in user-facing text), delivered

**Notification Email**:
The email that delivers one submission to the form's recipients.

**Recipient**:
A fixed email address configured on a form that receives its notification emails.
_Avoid_: Team inbox

**Reply-To Field**:
A question of the form whose answer (an email address) becomes the reply address of the notification email.

**Delivery Failure**:
A submission whose notification email could not be sent after all retries; it can be retried for a limited time.

**Allowed Recipient Domain**:
An email domain on the global list that recipients must belong to.

**Sender**:
The single verified address all notification emails come from, shown with a per-form display name.

**Email Template**:
The subject and body layout of a notification email, part of each form version.

**Placeholder**:
A named slot in an email template that is replaced by a submission answer, pass metadata, form property, or system value; each source has its own namespace.
_Avoid_: Variable, tag, merge field

**Answers Table**:
A system placeholder that renders all non-empty answers of a submission as a question/answer table.

**Standard Layout**:
The fixed, DRK Rostock-branded email layout whose body staff edit in a visual editor.

**Custom HTML Template**:
An email template written entirely in HTML by its author, as an alternative to the standard layout.

## Embedding

**Embed**:
The snippet placed on an external website page that loads and displays a form and sends its submissions.
_Avoid_: Widget, runner

**Allowed Origin**:
A website address on the global list of sites permitted to embed forms.
