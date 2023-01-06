/**
 * This strategy is an advanced example of how to customize movements, place blocks, and craft items with the rg-bot package.
 * The Bot will collect coal until it has 100 points-worth of items in its inventory.
 * (Note: Coal_Ore and apples are each worth 1 point.  Why apples you say?  Apples are a possible byproduct from collecting the logs to create new pickaxes.)
 *
 * @param {RGBot} bot
 */
function configureBot(bot) {

    bot.setDebug(true);
    
    // This function will make the Bot chop + pick up a Coal Ore.
    async function gatherCoal() {
        await gatherEntity('coal_ore')
    }

    // This function will make the Bot chop + pick up a Spruce Log.
    async function gatherLog() {
        await gatherEntity('spruce_log')
    }

    // This function will make the Bot chop + pick up a named entity.
    async function gatherEntity(entityName) {

        // Track whether the Bot encountered any issues while chopping.
        // There are so many things around the spawn area that it can
        // simply try to chop a different one
        let skipCurrentEntity = false;
        const countBefore = bot.getInventoryItemQuantity(entityName);

        // Ensure that if the Bot fails to gather the dropped item,
        // it will try collecting another until its inventory reflects one has been picked up
        while (bot.getInventoryItemQuantity(entityName) <= countBefore) {
            const foundEntity = await bot.findBlock(entityName, {skipClosest: skipCurrentEntity});
            if (foundEntity) {
                // If the Bot located one, then go chop it
                const success = await bot.findAndDigBlock(entityName, {skipClosest: skipCurrentEntity});
                if (!success) {
                    // If anything prevents the Bot from breaking the block,
                    // then find the next-closest and try gathering that instead.
                    skipCurrentEntity = true;
                } else {
                    skipCurrentEntity = false;
                }
            } else {
                skipCurrentEntity = false;
                // If the Bot didn't find any nearby,
                // then allow it to wander a bit and look again.
                // This loop makes sure it completes the 'wander' movement.
                let didWander = false;
                while (!didWander) {
                    didWander = await bot.wander();
                }
            }
        }
    }

    // The bot will announce whenever it collects ore or an apple
    bot.on('playerCollect', async (collector, collected) => {
        const itemName = bot.getEntityName(collected).toLowerCase();
        if (collector.username === bot.mineflayer().username && (itemName.includes('ore') || itemName === 'apple')) {
            bot.chat(`I collected a(n) ${itemName}`);
        }
    });

    async function craftTable() {
        // If the Bot doesn't already have a craftingTable, then 4 planks are needed to craft one.
        // The Bot can get planks from 1 log if needed.
        if (!bot.inventoryContainsItem('crafting_table')) {
            if (!bot.inventoryContainsItem('spruce_planks', { quantity: 4 })) {
                if (!bot.inventoryContainsItem('spruce_log')) {
                    await gatherLog();
                }
                await bot.craftItem('spruce_planks');
            }
            await bot.craftItem('crafting_table');
        }
    }

    async function craftSticks() {
        // If the Bot doesn't have 4 sticks, then 2 planks are needed to craft them.
        // The Bot can get planks from 1 log if needed.
        if (!bot.inventoryContainsItem('stick', { quantity: 4 })) {
            if (!bot.inventoryContainsItem('spuce_planks', { quantity: 2 })) {
                if (!bot.inventoryContainsItem('spruce_log')) {
                    await gatherLog();
                }
                await bot.craftItem('spruce_planks');
            }
            await bot.craftItem('stick');
        }
    }

    async function craftPlanks() {
        // If the Bot doesn't have 6 spruce planks, then 2 logs are needed to craft them.
        if (!bot.inventoryContainsItem('spruce_planks', { quantity: 6 })) {
            const logsCarried = bot.getInventoryItemQuantity('spruce_log');
            const logsNeeded = (bot.getInventoryItemQuantity('spruce_planks')) >= 2 ? 1 : 2;
            for (let i = logsCarried; i < logsNeeded; i++) {
                await gatherLog();
            }
            await bot.craftItem('spruce_planks', { quantity: logsNeeded });
        }
    }

    // This method gathers enough wood to craft two pickaxes
    // (crafting two at once is more efficient than waiting for the first to break before crafting the second)
    async function craftPickAxes() {

        // If the Bot doesn't have all the materials it needs to craft two pickaxes, then gather them now.
        await craftTable();
        await craftSticks();
        await craftPlanks();

        // Finally, craft the pickaxes
        // Locate a spot to place the craftingTable, place it, then stand next to it
        const ground = bot.findBlock('grass', {onlyFindTopBlocks: true, maxDistance: 20}) || bot.findBlock('dirt', { onlyFindTopBlocks: true, maxDistance: 20});
        await bot.placeBlock('crafting_table', ground);
        const placedTable = await bot.findBlock('crafting_table');
        await bot.approachBlock(placedTable);

        // Craft 2 pickaxes and equip one of them, then gather the crafting table
        await bot.craftItem('wooden_pickaxe', { quantity: 2, craftingTable: placedTable });
        await bot.holdItem('wooden_pickaxe');
        await bot.findAndDigBlock('crafting_table');
    }

    // When the Bot spawns, begin the main gathering loop.
    // Before collecting, have the Bot craft pickaxes if it has none.
    bot.on('spawn', async () => {
        bot.chat('Hello, I have arrived!');

        let oreCollected = bot.getInventoryItemQuantity('coal_ore');
        let applesCollected = bot.getInventoryItemQuantity('apple');
        
        // NOTE: This is an example of a score check.  In a real bot you likely wouldn't do this and would keep going until the match ends.
        while (oreCollected + applesCollected < 100) {
            if (!bot.inventoryContainsItem('_pickaxe', {partialMatch: true})) {
                // craft pickaxes if inventory doesn't have any
                await craftPickAxes();
            }
            await gatherCoal();
        }

        // Once the Bot has 100 points, announce it in the chat
        bot.chat(`I reached my goal! I have ${oreCollected} coal_ore and ${applesCollected} apples`);
    });

}

exports.configureBot = configureBot;
