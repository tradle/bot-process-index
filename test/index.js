
const memdb = require('memdb')
const test = require('tape')
const {
  loudCo,
  fakeWrapper
} = require('@tradle/bots/test/utils')

const bots = require('@tradle/bots')
const {
  Promise,
  co,
  createSimpleMessage,
  omit
} = bots.utils

const { SIG } = bots.constants
const indexMessages = require('@tradle/bot-index-messages')
const processIndexed = require('../')
const createForwarder = require('../forward')
const forwardContext = require('../forward-context')

test('basic', loudCo(function* (t) {
  const sent = fakeWrapper({
    from: 'bill',
    to: 'ted',
    object: {
      _t: 'something',
      hey: 'ho'
    }
  })

  const bot = bots.bot({
    inMemory: true,
    send: function () {
      return Promise.resolve(sent)
    }
  })

  const userId = 'bill'
  const db = memdb()
  const indexer = bot.use(indexMessages({
    db,
    map: function indexSentReceived ({ user, wrapper }) {
      return [
        wrapper.metadata.message.inbound ? 'received' : 'sent'
      ]
    }
  }))

  bot.send({
    userId: userId,
    object: `hey ${userId}`
  })

  bot.receive(fakeWrapper({
    from: 'bill',
    to: 'ted',
    object: createSimpleMessage('hey')
  }))

  yield Promise.all([
    promiseEvent('sent'),
    promiseEvent('message')
  ])

  const processorDB = memdb()
  const processed = []

  let rounds = 0
  const again = co(function* () {
    const processor = bot.use(processIndexed({ indexer, db: processorDB }))
    const sentProcessor = yield processor.process({
      label: 'dostuff',
      index: 'sent',
      worker: function (wrapper) {
        return new Promise(resolve => {
          processed.push(wrapper)
          resolve()
        })
      }
    })

    sentProcessor.onLive(function () {
      // make sure it's not processed twice
      t.same(processed, [sent])
      if (++rounds === 2) {
        return t.end()
      }

      processor.uninstall()
      again()
    })
  })

  again()

  function promiseEvent (event) {
    return new Promise(resolve => bot.once(event, resolve))
  }
}))

test('forward', loudCo(function* (t) {
  const botName = 'ted'
  const willForward = createSimpleMessage('hey')
  const wontForward = createSimpleMessage('ho')
  const forwardTo = {
    rufus: [],
    missy: []
  }

  const INDEX = 'received'
  const bot = bots.bot({
    inMemory: true,
    send: function ({ userId, object }) {
      t.ok(object[SIG])
      t.same(omit(object, [SIG]), willForward)
      t.ok(userId in forwardTo)
      t.equal(forwardTo[userId].length, 0)
      forwardTo[userId].push(object)

      const done = Object.keys(forwardTo).every(userId => forwardTo[userId].length === 1)
      if (done) t.end()

      return new Promise(resolve => {
        // hang
      })
    }
  })

  const db = memdb()
  const forwarder = bot.use(createForwarder({
    db,
    label: 'forwardreceived',
    map: function ({ user, wrapper }) {
      return wrapper.metadata.message.inbound && INDEX
    }
  }))

  Object.keys(forwardTo).forEach(toUserId => {
    forwarder.forward({
      index: INDEX,
      toUserId,
      filter: function ({ toUserId, wrapper }) {
        // only forward messages from 'bill'
        return wrapper.metadata.message.author === 'bill'
      }
    })
  })

  bot.receive(fakeWrapper({
    from: 'joe',
    to: botName,
    object: wontForward
  }))

  bot.receive(fakeWrapper({
    from: 'bill',
    to: botName,
    object: willForward
  }))
}))

test('forward context', loudCo(function* (t) {
  const botName = 'ted'
  const willForward = createSimpleMessage('hey')
  const wontForward = createSimpleMessage('ho')
  const forwardTo = 'rufus'
  const bot = bots.bot({
    inMemory: true,
    send: function ({ userId, object }) {
      t.ok(object[SIG])
      t.same(omit(object, [SIG]), willForward)
      t.equal(userId, forwardTo)
      t.end()
      return new Promise(resolve => {
        // hang
      })
    }
  })

  const db = memdb()
  const forwarder = bot.use(forwardContext({
    db,
    getContext: function ({ user, wrapper }) {
      return wrapper.message.context
    }
  }))

  forwarder.forward({
    toUserId: forwardTo,
    context: 'b'
  })

  bot.receive(wrapWithContext({
    from: 'joe',
    to: botName,
    object: wontForward,
    context: 'a'
  }))

  bot.receive(wrapWithContext({
    from: 'bill',
    to: botName,
    object: willForward,
    context: 'b'
  }))
}))

function wrapWithContext ({ from, to, object, context }) {
  const wrapper = fakeWrapper({ from, to, object })
  wrapper.message.context = context
  // wrapper.metadata.message.context = context
  return wrapper
}
