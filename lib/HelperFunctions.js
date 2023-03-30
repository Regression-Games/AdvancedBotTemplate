const { RGBot } = require('rg-bot');
const { Item } = require('prismarine-item');
const { Entity } = require('prismarine-entity');
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder')

/**
 * Gets the block ids for each block type that is not breakable in the arena.
 * @param {RGBot} bot RGBot instance
 * @return {number[]}
 */
function getUnbreakableBlockIds(bot) {
    const blocksByName = bot.mcData.blocksByName
    return [
        // materials used for castles
        blocksByName.stone_bricks.id,
        blocksByName.stone_brick_slab.id,
        blocksByName.stone_brick_stairs.id,
        blocksByName.stone_brick_wall.id,
        blocksByName.ladder.id,
        blocksByName.cracked_stone_bricks.id,
        blocksByName.white_wool.id,

        // blue castle
        blocksByName.blue_wool.id,
        blocksByName.light_blue_wool.id,
        blocksByName.blue_stained_glass_pane.id,
        blocksByName.light_blue_stained_glass_pane.id,
        blocksByName.soul_torch.id,
        blocksByName.soul_wall_torch.id,
        blocksByName.soul_lantern.id,
        blocksByName.lapis_block.id,
        blocksByName.blue_glazed_terracotta.id,

        // red castle
        blocksByName.red_wool.id,
        blocksByName.pink_wool.id,
        blocksByName.red_stained_glass_pane.id,
        blocksByName.pink_stained_glass_pane.id,
        blocksByName.redstone_torch.id,
        blocksByName.redstone_wall_torch.id,
        blocksByName.lantern.id,
        blocksByName.red_glazed_terracotta.id,

        // item spawns + flag barrier
        blocksByName.polished_andesite.id,
        blocksByName.polished_andesite_slab.id,
        blocksByName.polished_andesite_stairs.id,

        // arena, obstacles, and underwater tunnel
        blocksByName.snow_block.id,
        blocksByName.snow.id,
        blocksByName.glass.id,
        blocksByName.glass_pane.id,
        blocksByName.white_stained_glass_pane.id,
        blocksByName.spruce_fence.id
    ]
}

/**
 * Finds any teammates I have within the maxDistance.  Results are sorted by closest distance from my bot.
 * Note: The bot can only see ~30 +/- blocks.  So you may have a team-mate at 40 blocks away but this API won't find them.
 * You could share information between bots via in game whispers if you want to share location information beyond the bot
 * sight range.
 *
 * @param {RGBot} bot RGBot instance
 * @param {number} [maxDistance=99]
 * @param {boolean} [botsOnly=true] whether to select only bots or also human players on the team
 * @return {Entity[]}
 */
function nearestTeammates (bot, maxDistance = 99, botsOnly = true) {
    /** @type {RGMatchInfo} */
    const theMatchInfo = bot.matchInfo()
    if (theMatchInfo) {
        /** @type {string} */
        const botName = bot.username()
        /** @type {string} */
        const teamName = bot.teamForPlayer(botName)

        console.log(`Checking for any team-mates in range: ${maxDistance}`)

        if (teamName) {
            /** @type {RGPlayer[]} */
            const teamMates = theMatchInfo.players.filter(player => player.team === teamName && (!botsOnly || player.isBot) && player.username !== botName)
            if (teamMates && teamMates.length > 0) {
                /** @type {Vec3} */
                const myPosition = bot.position()
                return bot.findEntities({
                    entityNames: teamMates.map(t => t.username),
                    attackable: true,
                    maxDistance: maxDistance
                }).map(t => t.result).sort((t1, t2) => (t1.position.distanceSquared(myPosition) - t2.position.distanceSquared(myPosition)))
            }
        }
    }
    return []
}

/**
 * @type {Vec3 | undefined}
 */
let lastMovePosition = undefined

/**
 * Handles movement from a main loop bot.  It is important NOT to change the pathfinding target every loop iteration unless
 * it really needs to change.  This function handles only updating the target when the destination has changed.
 * @param {RGBot} bot RGBot instance
 * @param {Vec3} targetPosition The pathfinding destination position
 * @param {number} [reach=1] How many blocks away from the target position should I get before pathfinding stops.
 * @param {boolean} [shouldAwait=false] should I await pathfinding (true), or let it run asynchronously in the background (false)
 * @return {Promise<boolean>}
 */
async function moveTowardPosition(bot, targetPosition, reach = 1, shouldAwait = false) {
    const isMoving = bot.mineflayer().pathfinder.isMoving()
    if(!lastMovePosition || !isMoving || targetPosition.distanceSquared(lastMovePosition) > (Math.pow(reach,2))) {
        console.log(`[Movement] Moving toward position: ${bot.vecToString(targetPosition)}, isMoving: ${isMoving}`)
        lastMovePosition = targetPosition
        if(shouldAwait ) {
            await bot.approachPosition(targetPosition, {reach:reach})
            console.log(`[Movement] Reached target position: ${bot.vecToString(targetPosition)}`)
        } else {
            // DO NOT AWAIT PATHING... WE'LL INTERRUPT IT LATER WITH A NEW TARGET IF NEED BE
            bot.mineflayer().pathfinder.goto(new goals.GoalNear(targetPosition.x, targetPosition.y, targetPosition.z, reach)).then(() => {
                console.log(`[Movement] Reached target position: ${bot.vecToString(targetPosition)}`)
                lastMovePosition = null
            }).catch((err) => {
                console.log(`[Movement] Path Changed or Errored - Did not reach target position: ${targetPosition && bot.vecToString(targetPosition)}, lastMovePosition: ${lastMovePosition && bot.vecToString(lastMovePosition)}`)
            })
        }
        return true
    } else {
        console.log(`[Movement] Not changing movement target because previous ~= new`)
    }
    return false
}

