const {
  Promise,
  isPromise,
  co,
  promisifyAll,
  typeforce
} = require('@tradle/bots').utils

const debug = require('debug')(require('./package').name)
const _sub = require('subleveldown')
const sub = (...args) => promisifyAll(_sub(...args))
const processFeed = require('level-change-processor')
const LEVEL_OPTS = { valueEncoding: 'utf8' }
const NAMESPACE = {
  switches: 's',
  states: 't'
}

const SEPARATOR = '!'

module.exports = function processIndexes (opts) {
  return bot => install(bot, opts)
}

function install (bot, opts) {
  const { db, indexer } = opts
  const switches = sub(db, NAMESPACE.switches, LEVEL_OPTS)
  const states = sub(db, NAMESPACE.states, LEVEL_OPTS)
  let processing = {}

  const processIndex = co(function* (opts) {
    typeforce({
      label: typeforce.String,
      index: typeforce.String,
      worker: typeforce.Function
    }, opts)

    const { label, index, worker } = opts
    const key = getKey({ label, index })
    yield switches.putAsync(key, true)

    if (!processing[key]) {
      processing[key] = processFeed({
        // state db for the processing of this particular feed
        // for this particular label
        db: sub(states, key, LEVEL_OPTS),
        feed: indexer.feed(index),
        worker: wrapWorker(worker)
      })
    }

    return processing[key]
  })

  function stopProcessingIndex ({ label, index }) {
    const key = getKey({ label, index })
    if (processing[key]) {
      processing[key].destroy()
      delete processing[key]
    }

    return switches.delAsync(key)
  }

  function uninstall () {
    for (let key in processing) {
      processing[key].destroy()
    }

    processing = {}
  }

  function wrapWorker (worker) {
    return co(function* (data, cb) {
      const { change, value } = data
      const { userId, index } = value
      const item = yield bot.users.history.get({ userId, index })
      try {
        const ret = worker(item)
        if (isPromise(ret)) yield ret
      } catch (err) {
        debug('failed to process item, stalling processor', err)
        yield new Promise(resolve => {
          // stall
        })
      }

      cb()
    })
  }

  return {
    uninstall,
    process: processIndex,
    stopProcessing: stopProcessingIndex
  }
}

function getKey ({ label, index }) {
  if (label.indexOf(SEPARATOR) !== -1) {
    throw new Error(`"label" must not contain ${SEPARATOR}`)
  }

  return `${label}${SEPARATOR}${index}`
}

function parseKey (key) {
  const idx = key.indexOf('!')
  return {
    label: key.slice(0, idx),
    index: key.slice(idx + SEPARATOR.length)
  }
}
