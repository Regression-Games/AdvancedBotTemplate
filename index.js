const { RGBot } = require('rg-bot');
const { RGMatchInfo } = require('rg-match-info');
const { RGCTFUtils, CTFEvent } = require('rg-ctf-utils');
const {
  handleAttackFlagCarrier,
  handleAttackNearbyOpponent,
  handleBotIdlePosition,
  handleCollectingFlag,
  handleLootingItems, handleLowHealth,
  handlePlacingBlocks, handleScoringFlag
} = require('./lib/MainLoopFunctions');

const armorManager = require('mineflayer-armor-manager')

const {
  getUnbreakableBlockIds,
  nearestTeammates,
  nameForItem
} = require('./lib/HelperFunctions')


let rgCtfUtils = null
let unbreakable = null

/**
 * This capture the flag bot covers most possibilities you could have in a main loop bot.
 * Macro level strategies and tuning are up to you.
 * @param {RGBot} bot The configurable RGBot
 */
export function configureBot(bot) {

  // Disable rg-bot debug logging.  You can enable this to see more details about rg-bot api calls
  bot.setDebug(false)

  // Allow parkour so that our bots pathfinding will jump short walls and optimize their path for sprint jumps.
  bot.allowParkour(true)

  // We recommend disabling this on as you can't dig the CTF map.  Turning this on can lead pathfinding to get stuck.
  bot.allowDigWhilePathing(false)

  // Setup the rg-ctf-utils with debug logging
  rgCtfUtils = new RGCTFUtils(bot)
  rgCtfUtils.setDebug(true)

  // Load the armor-manager plugin (https://github.com/PrismarineJS/MineflayerArmorManager)
  bot.mineflayer().loadPlugin(armorManager)

  /**
   * Information about the unbreakable block types
   * @type {number[]}
   */
  unbreakable = getUnbreakableBlockIds(bot)
  console.log(`Unbreakable blocks: ${JSON.stringify(unbreakable)}`)


  /**
   * Listeners for key events.  This bot uses these for logging information for debugging.
   * You may use these for actions, but this main loop bot does not
   */
  bot.on('match_ended', async (matchInfo) => {

    /** @type {number | undefined} */
    const points = matchInfo?.players.find(player => player.username === bot.username())?.metadata?.score
    /** @type {number | undefined} */
    const captures = matchInfo?.players.find(player => player.username === bot.username())?.metadata?.flagCaptures
    console.log(`The match has ended - I had ${captures} captures and scored ${points} points`)
  })

  bot.on('match_started', async (matchInfo) => {
    console.log(`The match has started`)
  })

  bot.on(CTFEvent.FLAG_OBTAINED, async (collector) => {
    console.log(`Flag picked up by ${collector}`)
    if (collector === bot.username()) {
      console.log('I have the flag... yippee !!!')
    }
  })

  bot.on(CTFEvent.FLAG_SCORED, async (teamName) => {
    console.log(`Flag scored by ${teamName} team`)
  })

  bot.on(CTFEvent.FLAG_AVAILABLE, async (position) => {
    console.log('Flag is available')
  })
}

/**
 * @param {RGBot} bot The configurable RGBot
 */
export async function runTurn(bot) {

  try {
    /**
     * find out which team I'm on
     * @type {string}
     */
    const myTeamName = bot.getMyTeam()

    /**
     * find my current position
     * @type {Vec3}
     */
    const myPosition = bot.position()

    // then log information about my state
    console.log(`My team: ${myTeamName}, my position: ${bot.vecToString(myPosition)}, my inventory: ${JSON.stringify(bot.getAllInventoryItems().map((item) => nameForItem(item)))}`)

    /**
     * find any teammates in range
     * @type {Entity[]}
     */
    const teamMates = nearestTeammates(bot, 33, true)

    // find any opponents within range
    /** @type {string[]} */
    const opponentNames = bot.getOpponentUsernames()
    /** @type {Entity[]} */
    const opponents = bot.findEntities({
      // opNames can be empty in practice mode where there is no other team
      // if we don't pass some array to match, then this will return all entities instead
      entityNames: (opponentNames.length === 0 && ['...']) || opponentNames,
      attackable: true,
      maxCount: 3,
      maxDistance: 33, // Bots can only see ~30 +/1 blocks, so no need to search far
      // override the default value function here as we aren't using this value in the sortValueFunction
      entityValueFunction: (entityName) => {
        return 0
      },
      // just sort them by distance for now... We'll filter them by decision point later
      sortValueFunction: (distance, entityValue, health = 0, defense = 0, toughness = 0) => {
        return distance
      }
    }).map(fr => fr.result)

    // equip my best armor
    bot.mineflayer().armorManager.equipAll()

    // Only take 1 action per main loop pass.  There are exceptions, but this is best practice as the
    // game server can only process so many actions per tick
    let didSomething = false

    if (!didSomething) {
      // Check if I'm low on health
      didSomething = await handleLowHealth(bot, rgCtfUtils, opponents, teamMates)
    }

    if (!didSomething) {
      // if someone has the flag, hunt down player with flag if it isn't a team-mate
      didSomething = await handleAttackFlagCarrier(bot, rgCtfUtils, opponents, teamMates)
    }

    if (!didSomething) {
      // do I need to attack a nearby opponent
      didSomething = await handleAttackNearbyOpponent(bot, rgCtfUtils, opponents, teamMates)
    }

    if (!didSomething) {
      // if I have the flag, go score
      didSomething = await handleScoringFlag(bot, rgCtfUtils, opponents, teamMates)
    }

    if (!didSomething) {
      // go pickup the loose flag
      didSomething = await handleCollectingFlag(bot, rgCtfUtils, opponents, teamMates)
    }

    if (!didSomething) {
      // If no-one within N blocks, place blocks
      didSomething = await handlePlacingBlocks(bot, rgCtfUtils, opponents, teamMates)
    }

    if (!didSomething) {
      // see if we can find some items to loot
      didSomething = await handleLootingItems(bot, rgCtfUtils, opponents, teamMates)
    }

    if (!didSomething) {
      // we had nothing to do ... move towards the middle
      didSomething = await handleBotIdlePosition(bot, rgCtfUtils, opponents, teamMates)
    }

  } catch (ex) {
    // if we get anything other than a pathfinding change error, log it so that we can fix our bot
    if (!(ex.toString().includes('GoalChanged') || ex.toString().includes('PathStopped'))) {
      console.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`)
      console.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`)
      console.warn(`Error during bot execution`, ex)
      console.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`)
      console.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`)
      await bot.wait(20) // wait 1 seconds before looping again to avoid tight loops on errors
    }
  }

}