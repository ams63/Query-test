# إجابات نماذج الخصوصية وتصنيف المحتوى

## Google Play — Data safety (أمان البيانات)
- **Does your app collect or share user data?** Yes (collects) — No data is shared with third parties for advertising.
- **Is all data encrypted in transit?** Yes (HTTPS).
- **Can users request data deletion?** Yes — in the app (Profile → Delete account) and on the web: `https://YOUR-DOMAIN/delete-account`.

| Data type | Collected | Shared | Required? | Purpose |
|---|---|---|---|---|
| Personal info → Name | Yes | No | Required | App functionality, Account management |
| Personal info → Email address | Yes | No | Required | Account management |
| Photos and videos | Yes | No | Optional | App functionality (user posts) |
| Audio → Voice recordings | Yes | No | Optional | App functionality (voice questions) |
| Location → Approximate/Precise | Yes | No | Optional | App functionality (only when attached to a question) |
| App activity → Other user-generated content | Yes | No | Required | App functionality |
| Device IDs → push token | Yes | No | Optional | App functionality (notifications) |

## Apple App Store — App Privacy
- **Data Linked to You:** Contact Info (Name, Email), User Content (Photos/Videos, Audio, Other content), Location (Precise — only when user attaches), Identifiers (User ID).
- **Used for Tracking:** None. **Third-party advertising:** None.
- **Purpose for all:** App Functionality.

## Content rating (IARC questionnaire)
- Category: Social / Communication (user-generated content).
- Users can interact / share content: **Yes**.
- Moderation: automatic filter for sexual/indecent content and religious insults, user reporting, blocking, admin review, account suspension.
- Violence / sexual content / gambling / drugs provided by the app itself: **No**.
- Expected rating: Teen / 12+ (typical for UGC apps).

## Apple review notes (App Review Information)
> Query is a Q&A app with user-generated content. Moderation: an automatic text filter blocks pornographic/indecent content and insults to religions (Arabic, English, Turkish, Spanish); users can report any question or answer and block users from the (⋯) menu; content with multiple reports is hidden automatically; admins review reports and can suspend accounts. Community rules are accepted at sign-up and shown before posting. Demo account: review@YOUR-DOMAIN / (password).
