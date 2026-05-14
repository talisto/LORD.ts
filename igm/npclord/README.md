# NPCLord

**Daily NPC Maintenance Utility for Legend of the Red Dragon**

## Overview

NPCLord is a maintenance-only IGM that creates and manages NPC (Non-Player Character) players in LORD. It runs automatically during daily maintenance and has no player-facing UI.

NPCs autonomously engage in combat, gain stats, level up, upgrade equipment, chat at the bar, flirt, send mail, and interact with human players. Each NPC has configurable "Bloodlust," "Talkative," and "Romance" personality levels.

### Features

- Create and manage up to 150 NPC players
- Automated daily maintenance: combat, stat gains, level advancement, equipment upgrades
- NPC bar chatter and social interactions with human players
- AI mail system with pre-written messages and replies
- NPC relationships: marriage, divorce, children, romantic attachments
- Configurable personality traits per NPC
- All dialogue customizable via configuration files

## Original Credits

- **Original Author:** Joseph Masters
- **Organization:** Sons of Salami Software Group (SOS)
- **Original Version:** NPCLord v2.8 (originally NPCMaint)
- **Date:** 1995
- **License:** Shareware ($8 registration fee)

## Original Description

> NPCs can now do EVERYTHING that Humans can do!

## Configuration Files

| File | Purpose |
|------|---------|
| `AIMAIL.CFG` | Pre-written NPC mail messages |
| `AIREPLY.CFG` | AI reply phrases for responding to player mail |
| `ATTACHED.CFG` | Dialogue when NPC becomes attached to a player |
| `LOGWRITE.CFG` | Logging flags for various events |
| `POPUP.CFG` | Pop-up display text for NPC interactions |
| `NAMES.TXT` | Pool of available NPC names |
| `PHRASES.TXT` | Bar chatter dialogue database (250+ lines) |

## Porting Information

This TypeScript version was ported from the original Turbo Pascal source code. The port preserves the original NPC behavior, combat logic, and social interaction systems.

**This is an unofficial port.** It was created without the permission of the original author. The original author(s) are not affiliated with this project and should not be contacted for support regarding this port. For issues with this version, please use the lord-ts project's issue tracker.

## Version History (Original)

- **v1.0–1.1**: Initial beta; fixed negative cash bug, log writing bugs
- **v1.5**: Added random aggression/horniness levels, color fixes
- **v2.0**: Multi-NPC bar talking, romantic mail system, 150 NPC support
- **v2.1**: Improved combat, level fighting, NPC experience gain
- **v2.5**: NPCs can marry Violet, divorce, have kids; configurable personality levels; AI Response system; NPC attachments
- **v2.8**: Final version
