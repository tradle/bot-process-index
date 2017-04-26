const sub = require('subleveldown')
const indexMessages = require('@tradle/bot-index-messages')
const {
  typeforce,
  isPromise
} = require('@tradle/bots').utils

const processIndexed = require('./')
const NAMESPACE = {
  index: 'i',
  process: 'p'
}

const LEVEL_OPTS = { valueEncoding: 'utf8' }
const INDEX = 'r'

module.exports = function forwarder (opts) {
  return bot => install(bot, opts)
}

function install (bot, opts) {
  typeforce({
    db: typeforce.Object,
    map: typeforce.Function,
    label: typeforce.String
  }, opts)

  const { db, map, label } = opts
  const indexesDB = sub(db, NAMESPACE.index, LEVEL_OPTS)
  const processorDB = sub(db, NAMESPACE.process, LEVEL_OPTS)
  const indexer = bot.use(indexMessages({
    db: indexesDB,
    map
  }))

  const processor = bot.use(processIndexed({
    indexer,
    db: processorDB
  }))

  function uninstall () {
    indexer.uninstall()
    processor.uninstall()
  }

  function forward ({ toUserId, index, filter=skipOriginalSender }) {
    processor.process({
      label: `${label}:${toUserId}`,
      index,
      worker
    })

    function worker (wrapper) {
      const ret = filter({ toUserId, wrapper })
      return isPromise(ret) ? ret.then(maybeSend) : maybeSend(ret)

      function maybeSend (should) {
        if (should) {
          return bot.send({
            userId: toUserId,
            object: wrapper.message.object
          })
        }
      }
    }
  }

  return {
    uninstall,
    forward
  }
}

function skipOriginalSender ({ toUserId, wrapper }) {
  return toUserId !== wrapper.metadata.message.author
}
