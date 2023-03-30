const { RGBot } = require('rg-bot');
const { Entity } = require('prismarine-entity');
const { Block } = require('prismarine-block');
const { Vec3 } = require('vec3');
const { RGCTFUtils } = require('rg-ctf-utils');
const {
    POTION_TYPE,
    moveTowardPosition,
    usePotionOfType,
    getPotionOfType,
    usePotion
} = require('./HelperFunctions')

/**
 * @param {RGBot} bot
 * @param {RGCTFUtils} rgCtfUtils
 * @param {Entity[]} opponents
 * @param {Entity[]} teamMates
 * @return {Promise<boolean>}
 */
async function handleLowHealth(bot, rgCtfUtils, opponents, teamMates) {
    if (bot.mineflayer().health <= 7) {
        // near death, see if I can use a potion to make the opponent die with me
        /** @type {Entity} */
        const nearOpponent = opponents.find(them => {
            // within ~4 blocks away
            return them.position.distanceSquared(bot.position()) <= 16
        })
        if (nearOpponent) {
            const potion = getPotionOfType(bot, 'ninja')
            if (potion) {
                // look at their feet before throwing down a ninja potion
                await bot.mineflayer().lookAt(nearOpponent.position.offset(0, -1, 0))
                return await usePotion(bot, potion)
            }
        }
    } else if (bot.mineflayer().health <= 15) {
        // just need a top-up
        console.log(`[Health] Need to use potion while my health is low`)
        return await usePotionOfType(bot, POTION_TYPE.HEALTH)
    }
    return false
}

/**
 * @param {RGBot} bot
 * @param {RGCTFUtils} rgCtfUtils
 * @param {Entity[]} opponents
 * @param {Entity[]} teamMates
 * @return {Promise<boolean>}
 */
async function handleAttackFlagCarrier(bot, rgCtfUtils, opponents, teamMates) {
    // find out if the flag is available
    /** @type {Vec3} */
    const flagLocation = rgCtfUtils.getFlagLocation()
    if (!flagLocation) {
        console.log(`Checking ${opponents.length} opponents in range for flag carriers`)

        // see if one of these opponents is holding the flag
        /** @type {Entity} */
        const opponentWithFlag = opponents.filter(them => {
            if (them.heldItem && them.heldItem.name.includes(rgCtfUtils.FLAG_SUFFIX)) {
                console.log(`Player ${them.name} is holding the flag`)
                return true
            }
        })?.shift()
        if (opponentWithFlag) {
            console.log(`Attacking flag carrier ${opponentWithFlag.name} at position: ${bot.vecToString(opponentWithFlag.position)}`)
            await usePotionOfType(bot, POTION_TYPE.MOVEMENT) // run faster to get them
            // TODO: Once I get in range of attack, should I use a combat potion ? should I equip a shield ?
            await bot.attackEntity(opponentWithFlag)
            return true
        }
    }
    return false
}

/**
 * @param {RGBot} bot
 * @param {RGCTFUtils} rgCtfUtils
 * @param {Entity[]} opponents
 * @param {Entity[]}teamMates
 * @return {Promise<boolean>}
 */
async function handleAttackNearbyOpponent(bot, rgCtfUtils, opponents, teamMates) {
    /** @type {boolean} */
    const outnumbered = teamMates.length + 1 < opponents.length
    /** @type {boolean} */
    const yolo = teamMates.length === 0
    /** @type {Vec3} */
    const myPosition = bot.position()

    // opportunistically kill any player in close range even if that means dropping the flag to do it
    /** @type {Entity[]} */
    const theOpponents = opponents.filter( (op) => {
        // within range 10 regular, 5 if I have the flag
        return op.position.distanceSquared(myPosition) <= (rgCtfUtils.hasFlag() ? 25 : 100)
    })

    console.log(`Checking ${theOpponents.length} opponents in range to murder`)
    if (theOpponents.length > 0) {
        /** @type {Entity} */
        const firstOpponent = theOpponents[0]

        // Attack if a teammate is nearby only, otherwise move toward team-mate
        if (!outnumbered || yolo) {
            console.log(`Attacking opponent at position: ${bot.vecToString(firstOpponent.position)}`)
            // TODO: Once I get in range of attack, should I use a combat potion ? should I equip a shield ?
            await bot.attackEntity(firstOpponent)
            return true
        } else {
            console.log(`Outnumbered, running to nearest team-mate for help`)
            // TODO: Do I need to use potions ? un-equip my shield to run faster ?
            await moveTowardPosition(bot, teamMates[0].position, 3)
            return true
        }
    }
    return false
}

