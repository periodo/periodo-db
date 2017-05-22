var split = require('split2')
var to = require('to2')
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
