var pquery = require('../')
var hyperdrive = require('hyperdrive')
var hyperlog = require('hyperlog')
var level = require('level')
var to = require('to2')

var pq = pquery({
  archive: hyperdrive('pq.data'),
  db: level('pq.db'),
  log: hyperlog(level('pq.log'), { valueEncoding: 'json' })
})
pq.list({ bbox: process.argv.slice(2).map(Number) })
  .pipe(to.obj(function (row, enc, next) {
    console.log(row.value)
    next()
  }))