/**
 * @param {RGBot} bot
 * @param {RGCTFUtils} rgCtfUtils
 * @param {Entity[]} opponents
 * @param {Entity[]}teamMates
 * @return {Promise<boolean>}
 */
async function handleScoringFlag(bot, rgCtfUtils, opponents, teamMates) {
    if( rgCtfUtils.hasFlag() ) {
        // TODO: Do I need to use potions ? un-equip my shield to run faster ?
        console.log(`I have the flag, running to score`)
        /** @type {string} */
        const myTeamName = bot.getMyTeam()
        /** @type {Vec3} */
        const myScoreLocation = myTeamName === 'BLUE' ? rgCtfUtils.BLUE_SCORE_LOCATION : rgCtfUtils.RED_SCORE_LOCATION
        await moveTowardPosition(bot, myScoreLocation, 1)
        return true
    }
    return false
}

/**
 * @param {RGBot} bot
 * @param {RGCTFUtils} rgCtfUtils
 * @param {Entity[]} opponents
 * @param {Entity[]}teamMates
 * @return {Promise<boolean>}
 */
async function handleCollectingFlag(bot, rgCtfUtils, opponents, teamMates) {
    /** @type {Vec3} */
    const flagLocation = rgCtfUtils.getFlagLocation()
    if (flagLocation) {
        console.log(`Moving toward the flag at ${bot.vecToString(flagLocation)}`)
        // TODO: Do I need to use potions ? un-equip my shield to run faster ?
        await moveTowardPosition(bot, flagLocation, 1)
        return true
    }
    return false
}

/** @type {string[]} */
const placeableBlockDisplayNames = ['Gravel', 'Grass Block', 'Dirt', 'Stripped Dark Oak Wood']

/** @type {Vec3[]} */
const blue_block_placements = [
    // bridge blockade
    new Vec3(81,65,-387),
    new Vec3(81, 66, -387),
    new Vec3(81,65,-385),
    new Vec3(81, 66, -385)
]

/** @type {Vec3[]} */
const red_block_placements = [
    // bridge blockade
    new Vec3(111,65,-387),
    new Vec3(111, 66, -387),
    new Vec3(111,65,-385),
    new Vec3(111, 66, -385)
]

/**
 * @param {RGBot} bot
 * @param {RGCTFUtils} rgCtfUtils
 * @param {Entity[]} opponents
 * @param {Entity[]}teamMates
 * @return {Promise<boolean>}
 */
