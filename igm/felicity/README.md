# Felicity's Temple

**A temple adventure IGM for Legend of the Red Dragon**

## Overview

Felicity's Temple adds a new temple location to LORD with multiple interactive areas. Players can explore the temple interior, pray at statues, interact with a magical fountain, discover secret rooms, and play an arcade game.

### Features

- **Temple Interior**: Meet Felicity and her disciples (Akasha and Turin)
- **Statue Room**: Pray to three statues (Vindicator, Faethor, Karadoc) for stat changes
- **Fountain**: Interact with a magical fountain (once per day)
- **Behind the Temple**: Search for hidden treasures
- **Prayer Rooms**: Spiritual interactions with various effects
- **Secret Areas**: Janitor's Room (help the janitor, search lost & found) and a hidden Storage Room with a rebalanced nursery economy
- **Arcade**: Warrior's Revenge game with top-ten score tracking
- **NPC Interactions**: Daily-limited encounters with stat and resource effects

### Nursery Balance

- **Household Limit**: The nursery refuses to place more than 12 children with the same player
- **Escalating Adoption Cost**: The adoption price doubles for each child you already have
- **Fixed Resale Value**: Giving up a child always pays 250,000 gold instead of scaling upward with player wealth or progression

## Original Credits

- **Original Author:** Lloyd Hannesson
- **Organization:** Tech'N Software Group
- **Original Version:** Felicity's Temple v2.1
- **Copyright:** 1995–2002 Lloyd Hannesson
- **Contact:** dasme@dasme.org
- **License:** Freeware (no registration required, donations accepted)

## Original Description

> Felicity's Temple is an IGM (In Game Module) for the popular door game Legend Of The Red Dragon by Seth Able Robinson. This is basically an add-on Temple that can be accessed by The (O)ther menu in Lord Ver3.26 or Later. You can meet new people, or die :> The choice is yours!

## Porting Information

This TypeScript version was reverse-engineered from the original DOS executable, a Borland Pascal binary. The decompiled output and original documentation served as references for the port.

This port intentionally rebalances the nursery economy. The original child-related rewards combine with lord-ts systems such as daily forest fights and Seth child-support bank deposits, so the nursery now limits household size and raises costs sharply as families grow.

**This is an unofficial port.** It was created without the permission of the original author. The original author is not affiliated with this project and should not be contacted for support regarding this port. For issues with this version, please use the lord-ts project's issue tracker.

## Version History (Original)

- **v2.1** (01/25/02): Final release; fixed fairy loss bug on exit
- **v2.0** (10/17/00): P200+ processor support, screentype bug fix, experience rollover fix, key support, stat viewing, cheat prevention, improved data integrity
