var pdb = require('../')
var hyperdrive = require('hyperdrive')
var hyperlog = require('hyperlog')
var level = require('level')
var to = require('to2')

var p = pdb({
  archive: hyperdrive('pq.data'),
  db: level('pq.db'),
  log: hyperlog(level('pq.log'), { valueEncoding: 'json' })
})
p.geometry(process.argv[2]).pipe(process.stdout)
