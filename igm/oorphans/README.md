# Olodrin's Orphanage

**A child adoption and trading IGM for Legend of the Red Dragon**

## Overview

Olodrin's Orphanage allows players to adopt, sell, and catch children, as well as trade them for horses. Each adopted child comes with a unique randomly generated backstory.

### Features

- **Adopt Kids**: Purchase children for adoption, with the price doubling for each child you already have
- **Give Up for Adoption**: Sell children back to the orphanage for a fixed low payout that cannot be farmed into a level-scaling profit loop
- **Catch Feral Children**: Hunt down wild children in the fields (with risk of failure and injury), but only childless players can gain a child from this route
- **Trade for Horses**: Exchange children for horses, with the trade requirement capped alongside the orphanage household limit
- **Unique Backstories**: Each child has a randomly generated name, guardian relationship, and story of how their previous guardian died
- **Household Limit**: The orphanage refuses to place more than 12 children with the same player

## Original Credits

- **Original Author:** Underminer
- **Contact:** DOVE-net / The Undermine BBS (telnet://bbs.undermine.ca:423)
- **Original Version:** Olodrin's Orphanage v0.1
- **Platform:** LORD 5.00 JS (Synchronet BBS)
- **License:** Freeware ("provided to use at your own risk")

## Original Description

> Olodrin's Orphanage is simple in scope: it allows players to Adopt (Buy), or Give Up for Adoption (Sell) children. There is also the option to try and catch feral children in the wild, but bad things can happen if you miss. Finally, there is an option to trade children for a Horse.
>
> All costs scale with a player's level in order to try to avoid abuse by high level players.

## Porting Information

This TypeScript version was ported from the Synchronet BBS JavaScript version.

This port intentionally rebalances the original child economy. The original IGM used only level-based pricing and had no practical child limit, which made it unsafe once children started feeding forest fights, bank income, and other systems in lord-ts.

**This is an unofficial port.** It was created without the permission of the original author. The original author is not affiliated with this project and should not be contacted for support regarding this port. For issues with this version, please use the lord-ts project's issue tracker.

## Data Files

| File | Purpose |
|------|---------|
| `boynames.dat` | Pool of boy names for randomly generated children |
| `girlnames.dat` | Pool of girl names for randomly generated children |
| `howdied.dat` | Descriptions of how the child's previous guardian died |