/**
 * @type {number}
 */
let lastRunTime = -1

/**
 * Used at the start of each main loop to throttle the runtime.  Minecraft server runs at 20 ticks per second (50ms per tick).
 * Thus executing our bot main loop more frequently than every 50ms would re-process stale game state.
 * Executing more often that this would waste CPU and starve the other bots on our team, which share our limited CPU resources.
 * @param {RGBot} bot
 */
async function throttleRunTime(bot) {
    let computeWaitTime = 50
    let waitTime = (lastRunTime+computeWaitTime)-Date.now()
    if( waitTime > 0 ) {
        console.log(`[Throttle] Waiting ${waitTime} millis before next loop`)
        await bot.wait(Math.round(waitTime*20/1000))
    }
    lastRunTime = Date.now()
}

// sort potions with the ones you want to use first near the front
/** @type {string[]} */
const MOVEMENT_POTIONS = ['Gotta Go Fast','Lava Swim']

/** @type {string[]} */
const COMBAT_POTIONS = ['Increased Damage Potion']

/** @type {string[]} */
const NINJA_POTIONS = ['Poison Cloud II','Poison Cloud']

/** @type {string[]} */
const HEALTH_POTIONS = ['Totem of Undying','Healing Potion','Tincture of Life','Tincture of Mending II','Tincture of Mending','Golden Apple']

/** @type {Readonly<{COMBAT: string, NINJA: string, MOVEMENT: string, HEALTH: string}>} */
const POTION_TYPE = Object.freeze({
        MOVEMENT: 'movement',
        COMBAT: 'combat',
        NINJA: 'ninja',
        HEALTH: 'health'
    }
)

/**
 * Get a potion from bot inventory of the specified type if it exists.
 * @param {RGBot} bot
 * @param {POTION_TYPE} type
 * @return {Item | undefined}
 */
function getPotionOfType(bot, type) {
    /** @type {string[]} */
    let potions = []
    switch(type) {
        case POTION_TYPE.MOVEMENT:
            potions = MOVEMENT_POTIONS;
            break;
        case POTION_TYPE.COMBAT:
            potions = COMBAT_POTIONS;
            break;
        case POTION_TYPE.NINJA:
            potions = NINJA_POTIONS;
            break;
        case POTION_TYPE.HEALTH:
            potions = HEALTH_POTIONS;
            break;
    }
    if (potions.length > 0) {
        return bot.getAllInventoryItems().find((item) => {
            return potions.includes(nameForItem(item))
        })
    }
    return undefined
}

/**
 * Holds and activates the potion item in the inventory.
 * @param {RGBot} bot
 * @param {Item} potion
 * @return {Promise<boolean>} true if a potion was used
 */
async function usePotion(bot, potion) {
    if(potion) {
        await bot.holdItem(potion.name)
        console.log(`[Potions] Using potion: ${nameForItem(potion)}`)
        bot.mineflayer().activateItem(false)
        return true
    }
    return false
}

/**
 * Holds and activates a potion in the inventory of the specified type.
 * @param {RGBot} bot
 * @param {POTION_TYPE} type
 * @return {Promise<boolean>} true if a potion was used
 */
async function usePotionOfType(bot, type) {
    return await usePotion(bot, getPotionOfType(bot, type))
}

/**
 * This will get the CustomName or DisplayName or Name for an item in that preference Order.
 * This is important for potions, where the name and displayName for the item are not unique.
 * @param {Item} item
 * @return {string}
 */
function nameForItem(item) {
    if (item.customName) {
        try {
            const json = JSON.parse(item.customName)
            return json['extra'][0]['text']
        } catch (ex) {}
    }
    return item.displayName || item.name
}

/**
 * Equip shield from inventory into off-hand if possible
 * @param {RGBot} bot
 * @return {Promise<boolean>} true if a shield was equipped
 */
async function equipShield(bot) {
    /** @type {Item} */
    const shield = bot.getAllInventoryItems().find((item) => {
        return item.displayName.includes('Shield') || item.name.includes('shield')
    })
    if (shield) {
        console.log(`[Shield] Equipping: ${shield.displayName}`)
        await bot.mineflayer().equip(shield, 'off-hand')
        return true
    }
    return false
}

/**
 * Un-equip off-hand item like a shield
 * @param {RGBot} bot
 */
async function unEquipOffHand(bot) {
    await bot.mineflayer().unequip('off-hand')
}

module.exports = {
    MOVEMENT_POTIONS,
    COMBAT_POTIONS,
    NINJA_POTIONS,
    HEALTH_POTIONS,
    POTION_TYPE,
    getUnbreakableBlockIds,
    nearestTeammates,
    moveTowardPosition,
    throttleRunTime,
    getPotionOfType,
    usePotion,
    usePotionOfType,
    nameForItem,
    equipShield,
    unEquipOffHand
}