async function handlePlacingBlocks(bot, rgCtfUtils, opponents, teamMates) {
    /** @type {Vec3} */
    const myPosition = bot.position()
    /** @type {string} */
    const myTeamName = bot.getMyTeam()
    /** @type {Entity[]} */
    const theOpponents = opponents.filter((op) => {
        // only consider bots on the same y plane not those down in the tunnel
        return (Math.abs(op.position.y - myPosition.y) < 5)
    }).filter((op) => {
        // only consider opponents within range ~15
        return op.position.distanceSquared(myPosition) <= 225
    })

    console.log(`Checking ${theOpponents.length} opponents in range before getting items or placing blocks`)
    if (theOpponents.length === 0) {

        // If I have blocks to place, go place blocks at strategic locations if they aren't already filled
        /** @type {Item} */
        const blockInInventory = bot.getAllInventoryItems().find(item => {
            return placeableBlockDisplayNames.includes(item.displayName)
        })

        if (blockInInventory) {
            console.log(`I have a '${blockInInventory.displayName}' block to place`)
            /** @type {Vec3[]} */
            const block_placements = myTeamName === 'BLUE' ? blue_block_placements : red_block_placements
            for (const location of block_placements) {
                // if I'm within 20 blocks of a place to put blocks
                /** @type {Block} */
                const block = bot.mineflayer().blockAt(location)
                /** @type {number} */
                const rangeSq = location.distanceSquared(myPosition)
                console.log(`Checking for block: ${block && block.type} at rangeSq: ${rangeSq}`)
                if (rangeSq <= 400) {
                    if (!block || block.type === 0 /*air*/) {
                        console.log(`Moving to place block '${blockInInventory.displayName}' at: ${location}`)
                        await moveTowardPosition(bot, location, 3)
                        // if I'm close, then place the block
                        if (location.distanceSquared(myPosition) < 15) {
                            console.log(`Placing block '${blockInInventory.displayName}' at: ${location}`)
                            // TODO: RGBot.placeBlock should handle this for us once a defect is fixed
                            await bot.mineflayer().equip(blockInInventory, 'hand')
                            // place block on top face of the block under our target
                            await bot.mineflayer().placeBlock(bot.mineflayer().blockAt(location.offset(0, -1, 0)), new Vec3(0, 1, 0))
                        }
                        return true
                    }
                }
            }
        } else {
            console.log(`No placeable blocks in inventory`)
        }
    }
    return false
}

/**
 * @param {RGBot} bot
 * @param {RGCTFUtils} rgCtfUtils
 * @param {Entity[]} opponents
 * @param {Entity[]}teamMates
 * @return {Promise<boolean>}
 */
async function handleLootingItems(bot, rgCtfUtils, opponents, teamMates) {
    /** @type {Vec3} */
    const myPosition = bot.position()
    /** @type {Item} */
    const item = bot.findItemsOnGround({
        maxDistance: 33,
        maxCount: 5,
        // prioritize items I don't have that are the closest
        itemValueFunction: (blockName) => {
            return bot.inventoryContainsItem(blockName) ? 999999 : 1
        },
        sortValueFunction: (distance, pointValue) => {
            return distance * pointValue
        }
    }).filter((theItem) => {
        // TODO: Should I let my bots run down into the tunnel for better loot ?
        // or keep them on the top only
        return (Math.abs(theItem.result.position.y - myPosition.y) < 5)
    }).map(t => t.result)?.shift()

    if (item) {
        console.log(`Going to collect item: ${item.name} at: ${bot.vecToString(item.position)}`)
        //TODO: Do I need to use potions ? un-equip my shield to run faster ?
        await moveTowardPosition(bot, item.position, 1)
        return true
    }
    return false
}

/**
 * @param {RGBot} bot
 * @param {RGCTFUtils} rgCtfUtils
 * @param {Entity[]} opponents
 * @param {Entity[]}teamMates
 * @return {Promise<boolean>}
 */
async function handleBotIdlePosition(bot, rgCtfUtils, opponents, teamMates) {
    // TODO: Is this really the best place to move my bot towards ?
    // Hint: This is where most of Macro game strategy gets implemented
    // Do my bots spread out to key points looking for items or opponents ?
    // Do my bots group up to control key areas of the map ?
    // Do those areas of the map change dependent on where the flag currently is ?
    console.log(`Moving toward center point: ${bot.vecToString(rgCtfUtils.FLAG_SPAWN)}`)
    await moveTowardPosition(bot, rgCtfUtils.FLAG_SPAWN, 1)
    return true
}

module.exports = {
    handleLowHealth,
    handleAttackFlagCarrier,
    handleAttackNearbyOpponent,
    handleScoringFlag,
    handleCollectingFlag,
    handlePlacingBlocks,
    handleLootingItems,
    handleBotIdlePosition
}