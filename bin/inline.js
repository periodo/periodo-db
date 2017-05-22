var parse = require('jsonstream').parse
var through = require('through2')
var fs = require('fs')
var path = require('path')
var once = require('once')
var shasum = require('shasum')
var minimist = require('minimist')
var argv = minimist(process.argv.slice(2), {
  alias: { d: 'datadir' }
})

process.stdin
  .pipe(parse(['periodCollections',true,'definitions',true]))
  .pipe(through.obj(function (def, enc, next) {
    next = once(next)
    if (!def.spatialCoverage) return next()
    var pending = 1
    var geo = []
    def.spatialCoverage.forEach(function (sp) {
      if (!sp.label) return
      var hash = shasum(String(sp.label).toLowerCase())
      var parts = [hash.slice(0,2),hash.slice(2,4),hash.slice(4)]
      var file = path.resolve(argv.datadir, parts.join('/') + '.json')
      pending++
      fs.readFile(file, 'utf8', function (err, data) {
        if (err) {
          if (--pending === 0) push()
          return
        }
        try { var jdata = JSON.parse(data) }
        catch (err) { return next(err) }
        geo.push(jdata.geometry)
        if (--pending === 0) push()
      })
    })
    if (--pending === 0) push()

    function push () {
      var ref = {
        type: geo.length === 1 ? 'Feature' : 'FeatureCollection',
        properties: {
          id: def.id,
          label: def.label,
          localizedLabels: def.localizedLabels,
        },
      }
      if (geo.length === 1) ref.geometry = geo[0]
      else {
        ref.features = geo.map(function (g) {
          return { type: 'Feature', geometry: g }
        })
      }
      next(null, JSON.stringify(ref) + '\n')
    }
  }))
  .pipe(process.stdout)

function lc (s) { return (s || '').toLowerCase() }
