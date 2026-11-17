# Admin and first-client setup

## Provision the first admin

Admin rights are never granted by signing up. The first person to register is not an admin. Admins are added only by running a script on the server.

1. In Render, open the web service and choose **Shell**. Locally, use a terminal in the project folder.
2. Run:
   ```
   npm run admin:grant -- you@rishari.com
   ```
3. Sign in to the app with that exact email address. Clerk must show it as verified. Your account links to the admin record automatically.

To remove admin rights: `npm run admin:revoke -- you@rishari.com`

Use an email for admin work that is never invited as a client.

## Before inviting a real client

1. Go to **Projects > Edit the data-use page**. Replace every placeholder with accurate information. Name your hosting (Render), sign-in (Clerk), file storage, and AI (OpenAI) providers. Don't state retention periods, certifications, or data residency you haven't confirmed.
2. Tick **I've reviewed this page** and save. The app won't let you mark it reviewed while placeholder text remains.

## Set up the first client

1. On **Projects**, create a project. Tick "fictional" only for test projects.
2. Open the project. Enter the client's email and choose **Create invitation link**.
3. Copy the link and send it to the client yourself. The app never sends email.
4. The client signs in with that same email address. The link works once and expires after 14 days. Creating a new link cancels the old one.
5. The client reads the welcome page, accepts the acknowledgment, and starts discovery.

## What you can do in Pass 1

- **Answers:** live answers in the client's own words, plus anything they marked for discussion or corrected.
- **Offers and scope:** decide which offers are in scope. Clients can list offers but can never change scope.
- **Notes:** private review notes labeled as confirmed information, interpretation, or assumption. Clients never see them.
- **Activity:** an audit trail of actions. It records what happened, never the client's answer text.
