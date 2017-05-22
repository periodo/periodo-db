var split = require('split2')
var to = require('to2')
var through = require('through2')
var pumpify = require('pumpify')
var hyperkv = require('hyperkv')
var sub = require('subleveldown')

module.exports = Query

function Query (opts) {
  if (!(this instanceof Query)) return new Query(opts)
  this.db = opts.db
  this.log = opts.log
  this.kv = hyperkv({ db: this.db, log: this.log })
  this.archive = opts.archive
}

Query.prototype.list = function (q) {
  var test = function () { return false }
  if (!q) {
    test = function () { return true }
  } else if (q && typeof q.test === 'function') {
    test = function (s) { return q.test(s) }
  } else if (typeof q === 'function') {
    test = q
  } else {
    var words = String(q).toLowerCase().split(/\W+/)
    test = function (s) {
      s = s.toLowerCase()
      for (var i = 0; i < words.length; i++) {
        if (s.indexOf(words[i]) < 0) return false
      }
      return true
    }
  }
  return pumpify.obj(
    this.kv.createReadStream({ gt: 'f/', lt: 'f/\uffff' }),
    through.obj(function (row, enc, next) {
      if (check(row)) next(null, row)
      else next()
    })
  )
  function check (doc) {
    var keys = Object.keys(doc.values)
    for (var j = 0; j < keys.length; j++) {
      var row = doc.values[keys[j]].value
      if (!row || !row.properties) continue
      if (row.properties.label && test(row.properties.label)) return true
      if (row.properties.localizedLabels) {
        var lkeys = Object.keys(row.properties.localizedLabels)
        var len = lkeys.length
        for (var i = 0; i < len; i++) {
          var lb = row.properties.localizedLabels[lkeys[i]]
          if (Array.isArray(lb)) {
            for (var k = 0; k < lb.length; k++) {
              if (test(lb[k])) return true
            }
          } else if (test(lb)) return true
        }
      }
    }
    return false
  }
}

Query.prototype.load = function () {
  var self = this
  return pumpify(split(), to.obj(write))
  function write (buf, enc, next) {
    try { var row = JSON.parse(buf.toString()) }
    catch (err) { return next(err) }
    if (!row.properties || row.properties.id === undefined) return next()
    if (typeof row.geometry === 'object') {
      var w = self.archive.createWriteStream('g/' + row.properties.id)
      w.once('finish', function () { next() })
      w.once('error', next)
      w.end(JSON.stringify(row.geometry))
    } else {
      var key = 'f/' + row.properties.id
      self.kv.put(key, row, function (err, node) {
        if (err) next(err)
        else next()
      })
    }
  }
}

Query.prototype.geometry = function (n) {
  return this.archive.createReadStream('g/' + n)
}
