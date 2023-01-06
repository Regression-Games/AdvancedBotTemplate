# Regression Games Bot Template

This template demonstrates how to use advanced features of the [rg-bot package](https://www.npmjs.com/package/rg-bot) to create
a bot for the Regression Games: Ultimate Collector challenge.  
_Not sure what this is? Visit https://regression.gg for some programming fun!_

## Minimum Requirements for Regression Games

Every bot must have an `index.js` file with the following code:

```javascript
const RGBot = require("rg-bot").RGBot;

/**
 * @param {RGBot} bot
 */
function configureBot(bot) {
  // Bot logic here
}

exports.configureBot = configureBot
```

This defines a `configureBot` function and exposes that function to Regression Games.
Regression Games uses it as an entrypoint to your bot script, and passes a bot for you to interact with.

Here is an example of the `configureBot` function with some basic logic that will make your bot parrot back
anything it sees in chat from other players.

```javascript
function configureBot(bot) {

  // Every time a player says something in the game, 
  // do something with that player's username and their message
  bot.on('chat', (username, message) => { 
  
      // If the username of the speaker is equal to the username of this bot, 
      // don't do anything else. This is because we don't want the bot to repeat 
      // something that it says itself, or else it will spam the chat and be 
      // kicked from the game!
      if (username === bot.username()) return
      
      // make the bot chat with the same message the other player sent
      bot.chat("This is what I heard: " + message)
  })
  
}

exports.configureBot = configureBot
```