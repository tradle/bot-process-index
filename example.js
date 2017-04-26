
const memdb = require('memdb')
const sentiment = require('sentiment')
const forwardContext = require('./forward-context')
const bots = require('@tradle/bots')
const { TYPE } = bots.constants

// ...
// const bot = bots.bot({ ... })

const forwarder = bot.use(forwardContext({
  db: memdb(),
  getContext: function ({ user, wrapper }) {
    if (wrapper.message._t === 'tradle.SimpleMessage') {
      const result = sentiment(wrapper.message.message).comparative
      return result > 0 ? 'positive' : 'negative'
    }
  }
}))

// forward positive messages to a sad person
forwarder.forward({
  context: 'positive',
  toUserId: sadPersonId
})
