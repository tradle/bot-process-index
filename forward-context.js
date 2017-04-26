const createForwarder = require('./forward')

module.exports = function contextForwarder (opts) {
  return bot => install(bot, opts)
}

function install (bot, opts) {
  const { db, getContext, label='context' } = opts

  const forwarder = bot.use(createForwarder({
    db,
    label,
    map: getContext
  }))

  const { uninstall } = forwarder

  function forward ({ toUserId, context }) {
    return forwarder.forward({ toUserId, index: context })
  }

  return {
    uninstall,
    forward
  }
}
