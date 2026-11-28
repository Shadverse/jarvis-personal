# SHADVERSE CREATOR BOOTSTRAP

This private realm is empty until the authorized Creator imports approved facts. It belongs to one account, and an existing realm cannot be overwritten by changing the configured username. It is not part of customer or shared provider storage.

Set `JARVIS_BOOTSTRAP_CREATOR` to the exact Creator account if it differs from the primary Gateway Creator. Use Creator administration → **SHADVERSE CREATOR BOOTSTRAP** to load the current package or empty template, choose a JSON file, review it and replace the current revision. Export is available only to that same authenticated account. Export contains the current package without internal identifiers. Keep backups of earlier packages in Creator-controlled private storage. The product holds only the current revision.

Envelope `{"schemaVersion":1,"sections":{}}` defines an empty package. Add these optional sections as arrays:

- `organization`, `creator`, `projects`, `milestones`, `decisions`, `preferences`.
- `businessRules`, `infrastructure`, `checkpoints`, `tasks`, `skills`.

Each record requires a stable ASCII `id`, a `title` of up to 100 characters and approved `text` of up to 500 characters. A non-project record may set `projectId` to an existing organizational project ID. A project may set `relatedProjectIds` and a unique `workspaceProjectId` for an existing owned product project. All sections are bounded. Infrastructure records contain names and descriptions, never secrets. Skill entries describe approved knowledge and cannot activate tools.

Enable **Search Creator Bootstrap** for a question and run **Find relevant memory**. Only personal-scope records or entries mapped to the selected project are ranked. The user reviews the exact excerpts before Send. The server compares source IDs and revision again and routes reviewed context through the existing isolated shared-context conversation. The same selection and contract apply independently of the model route. Product identity is supplied as an OpenResponses instruction, with no invented personal facts.

For local fixtures use synthetic records. Release-candidate acceptance should check the Creator-only boundary, stale preview rejection, successful exact selection and revocation before using genuine private data.
