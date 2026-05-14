# LORD Event

**Daily Event Maintenance Utility for Legend of the Red Dragon**

## Overview

LORD Event selects one or more random events each game day and sends LORD mail to qualifying players. The mail contains stat-change codes that automatically apply when players read it, modifying stats like experience, defense, strength, HP, forest fights, PvP fights, gold, charm, and more.

Events can target specific player groups (all players, by gender, by level threshold, random chance, players with children, or based on sleeping location) and support paired events where one event triggers a second for different players.

## Original Credits

- **Original Author:** Joseph Masters
- **Organization:** Sons of Salami Software Group (SOS)
- **Original Version:** LORD Event v1.6
- **Date:** September 25, 1995
- **Extended Events:** Larry Jeans (wrote 30+ additional events and extended documentation)
- **License:** Freeware

## Original Description

> LordEvent v1.6! For L.O.R.D. v3.25+
> Create 100% configurable random daily events. Add anything, write anything, powerful editor, FREEWARE! By SOS!

## Porting Information

This TypeScript version was ported from the original Turbo Pascal source code. The port preserves the original event processing logic, targeting filters, and stat modification behavior.

**This is an unofficial port.** It was created without the permission of the original author. The original author(s) are not affiliated with this project and should not be contacted for support regarding this port. For issues with this version, please use the lord-ts project's issue tracker.

## Version History (Original)

- **v1.0**: Initial release
- **v1.5**: Fixed random event selection, added percentage display, 30 new events by Larry Jeans, editor keyboard shortcuts
- **v1.6**: Fixed negative stat handling, increased max events from 100 to 250
