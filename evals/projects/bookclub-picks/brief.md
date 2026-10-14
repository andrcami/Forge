# Brief — bookclub-picks

## Pitch

My book club of about 12 people wants a small web app to suggest books, vote on
the next pick, and see what we've read. I'll build and host it myself.

## Answers

- **Problem:** picking the next book happens in a group chat and suggestions get lost; nobody remembers what we've read.
- **Users:** club members (about 12) who suggest and vote; me as the admin who closes a vote.
- **Today's alternative:** a WhatsApp poll and a shared note.
- **Core flows:**
  1. Suggest a book — acceptance: a member adds title and author and it appears in the open list.
  2. Vote on the open suggestions — acceptance: each member has one vote per round and can change it until close.
  3. Admin closes the round — acceptance: the winner moves to "reading now" and the round resets.
  4. Browse the reading history — acceptance: every past pick is listed newest first.
- **First release:** flows 1–3. History waits.
- **Riskiest assumptions:** members will log in; a magic-link email is enough.
- **Non-goals:** no reviews or ratings, no Goodreads import, no mobile app, single club only.
- **Success:** the next three picks happen in the app, not the chat.
- **Surfaces:** a web app, used mostly on phones.
- **Brand and feel:** no brand. Feel: warm, calm, bookish. Not: corporate. Likes the feel of Notion and Literal.club. No photos of our own.
- **Interaction frequency:** members visit once or twice a week for a minute.
- **Constraints:** no budget beyond a $5/month VPS; I know TypeScript and some Python; no deadline.
- **Scale:** 12 users. Peak is everyone voting the same evening.
- **Size:** tool.

## Approvals

Approve every phase.
