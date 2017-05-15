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
var geoid = 1
var geometries = {}

process.stdin
  .pipe(parse(['periodCollections',true,'definitions',true]))
  .pipe(through.obj(function (def, enc, next) {
    var stream = this
    next = once(next)
    if (!def.spatialCoverage) return next()
    var pending = 1
    var geoids = []
    def.spatialCoverage.forEach(function (sp) {
      if (!sp.label) return
      if (geometries.hasOwnProperty(sp.label)) {
        geoids.push(geometries[sp.label])
        return
      }
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
        geoids.push(geoid)
        geometries[sp.label] = geoid
        stream.push(JSON.stringify({
          type: 'Feature',
          properties: { id: geoid++ },
          geometry: jdata.geometry
        }) + '\n')
        if (--pending === 0) push()
      })
    })
    if (--pending === 0) push()

    function push () {
      var ref = {
        type: geoids.length === 1 ? 'Feature' : 'FeatureCollection',
        properties: {
          id: def.id,
          label: def.label,
          localizedLabels: def.localizedLabels,
          start: def.start,
          stop: def.stop
        },
      }
      if (geoids.length === 1) ref.geometry = geoids[0]
      else {
        ref.features = geoids.map(function (gid) {
          return { type: 'Feature', geometry: gid }
        })
      }
      next(null, JSON.stringify(ref) + '\n')
    }
  }))
  .pipe(process.stdout)

function lc (s) { return (s || '').toLowerCase() }
