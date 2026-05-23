# L.O.R.D. Cavern

**A random-event cave exploration IGM for Legend of the Red Dragon**

## Overview

L.O.R.D. Cavern is a random-event exploration IGM where players venture into a cave and encounter a wide variety of interactive experiences. With 14 different event types and configurable daily search limits, the cave offers puzzles, combat, treasure hunting, and unique character encounters.

### Features

- **14 Random Event Types**: Including the Voice, Falls, Bats, River crossings, Skeleton encounters, Monster battles, the Riddler, a Bridge Keeper (Troll), and more
- **Interactive Puzzles**: Bridge Keeper riddles and the Riddler's questions test player knowledge
- **Kid Adoption**: Find and adopt Oliver (up to 4 kids per visit)
- **Child Reward Limits**: Both Oliver and scripted child-award encounters now honor the cave's 16-child family cap
- **Equipment Trading**: Exchange weapons and armor with Skeleton encounters
- **Magical Events**: Fairy saves, horses appearing on exit, shiny river discoveries
- **Configurable**: 10–15 cave searches per day (sysop configurable)
- **RHP Scripting**: Supports custom events via the Random Happening Program scripting system
- **Multinode Support**: Works with LORD's drop-file system

### Event Probability Distribution

| Event | Chance |
|-------|--------|
| Nothing | 10% |
| RHP Scripts | 20% |
| Riddler | 7% |
| Troll (Bridge Keeper) | 7% |
| Voice | 6% |
| Fall | 7% |
| Bats | 6% |
| River | 7% |
| Shiny River | 7% |
| Skeleton | 6% |
| Monster | 6% |
| Trip | 5% |
| Find Oliver (kid) | 3% |
| Warrior | 3% |

## Original Credits

- **Original Author:** Jason Brown
- **Maintainer:** Donald Tidmore (2002–2005)
- **Original Version:** L.O.R.D. Cavern v1.7
- **Date:** 1995–2005
- **Compiled With:** Borland Pascal 7.01, DDIGM v1.01 by Steven Lorenz
- **License:** Freeware

## Original Description

> I wanted to write an IGM. So here it is. I've seen random event IGMs before, but not with this range of events! Some just give or take, others make the player make a choice, and still more test intellect. A well rounded mix, if you ask me.
> - Jason Brown

## Porting Information

This TypeScript version was reverse-engineered from the original DOS executable, a Borland Pascal binary.

This port intentionally keeps LordCave's child-granting encounters aligned with its built-in family cap. Scripted `@KIDS@` rewards are clamped to the same 16-child limit used by the main Oliver adoption event.

**This is an unofficial port.** It was created without the permission of the original author(s). The original author(s) are not affiliated with this project and should not be contacted for support regarding this port. For issues with this version, please use the lord-ts project's issue tracker.

## Version History (Original)

- **v1.7** (Jun 2005): Internal code updates, Gryphon monster added, Usage Reports
- **v1.6** (Nov 2003): New River event, expanded weapon/armor support, new riddles
- **v1.3** (2000–2002): RHP scripting system added
- **v1.2** (1999): Added intro ANSI, better randomization, kid limiters
- **v1.0–v1.1** (1995–1998): Alpha and beta testing
