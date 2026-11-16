---
"@flamboyantengineer/document-editor": minor
---

Lay comment cards out with compact headers: Resolve as an icon, Reopen and the opening comment's Edit and Delete in a header menu, the host's `threadActions` at the menu's end (also for readers who may not comment and for suggestions without a thread), a close button on a thread being started, indented replies, and `confirmsDelete` to delete without asking. The reply box shows on the active card only, one row high, with the `replyPlaceholder` hint; a press or focus selects a card of the panel too. A thread's opening comment is posted with the new `submitComment` label. A suggestion's card is now a thread that opens with its writer, the time, the change and the reactions to its thread, with Accept and Reject as header icons. A decided suggestion's thread says how it was decided and offers no Reopen. Bump the base component library to e56c037, whose comment menus list Edit and Delete before the host's actions.
