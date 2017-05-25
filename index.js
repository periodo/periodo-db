var split = require('split2')
var to = require('to2')
var through = require('through2')
var pumpify = require('pumpify')
var duplexify = require('duplexify')
var hyperkv = require('hyperkv')
var hdi = require('hyperdrive-index')
var sub = require('subleveldown')
var bbox = require('geojson-bbox')
var once = require('once')
var overlap = require('bounding-box-overlap-test')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter

var tmpa = [[0,0],[0,0]]
var tmpb = [[0,0],[0,0]]
function overlapWsen (a, b) {
  tmpa[0][0] = a[0] // w
  tmpa[1][0] = a[1] // s
  tmpa[0][1] = a[2] // e
  tmpa[1][1] = a[3] // n
  tmpb[0][0] = b[0] // w
  tmpb[1][0] = b[1] // s
  tmpb[0][1] = b[2] // e
  tmpb[1][1] = b[3] // n
  return overlap(tmpa,tmpb)
}

module.exports = Query
inherits(Query, EventEmitter)

function Query (opts) {
  var self = this
  if (!(self instanceof Query)) return new Query(opts)
  self.db = opts.db
  self.log = opts.log
  self.kv = hyperkv({ db: self.db, log: self.log })
  self.kv.on('put', function (key, value) {
    self.emit('add', value)
  })
  self.archive = opts.archive
  self.bboxdb = sub(self.db, 'b', { valueEncoding: 'json' })
  self.drivedex = hdi({
    archive: self.archive,
    db: sub(self.db, 'd'),
    map: function (entry, cb) {
      if (!/^\/g\//.test(entry.name)) return cb()
      var ch = self.archive.checkout(entry.version)
      ch.readFile(entry.name, 'utf8', function (err, data) {
        if (err) return cb(err)
        try { var geodata = JSON.parse(data) }
        catch (err) { return cb(err) }
        var wsen = bbox(geodata)
        var id = entry.name.split('/')[2]
        self.bboxdb.put(id, wsen, cb)
      })
    }
  })
}

Query.prototype.list = function (opts) {
  var test = function () { return false }
  if (q && q.bbox) {
    return this._bboxList(q.bbox)
  } else if (!q) {
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
    through.obj(function (doc, enc, next) {
      var stream = this
      var pending = 1
      Object.keys(doc.values).forEach(function (key) {
        var row = doc.values[key].value
        if (check(row)) stream.push({ key: key, value: row })
      })
      if (--pending === 0) next()
    })
  )
  function check (row) {
    if (!row || !row.properties) return false
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
    return false
  }
}

Query.prototype._bboxList = function (wsen) {
  var self = this
  var dup = duplexify.obj()
  self.drivedex.ready(function () {
    var r = through.obj(write)
    dup.setReadable(r)
    dup.setWritable(r)
  })
  return pumpify.obj(
    self.kv.createReadStream({ gt: 'f/', lt: 'f/\uffff' }),
    dup
  )
  function write (doc, enc, next) {
    next = once(next)
    var stream = this
    var keys = Object.keys(doc.values)
    var pending = 1
    keys.forEach(function (key) {
      var row = doc.values[key].value
      if (row.features) {
        row.features.forEach(function (feat) {
          if (feat.geometry === undefined) return
          pending++
          self.bboxdb.get(String(feat.geometry), function (err, bbox) {
            if (err) return next(err)
            if (overlapWsen(wsen,bbox)) {
              stream.push({ key: key, value: row })
            }
            if (--pending === 0) next()
          })
        })
      } else if (row.geometry) {
        pending++
        self.bboxdb.get(String(row.geometry), function (err, bbox) {
          if (err) return next(err)
          if (overlapWsen(wsen,bbox)) {
            stream.push({ key: key, value: row })
          }
          if (--pending === 0) next()
        })
      }
    })
    if (--pending === 0) next()
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
      w.once('finish', function () {
        self.emit('add', row)
        next()
      })
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
