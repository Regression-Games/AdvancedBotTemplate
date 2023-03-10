import { RGBot } from "rg-bot";
import RGCTFUtils, { CTFEvent } from "rg-ctf-utils";
import { Vec3 } from "vec3";

/**
 * This strategy is the simplest example of how to get started 
 * with the rg-bot and rg-ctf-utils packages. The Bot will get 
 * the flag and then run back to base to score.
 * 
 * Ways to extend this code:
 * TODO: What happens when a bot is completing an action and 
 *       another event happens?
 * TODO: How do we respond to item spawn and drop events?
 * TODO: How do we target and attack enemies?
 * TODO: What different states is my bot in, and how can I organize
 *       its behavior based on these states?
 * rg-bot docs: https://github.com/Regression-Games/RegressionBot/blob/main/docs/api.md
 * rg-ctf-utils docs: https://github.com/Regression-Games/rg-ctf-utils
 * @param {RGBot} bot The configurable RGBot
 */
export function configureBot(bot) {

  // Since most blocks can't be broken on Arctic Algorithm Field,
  // don't allow digging while pathfinding
  bot.allowDigWhilePathing(false);

  // Instantiate our helper utilities and events for Capture the Flag
  const rgctfUtils = new RGCTFUtils(bot);

  // track how many times we've died
  let deaths = 0

  bot.on('death', () => {
    console.log("I have died...")
    ++deaths;
    try {
      // stop any current pathfinding goal
      // @ts-ignore
      bot.mineflayer().pathfinder.setGoal(null)
      // @ts-ignore
      bot.mineflayer().pathfinder.stop()
    } catch (ex) {

    }
  })

  bot.on('spawn', async () => {
    await rgctfUtils.approachFlag();
  });

  // When a player obtains the flag, this event gets called.
  // In the case where that player is this bot, the bot
  // navigates back to their scoring location.
  bot.on(CTFEvent.FLAG_OBTAINED, async (collector) => {
    if (collector == bot.username()) {
      await rgctfUtils.scoreFlag()
    }
  });

  let isCollectingItems = false;

  // If the flag was scored, collect items until the flag is available
  bot.on(CTFEvent.FLAG_SCORED, async (teamName) => {
    let previousDeaths = deaths
    const codeStillRunning = () => { return previousDeaths === deaths }
    bot.chat(`Flag scored by ${teamName} team, collecting items until new flag is here`)
    isCollectingItems = true;
    while (rgctfUtils.getFlagLocation() === null && codeStillRunning()) {
      await bot.findAndCollectItemsOnGround();
      await bot.waitForMilliseconds(500);
    }
    isCollectingItems = false;
    if (codeStillRunning()) await rgctfUtils.approachFlag();
  })

  // Once the flag respawns on the map, look for and approach the flag, only if
  // we are not busy collecting items
  bot.on(CTFEvent.FLAG_AVAILABLE, async (position) => {
    if (!isCollectingItems) {
      bot.chat("Flag is available, going to get it")
      await rgctfUtils.approachFlag();
    }
  })

}