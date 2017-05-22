# periodo-db

gazetteer database for [periodo](http://perio.do/) data

# example

``` js
var pdb = require('periodo-db')
var hyperdrive = require('hyperdrive')
var hyperlog = require('hyperlog')
var level = require('level')

var p = pdb({
  archive: hyperdrive('pdb.data'),
  db: level('pdb.db'),
  log: hyperlog(level('pdb.log'), { valueEncoding: 'json' })
})
process.stdin.pipe(p.load())
```

# data format

The import file format consists of lines of newline-separated json.

Each line of json should be geojson, except that Feature and FeatureCollections
refer to geometry by id instead of including the geometry inline.

This avoids huge amounts of data duplication.

# api

``` js
var pdb = require('periodo-db')
```

## var p = pdb(opts)

Create a new periodo-db instance `p` from:

* `opts.archive` - [hyperdrive archive][1]
* `opts.db` - [levelup instance][2]
* `opts.log` - [hyperlog instance][3]

[1]: https://npmjs.com/package/hyperdrive
[2]: https://npmjs.com/package/levelup
[3]: https://npmjs.com/package/hyperlog

## var wstream = p.load()

Import data with the writable stream `wstream`.

The data should be formatted according to the `data format` section above.

## var rstream = p.list(q)

* `q` - search labels using this search value
* `q.bbox` - `[west,south,east,north]` bounding box to limit query

If the search value is a...

* string - every word in the string must be present in the labels
* function(s) - return true or false if the label text `s` matches
* regex - matches label text

## var rstream = p.geometry(id)

Load geojson geometry by `id` with the readable stream `rstream`.

# install

npm install periodo-db

# license

public domain
