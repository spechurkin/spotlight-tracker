# 🇬🇧 Spotlight Tracker | 🇷🇺 Трекер спотлайта

**English** | [Русский](README.md)

A standalone, system-agnostic module for Foundry VTT 13 and 14 that tracks how much
table time each character receives during a session.

## Features

- select characters assigned to player users, regardless of the game system;
- hand off the spotlight by clicking a portrait or pressing **Next**;
- configure a spotlight countdown from 1 second to 180 minutes;
- accurately track time actually used based on Foundry server timestamps;
- pause, resume, restart the timer, and receive a notification when time runs out;
- see each character's share of the total time and number of spotlight turns;
- preserve world state when the window is closed and synchronize it between clients;
- let players view the tracker, with an option for the GM to disable access;
- reorder characters directly in the main window;
- keep an archive of the last 20 sessions and post the current session table to chat;
- use the module in English or Russian.

## Usage

1. Click the dedicated character-in-the-spotlight control in the left scene
   toolbar, or open the tracker from the module settings.
2. Assign a character to each player user in Foundry, then click **Roster** and
   select the characters you need. NPCs and actors available to players only
   through Owner permission do not appear in this list.
3. Set the slot duration in minutes and seconds, then click **Apply**.
4. Click the first character's portrait to start the countdown.
5. Hand off the focus to the next character by clicking their portrait or
   pressing **Next**. Their timer starts from the full configured duration.
6. Click **Post to Chat** to publish the current statistics as a table.
7. At the end of the game, click **End Session** to save the results to the
   session history.

Removing a character from the roster does not erase time already recorded for
them during the current session. Their row remains in the statistics and is
marked as **outside the roster**. If you remove the active character, the timer
pauses safely.

## Macros and API

The module API is available after the world has loaded:

```js
game.modules.get("spotlight-tracker").api.open();
game.modules.get("spotlight-tracker").api.focus(actorId);
game.modules.get("spotlight-tracker").api.next();
game.modules.get("spotlight-tracker").api.pause();
game.modules.get("spotlight-tracker").api.start();
game.modules.get("spotlight-tracker").api.setTimer(300); // five minutes
game.modules.get("spotlight-tracker").api.resetTimer();
```

Only the GM can invoke methods that change the tracker state.

## Project background

The focus-auditing concept and synchronization approach were inspired by
[dmicher Spotlight Tools](https://github.com/dkubrow-dev/dmicher-spotlight-tools).
This module was written from scratch specifically to track character table time
in Foundry VTT 13/14. No original images, sounds, or source code files were copied.

License: MIT. See [NOTICE.md](NOTICE.md) for additional attribution.
